import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  adrIdFromFileName,
  AdrSchema,
  applyDecision,
  applyOperation,
  applyUndo,
  compareAdrIds,
  DecisionError,
  isMadrFileName,
  issueMessage,
  parseCollection,
  parseMadr,
  parseMadrStrict,
  readStatus,
  snapshotOf,
  STATUSES,
} from '../src/index.ts';

const examplesDir = fileURLToPath(new URL('../../../examples/decisions/', import.meta.url));
const examples = readdirSync(examplesDir)
  .filter(isMadrFileName)
  .sort()
  .map((name) => ({ name, content: readFileSync(`${examplesDir}${name}`, 'utf8') }));
const example = (name: string): string => examples.find((file) => file.name === name)!.content;

const NOW = new Date('2026-10-06T08:30:00Z');

const madr = (frontmatter: string, body: string): string => `---\n${frontmatter}\n---\n\n${body}`;

describe('file names', () => {
  it('derives the ADR ID from the MADR number', () => {
    expect(adrIdFromFileName('0007-use-postgres.md')).toBe('ADR-0007');
    expect(adrIdFromFileName('README.md')).toBeNull();
    expect(isMadrFileName('0001-a.md')).toBe(true);
    expect(isMadrFileName('template.md')).toBe(false);
    expect(['ADR-0010', 'ADR-0002'].sort(compareAdrIds)).toEqual(['ADR-0002', 'ADR-0010']);
  });
});

describe('statuses', () => {
  it.each([
    ['proposed', 'à décider'],
    ['Accepted', 'validée'],
    ['rejected', 'refusée'],
    ['deferred', 'reportée'],
    ['deprecated', 'obsolète'],
    ['validée', 'validée'],
  ] as const)('reads %s as %s', (raw, status) => {
    expect(readStatus(raw)).toMatchObject({ status, known: true });
  });

  it('reads the superseding ADR from the status', () => {
    expect(readStatus('superseded by ADR-0005')).toEqual({ status: 'remplacée', replacedBy: 'ADR-0005', known: true });
    expect(readStatus('superseded by [ADR-0012](0012-x.md)')).toMatchObject({ replacedBy: 'ADR-0012' });
    expect(readStatus('remplacée par 0003-cache.md')).toMatchObject({ status: 'remplacée', replacedBy: 'ADR-0003' });
  });

  it('treats a missing status as proposed and flags unknown values', () => {
    expect(readStatus(null)).toMatchObject({ status: 'à décider', known: true });
    expect(readStatus('maybe')).toMatchObject({ status: 'à décider', known: false });
  });
});

describe('examples', () => {
  it('parses every example without issue and matches the Zod schema', () => {
    for (const { name, content } of examples) {
      const { adr, issues } = parseMadr(content, name);
      expect(issues, name).toEqual([]);
      expect(AdrSchema.safeParse(adr).success, name).toBe(true);
    }
  });

  it('covers every status', () => {
    const statuses = new Set(examples.map(({ name, content }) => parseMadrStrict(content, name).status));
    expect(statuses).toEqual(new Set(STATUSES));
  });
});

