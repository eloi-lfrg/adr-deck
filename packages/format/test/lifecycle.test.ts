import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  adrIdFromFileName,
  applyDecision,
  applyRework,
  applySupersedes,
  applyUndo,
  categoryOf,
  DecisionError,
  findSimilarAdrs,
  isMadrFileName,
  isMadrPath,
  lintMadr,
  nextAdrNumber,
  outcomeParts,
  parseCollection,
  parseMadrStrict,
  reworkActions,
  serializeMadr,
  draftFromAdr,
  snapshotOf,
  type DecisionInput,
} from '../src/index.ts';

const examplesDir = fileURLToPath(new URL('../../../examples/decisions/', import.meta.url));
const examples = readdirSync(examplesDir)
  .filter(isMadrFileName)
  .sort()
  .map((name) => ({ name, content: readFileSync(`${examplesDir}${name}`, 'utf8') }));
const example = (name: string): string => examples.find((file) => file.name === name)!.content;

const NOW = new Date('2026-10-06T08:30:00Z');
const decision = (input: Partial<DecisionInput> & Pick<DecisionInput, 'status'>): DecisionInput => ({ retained: [], comment: null, nextReview: null, replacedBy: null, ...input });

const ACCEPTED = `---
status: accepted
date: 2026-01-10
decision-makers: Marie
---

# Use PostgreSQL

## Context and Problem Statement

We need a database.

## Considered Options

* PostgreSQL
* MySQL

## Decision Outcome

Chosen option: "PostgreSQL", because the team knows it.

### Consequences

* Good, because one engine to run.

### Confirmation

Checked in the architecture review.

## Pros and Cons of the Options

### PostgreSQL

* Good, because mature
* Neutral, because no license cost difference
* Bad, because heavier

### MySQL

* Good, because simple
`;

describe('category folders', () => {
  it('reads the ADR ID and the category of a nested file', () => {
    expect(adrIdFromFileName('backend/0012-cache.md')).toBe('ADR-0012');
    expect(categoryOf('backend/0012-cache.md')).toBe('backend');
    expect(categoryOf('ui/forms/0013-x.md')).toBe('ui/forms');
    expect(categoryOf('0012-cache.md')).toBeNull();
  });

  it('accepts safe relative paths only', () => {
    expect(isMadrPath('0001-a.md')).toBe(true);
    expect(isMadrPath('backend/0001-a.md')).toBe(true);
    expect(isMadrPath('a/b/0001-a.md')).toBe(true);
    expect(isMadrPath('a/b/c/0001-a.md')).toBe(false);
    expect(isMadrPath('../0001-a.md')).toBe(false);
    expect(isMadrPath('.git/0001-a.md')).toBe(false);
    expect(isMadrPath('/etc/0001-a.md')).toBe(false);
    expect(isMadrPath('backend/readme.md')).toBe(false);
  });

  it('numbers ADRs and reports duplicates across folders', () => {
    expect(nextAdrNumber(['0001-a.md', 'backend/0007-b.md', 'ui/0003-c.md'])).toBe(8);
    const file = (title: string): string => `# ${title}\n\n## Considered Options\n\n* A\n`;
    const collection = parseCollection([
      { name: 'backend/0001-a.md', content: file('A') },
      { name: 'ui/0001-b.md', content: file('B') },
      { name: 'ui/0002-c.md', content: file('C') },
    ]);
    expect(collection.adrs.map((adr) => adr.file)).toEqual(['backend/0001-a.md', 'ui/0002-c.md']);
    expect(collection.issues).toEqual([{ file: 'ui/0001-b.md', issues: [expect.objectContaining({ code: 'duplicateNumber' })] }]);
  });
});

describe('MADR 4 details', () => {
  it('reads neutral arguments and writes them back between Good and Bad', () => {
    const adr = parseMadrStrict(ACCEPTED, '0001-use-postgresql.md');
    expect(adr.propositions[0]).toMatchObject({ pros: ['mature'], neutral: ['no license cost difference'], cons: ['heavier'] });
    const written = serializeMadr(draftFromAdr(adr));
    expect(written).toContain('* Good, because mature\n* Neutral, because no license cost difference\n* Bad, because heavier');
    expect(parseMadrStrict(written, '0001-use-postgresql.md').propositions[0]!.neutral).toEqual(['no license cost difference']);
  });

  it('splits the consequences and the confirmation of the outcome', () => {
    const parts = outcomeParts(parseMadrStrict(ACCEPTED, '0001-x.md'));
    expect(parts.consequences).toBe('* Good, because one engine to run.');
    expect(parts.confirmation).toBe('Checked in the architecture review.');
    expect(parts.others).toEqual([]);
  });
});