describe('parseMadr', () => {
  it('reads metadata, context, options and their pros and cons', () => {
    const adr = parseMadrStrict(example('0001-file-de-messages.md'), '0001-file-de-messages.md');
    expect(adr).toMatchObject({
      id: 'ADR-0001',
      title: 'Choix de la file de messages',
      status: 'validée',
      tags: ['backend', 'infra'],
      deciders: ['Eloi', 'Marie'],
      date: '2026-10-05',
      language: 'en',
    });
    expect(adr.propositions.map((proposition) => proposition.title)).toEqual(['PostgreSQL comme file (pg-boss)', 'RabbitMQ']);
    expect(adr.propositions[0]).toMatchObject({
      body: 'Réutilise la base existante, pas de nouveau service.',
      pros: ['zéro infra en plus, transactions partagées'],
      cons: ['débit limité au-delà de quelques milliers de jobs/min'],
    });
    expect(adr.decision).toEqual({
      status: 'validée',
      retained: ['P1'],
      date: '2026-10-05',
      nextReview: null,
      replacedBy: null,
      comment: 'suffisant pour nos volumes ; on réévalue à 5 000 jobs/min',
    });
  });

  it('reads several chosen options', () => {
    expect(parseMadrStrict(example('0008-drizzle.md'), '0008-drizzle.md').decision?.retained).toEqual(['P1', 'P3']);
  });

  it('reads French headings and arguments', () => {
    const adr = parseMadrStrict(example('0006-identifiants.md'), '0006-identifiants.md');
    expect(adr.language).toBe('fr');
    expect(adr.context).toContain('auto-incrémentés');
    expect(adr.propositions[2]).toMatchObject({ title: 'Identifiants préfixés (usr_…)', body: 'Inspiré des API Stripe.', pros: ['le type de ressource est lisible'] });
  });

  it('keeps the option named in a proposed ADR as a recommendation', () => {
    const adr = parseMadrStrict(example('0003-authentification.md'), '0003-authentification.md');
    expect(adr.status).toBe('à décider');
    expect(adr.decision).toBeNull();
    expect(adr.recommended).toEqual(['P1']);
    expect(adr.rationale).toBe('le mesh est déjà déployé sur tous les clusters');
  });

  it('reads deferred and superseded decisions', () => {
    expect(parseMadrStrict(example('0005-observabilite.md'), '0005-observabilite.md').decision).toMatchObject({
      status: 'reportée',
      nextReview: '2026-11-15',
      comment: 'attendre les devis des deux éditeurs',
    });
    expect(parseMadrStrict(example('0007-orm.md'), '0007-orm.md').decision).toMatchObject({ status: 'remplacée', replacedBy: 'ADR-0008' });
  });

  it('accepts a file without front matter and ignores HTML comments', () => {
    const { adr, issues } = parseMadr('# Titre\n\n## Context and Problem Statement\n\n<!-- optional -->\nTexte.\n\n## Considered Options\n\n* A\n* B\n', '0012-x.md');
    expect(issues).toEqual([]);
    expect(adr).toMatchObject({ status: 'à décider', context: 'Texte.', rawStatus: null });
  });

  it('does not read headings inside code fences', () => {
    const { adr } = parseMadr('# T\n\n## Context\n\n```md\n## Considered Options\n* faux\n```\n\n## Considered Options\n\n* Vrai\n', '0001-t.md');
    expect(adr?.propositions.map((proposition) => proposition.title)).toEqual(['Vrai']);
  });

  it('reports errors and warnings with line numbers', () => {
    const untitled = parseMadr('Pas de titre\n', '0001-x.md');
    expect(untitled.adr).toBeNull();
    expect(untitled.issues[0]).toMatchObject({ line: 1, severity: 'error' });
    expect(parseMadr('# T\n', 'notes.md').adr).toBeNull();
    expect(parseMadr('---\nstatus: [oops\n---\n# T\n', '0001-x.md').issues[0]).toMatchObject({ severity: 'error' });
    const unknown = parseMadr(madr('date: 2026-01-01\nstatus: maybe', '# T\n\n## Considered Options\n\n* A\n'), '0001-x.md');
    expect(unknown.adr?.status).toBe('à décider');
    expect(unknown.issues).toEqual([
      { line: 3, severity: 'warning', code: 'unknownStatus', params: { status: 'maybe' }, message: 'Unknown status "maybe": read as "proposed".' },
    ]);
    expect(issueMessage(unknown.issues[0]!, 'fr')).toBe('Statut inconnu « maybe » : lu comme « à décider ».');
    expect(issueMessage(unknown.issues[0]!, 'es')).toBe('Estado desconocido «maybe»: se lee como «por decidir».');
    expect(parseMadr('# T\n', '0001-x.md').issues[0]?.code).toBe('noOptions');
  });
});

describe('applyDecision', () => {
  const name = '0002-cache-http.md';
  const source = example(name);

  it('writes the status, the date and the outcome sentence and leaves everything else untouched', () => {
    const next = applyDecision(source, name, { status: 'validée', retained: ['P2', 'P1'], comment: 'les deux se complètent', nextReview: null, replacedBy: null }, NOW);
    expect(next).toContain('status: accepted\ndate: 2026-10-06\n');
    expect(next).toContain(
      '## Decision Outcome\n\nChosen options: "Cache applicatif Redis" and "CDN avec stale-while-revalidate", because les deux se complètent.\n\n## Pros and Cons of the Options',
    );
    const adr = parseMadrStrict(next, name);
    expect(adr.decision).toMatchObject({ status: 'validée', retained: ['P1', 'P2'], date: '2026-10-06', comment: 'les deux se complètent' });
    // Only the front matter lines and the new section differ.
    const removed = source.split('\n').filter((line) => !next.split('\n').includes(line));
    expect(removed).toEqual(['status: proposed', 'date: 2026-09-20']);
  });

  it('replaces the lead of an existing outcome but keeps its subsections', () => {
    const file = '0001-file-de-messages.md';
    const next = applyDecision(example(file), file, { status: 'refusée', retained: [], comment: null, nextReview: null, replacedBy: null }, NOW);
    expect(next).toContain('## Decision Outcome\n\nRejected: no option chosen.\n\n### Consequences');
    expect(parseMadrStrict(next, file).decision).toMatchObject({ status: 'refusée', retained: [], comment: null });
  });

  it('writes the next review of a deferred decision and removes it afterwards', () => {
    const deferred = applyDecision(source, name, { status: 'reportée', retained: [], comment: 'attendre les mesures', nextReview: '2026-11-01', replacedBy: null }, NOW);
    expect(deferred).toContain('status: deferred\ndate: 2026-10-06\nnext-review: 2026-11-01\n');
    expect(parseMadrStrict(deferred, name).decision).toMatchObject({ nextReview: '2026-11-01', comment: 'attendre les mesures' });
    const accepted = applyDecision(deferred, name, { status: 'validée', retained: ['P3'], comment: null, nextReview: '2026-11-01', replacedBy: null }, NOW);
    expect(accepted).not.toContain('next-review');
    expect(accepted).toContain('Chosen option: "Statu quo et optimisation SQL".');
  });

  it('writes the sentence in French for a French file and keeps quoted values quoted', () => {
    const file = '0006-identifiants.md';
    const quoted = example(file).replace('status: proposed', 'status: "proposed"');
    const next = applyDecision(quoted, file, { status: 'validée', retained: ['P1'], comment: 'standard', nextReview: null, replacedBy: null }, NOW);
    expect(next).toContain('status: "accepted"');
    expect(next).toContain('## Décision\n\nOption retenue : « UUID v7 », car standard.\n\n## Avantages et inconvénients des options');
  });

  it('creates the front matter and the outcome section when missing', () => {
    const bare = '# T\n\n## Considered Options\n\n* A\n* B\n';
    const next = applyDecision(bare, '0001-t.md', { status: 'validée', retained: ['P2'], comment: null, nextReview: null, replacedBy: null }, NOW);
    expect(next).toBe('---\nstatus: accepted\ndate: 2026-10-06\n---\n\n# T\n\n## Considered Options\n\n* A\n* B\n\n## Decision Outcome\n\nChosen option: "B".\n');
  });

  it('requires a proposition to validate and rejects unknown ones', () => {
    expect(() => applyDecision(source, name, { status: 'validée', retained: [], comment: null, nextReview: null, replacedBy: null }, NOW)).toThrow(DecisionError);
    expect(() => applyDecision(source, name, { status: 'validée', retained: ['P9'], comment: null, nextReview: null, replacedBy: null }, NOW)).toThrow(/P9/u);
  });

  it('keeps CRLF line endings', () => {
    const crlf = source.replace(/\n/gu, '\r\n');
    const next = applyDecision(crlf, name, { status: 'refusée', retained: [], comment: null, nextReview: null, replacedBy: null }, NOW);
    expect(next.replace(/\r\n/gu, '')).not.toContain('\n');
  });
});