describe('supersede and deprecate', () => {
  it('keeps the decision and its date, and notes the change in More Information', () => {
    const next = applyDecision(ACCEPTED, '0001-x.md', decision({ status: 'obsolète', comment: 'we moved to a managed service' }), NOW);
    expect(next).toContain('status: deprecated\ndate: 2026-01-10\n');
    expect(next).toContain('Chosen option: "PostgreSQL", because the team knows it.');
    expect(next.endsWith('* Good, because simple\n\n## More Information\n\nDeprecated on 2026-10-06, because we moved to a managed service.\n')).toBe(true);
    const adr = parseMadrStrict(next, '0001-x.md');
    expect(adr.status).toBe('obsolète');
    expect(adr.decision?.retained).toEqual(['P1']);
    expect(applyUndo(next, snapshotOf(ACCEPTED))).toBe(ACCEPTED);
  });

  it('writes the superseding ADR in the status and in a French note', () => {
    const file = '0011-typescript-strict.md';
    const source = example(file);
    const next = applyDecision(source, file, decision({ status: 'remplacée', replacedBy: 'ADR-0015' }), NOW);
    expect(next).toContain('status: superseded by ADR-0015');
    expect(parseMadrStrict(next, file).decision?.replacedBy).toBe('ADR-0015');
    expect(applyUndo(next, snapshotOf(source))).toBe(source);
  });

  it('requires a superseding ADR other than itself', () => {
    expect(() => applyDecision(ACCEPTED, '0001-x.md', decision({ status: 'remplacée' }), NOW)).toThrow(DecisionError);
    expect(() => applyDecision(ACCEPTED, '0001-x.md', decision({ status: 'remplacée', replacedBy: 'ADR-0001' }), NOW)).toThrow(/itself/u);
  });

  it('notes the superseded ADR in the new one, once', () => {
    const next = applySupersedes(ACCEPTED, '0002-x.md', 'ADR-0001', 'Use MySQL');
    expect(next).toContain('## More Information\n\nSupersedes ADR-0001 (Use MySQL).\n');
    expect(applySupersedes(next, '0002-x.md', 'ADR-0001', 'Use MySQL')).toBe(next);
    expect(applyUndo(next, snapshotOf(ACCEPTED))).toBe(ACCEPTED);
  });

  it('adds the note before the subsections of an existing More Information', () => {
    const source = `${ACCEPTED}\n## More Information\n\nSee the RFC.\n\n### Actions\n\n* [ ] benchmark\n`;
    const next = applySupersedes(source, '0002-x.md', 'ADR-0001', 'Old');
    expect(next).toContain('## More Information\n\nSee the RFC.\n\nSupersedes ADR-0001 (Old).\n\n### Actions\n\n* [ ] benchmark\n');
    expect(applyUndo(next, snapshotOf(source))).toBe(source);
  });
});

describe('rework', () => {
  const name = '0002-cache-http.md';
  const source = example(name);

  it('keeps the ADR proposed and adds the actions to More Information', () => {
    const next = applyRework(source, name, { actions: ['Measure the hit rate', '  Ask the CDN vendor  '] }, NOW);
    const adr = parseMadrStrict(next, name);
    expect(adr.status).toBe('à décider');
    expect(adr.date).toBe('2026-10-06');
    expect(reworkActions(adr)).toEqual([
      { text: 'Measure the hit rate', done: false },
      { text: 'Ask the CDN vendor', done: false },
    ]);
    expect(applyUndo(next, snapshotOf(source))).toBe(source);
  });

  it('appends to an existing Actions subsection', () => {
    const first = applyRework(source, name, { actions: ['one'] }, NOW);
    const second = applyRework(first, name, { actions: ['two'] }, NOW);
    expect(second).toContain('### Actions\n\n* [ ] one\n* [ ] two\n');
    expect(applyUndo(second, snapshotOf(first))).toBe(first);
  });

  it('requires an action', () => {
    expect(() => applyRework(source, name, { actions: [' '] }, NOW)).toThrow(DecisionError);
  });

  it.each(examples.map(({ name: file }) => file))('undoes a rework of %s byte for byte', (file) => {
    const content = example(file);
    expect(applyUndo(applyRework(content, file, { actions: ['check'] }, NOW), snapshotOf(content))).toBe(content);
  });
});

describe('participants', () => {
  it('adds deciders and consulted people without duplicates, keeping the list style', () => {
    const next = applyDecision(
      ACCEPTED.replace('status: accepted', 'status: proposed'),
      '0001-x.md',
      decision({ status: 'validée', retained: ['P1'], participants: { deciders: ['marie', 'Paul'], consulted: ['Léa', 'Paul'] } }),
      NOW,
    );
    expect(next).toContain('decision-makers: Marie, Paul\nconsulted: Léa\n');
    const adr = parseMadrStrict(next, '0001-x.md');
    expect(adr.deciders).toEqual(['Marie', 'Paul']);
    expect(adr.consulted).toEqual(['Léa']);
  });

  it('keeps flow and block lists as written', () => {
    const flow = ACCEPTED.replace('decision-makers: Marie', 'deciders: [Marie]');
    expect(applyDecision(flow, '0001-x.md', decision({ status: 'refusée', participants: { deciders: ['Paul'], consulted: [] } }), NOW)).toContain('deciders: [Marie, Paul]\n');
    const block = ACCEPTED.replace('decision-makers: Marie', 'decision-makers:\n  - Marie');
    const next = applyDecision(block, '0001-x.md', decision({ status: 'refusée', participants: { deciders: ['Paul'], consulted: [] } }), NOW);
    expect(next).toContain('decision-makers:\n  - Marie\n  - Paul\n');
    expect(applyUndo(next, snapshotOf(block))).toBe(block);
  });

  it('creates the keys in the MADR order', () => {
    const bare = '# T\n\n## Considered Options\n\n* A\n';
    const next = applyRework(bare, '0001-t.md', { actions: ['x'], participants: { deciders: ['Ana'], consulted: ['Bo'] } }, NOW);
    expect(next.startsWith('---\nstatus: proposed\ndate: 2026-10-06\ndecision-makers: Ana\nconsulted: Bo\n---\n')).toBe(true);
    expect(applyUndo(next, snapshotOf(bare))).toBe(bare);
  });
});

describe('lintMadr', () => {
  it('accepts a minimal MADR file', () => {
    const minimal = '# Use Vitest\n\n## Context and Problem Statement\n\nWe need a test runner.\n\n## Considered Options\n\n* Vitest\n* Jest\n\n## Decision Outcome\n\nChosen option: "Vitest", because it is fast.\n\n### Consequences\n\n* Good, because one tool with Vite.\n\n### Confirmation\n\nCI runs it.\n';
    expect(lintMadr(minimal, '0001-use-vitest.md')).toEqual([]);
  });

  it('asks for a confirmation on accepted ADRs and for a context', () => {
    const codes = lintMadr('---\nstatus: accepted\n---\n\n# T\n\n## Considered Options\n\n* A\n\n## Decision Outcome\n\nChosen option: "A".\n', '0001-t.md').map((issue) => issue.code);
    expect(codes).toEqual(['missingContext', 'missingConfirmation']);
  });

  it('reports markdownlint rules with their line', () => {
    const issues = lintMadr('# T\n## Context and Problem Statement\n\nText with trailing space \n\n\nSee https://example.com\n\n```\ncode\n```\n\n#### Deep', '0001-t.md');
    expect(issues.map((issue) => [issue.line, issue.params['rule']])).toEqual([
      [1, 'MD022'],
      [2, 'MD022'],
      [4, 'MD009'],
      [6, 'MD012'],
      [7, 'MD034'],
      [9, 'MD040'],
      [13, 'MD001'],
      [13, 'MD047'],
    ]);
  });

  it('accepts every example apart from markdown style', () => {
    for (const { name, content } of examples) {
      const codes = lintMadr(content, name).filter((issue) => issue.code === 'markdownlint').map((issue) => `${name}:${issue.line}:${issue.params['rule']}`);
      expect(codes).toEqual([]);
    }
  });
});

describe('findSimilarAdrs', () => {
  const { adrs } = parseCollection(examples);

  it('finds the ADR that already settled a question', () => {
    const similar = findSimilarAdrs(adrs, { title: 'Choix de l’ORM du service de commandes', context: 'Requêtes SQL typées' });
    expect(similar[0]?.adr.id).toBe('ADR-0007');
    expect(similar[0]?.shared).toContain('orm');
  });

  it('stays quiet for an unrelated subject', () => {
    expect(findSimilarAdrs(adrs, { title: 'Politique de congés', context: 'Planning estival des vacances' })).toEqual([]);
  });
});