describe('applyUndo', () => {
  it.each(examples.map(({ name }) => name))('restores %s byte for byte', (name) => {
    const source = example(name);
    const adr = parseMadrStrict(source, name);
    const input = adr.propositions.length > 0
      ? { status: 'validée' as const, retained: ['P1'], comment: 'essai', nextReview: null, replacedBy: null }
      : { status: 'refusée' as const, retained: [], comment: null, nextReview: null, replacedBy: null };
    const decided = applyDecision(source, name, input, NOW);
    expect(decided).not.toBe(source);
    expect(applyUndo(decided, snapshotOf(source))).toBe(source);
  });

  it('removes a front matter and a section created by the decision', () => {
    const bare = '# T\n\nIntro.\n\n## Considered Options\n\n* A\n';
    const decided = applyDecision(bare, '0001-t.md', { status: 'validée', retained: ['P1'], comment: null, nextReview: null, replacedBy: null }, NOW);
    expect(applyUndo(decided, snapshotOf(bare))).toBe(bare);
  });

  it('replays operations', () => {
    const name = '0004-monorepo.md';
    const source = example(name);
    const at = NOW.toISOString();
    const decided = applyOperation(source, name, { kind: 'decide', adrId: 'ADR-0004', input: { status: 'reportée', retained: [], comment: null, nextReview: null, replacedBy: null }, at });
    expect(parseMadrStrict(decided, name).status).toBe('reportée');
    expect(applyOperation(decided, name, { kind: 'undo', adrId: 'ADR-0004', restore: snapshotOf(source), at })).toBe(source);
  });
});

describe('parseCollection', () => {
  it('orders ADRs by number and leaves out duplicates and broken files', () => {
    const { adrs, issues } = parseCollection([
      { name: '0010-b.md', content: '# B\n' },
      { name: '0002-a.md', content: '# A\n\n## Considered Options\n\n* X\n' },
      { name: '0002-dup.md', content: '# Dup\n\n## Considered Options\n\n* X\n' },
      { name: '0003-broken.md', content: 'no title\n' },
    ]);
    expect(adrs.map((adr) => adr.id)).toEqual(['ADR-0002', 'ADR-0010']);
    expect(issues.map((entry) => entry.file)).toEqual(['0002-dup.md', '0003-broken.md', '0010-b.md']);
    expect(issues[0]?.issues[0]?.message).toBe('Number ADR-0002 already used by 0002-a.md.');
  });

  it('links superseded ADRs to their replacement and flags missing targets', () => {
    const superseded = (target: string): string => `---\nstatus: superseded by ${target}\n---\n\n# Old\n`;
    const { replaces, issues } = parseCollection([
      { name: '0001-old.md', content: superseded('ADR-0003') },
      { name: '0002-older.md', content: superseded('ADR-0003') },
      { name: '0003-new.md', content: '# New\n\n## Considered Options\n\n* A\n' },
      { name: '0004-orphan.md', content: superseded('ADR-0099') },
    ]);
    expect(replaces).toEqual({ 'ADR-0003': ['ADR-0001', 'ADR-0002'] });
    const orphan = issues.find((entry) => entry.file === '0004-orphan.md')?.issues ?? [];
    expect(orphan).toContainEqual(expect.objectContaining({ line: 1, severity: 'warning', code: 'missingReplacement', message: 'Superseded by ADR-0099, which is not in the directory.' }));
    expect(orphan.map((issue) => issueMessage(issue, 'fr'))).toContain('Remplacée par ADR-0099, introuvable dans le dossier.');
  });

  it('links the examples', () => {
    expect(parseCollection(examples).replaces).toEqual({ 'ADR-0008': ['ADR-0007'] });
  });
});
