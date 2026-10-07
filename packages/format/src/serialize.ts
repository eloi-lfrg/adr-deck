import { outcomeSentence } from './operations.ts';
import type { Adr, Language, Status } from './schema.ts';
import { statusValue } from './vocabulary.ts';
import { yamlScalar } from './yaml.ts';

/** Everything needed to write a MADR file from scratch (e.g. when importing a .docx). */
export interface MadrDraft {
  title: string;
  status: Status;
  replacedBy: string | null;
  date: string | null;
  nextReview: string | null;
  deciders: string[];
  consulted: string[];
  informed: string[];
  tags: string[];
  /** Other front matter keys with their raw YAML value. */
  otherMetadata: [string, string][];
  context: string;
  drivers: string;
  propositions: { title: string; body: string; pros: string[]; cons: string[]; neutral: string[] }[];
  /** Indexes (0-based) of the chosen options — or the recommended ones for a proposed ADR. */
  chosen: number[];
  comment: string | null;
  outcomeDetails: string;
  moreInfo: string;
  otherSections: { heading: string; body: string }[];
  language: Language;
}

const HEADINGS: Record<Language, Record<'context' | 'drivers' | 'options' | 'outcome' | 'prosCons' | 'moreInfo', string>> = {
  en: {
    context: 'Context and Problem Statement',
    drivers: 'Decision Drivers',
    options: 'Considered Options',
    outcome: 'Decision Outcome',
    prosCons: 'Pros and Cons of the Options',
    moreInfo: 'More Information',
  },
  fr: {
    context: 'Contexte et problématique',
    drivers: 'Critères de décision',
    options: 'Options envisagées',
    outcome: 'Décision',
    prosCons: 'Avantages et inconvénients des options',
    moreInfo: 'Informations complémentaires',
  },
};

const ARGUMENTS: Record<Language, { pro: string; con: string; neutral: string }> = {
  en: { pro: 'Good, because', con: 'Bad, because', neutral: 'Neutral, because' },
  fr: { pro: 'Bon, car', con: 'Mauvais, car', neutral: 'Neutre, car' },
};

/** A kept front matter entry: the inline value on the key line, then its continuation lines as they were. */
function metadataLines(key: string, value: string): string[] {
  const [inline = '', ...continuation] = value.split('\n');
  return [inline === '' ? `${key}:` : `${key}: ${inline}`, ...continuation];
}

function frontmatter(draft: MadrDraft): string[] {
  const lines = [`status: ${statusValue(draft.status, draft.replacedBy)}`];
  if (draft.date !== null) lines.push(`date: ${draft.date}`);
  if (draft.status === 'reportée' && draft.nextReview !== null) lines.push(`next-review: ${draft.nextReview}`);
  // MADR metadata first, in the order of the MADR template; then the extensions.
  if (draft.deciders.length > 0) lines.push(`decision-makers: ${draft.deciders.map(yamlScalar).join(', ')}`);
  if (draft.consulted.length > 0) lines.push(`consulted: ${draft.consulted.map(yamlScalar).join(', ')}`);
  if (draft.informed.length > 0) lines.push(`informed: ${draft.informed.map(yamlScalar).join(', ')}`);
  if (draft.tags.length > 0) lines.push(`tags: [${draft.tags.map(yamlScalar).join(', ')}]`);
  for (const [key, value] of draft.otherMetadata) lines.push(...metadataLines(key, value));
  return ['---', ...lines, '---'];
}

function outcomeLead(draft: MadrDraft): string {
  const titles = draft.chosen.map((index) => draft.propositions[index]?.title).filter((title): title is string => title !== undefined);
  if (titles.length > 0) return outcomeSentence('validée', titles, draft.comment, null, draft.language);
  if (draft.status !== 'à décider' && draft.status !== 'validée') return outcomeSentence(draft.status, [], draft.comment, draft.replacedBy, draft.language);
  if (draft.comment === null) return '';
  return /[.!?…]$/u.test(draft.comment) ? draft.comment : `${draft.comment}.`;
}

/** Writes a canonical MADR file; `parseMadr` reads it back to the same ADR. */
export function serializeMadr(draft: MadrDraft): string {
  const headings = HEADINGS[draft.language];
  const blocks: string[] = [frontmatter(draft).join('\n'), `# ${draft.title}`];
  const section = (heading: string, body: string): void => {
    blocks.push(body.trim() === '' ? `## ${heading}` : `## ${heading}\n\n${body.trim()}`);
  };

  if (draft.context.trim() !== '') section(headings.context, draft.context);
  if (draft.drivers.trim() !== '') section(headings.drivers, draft.drivers);
  if (draft.propositions.length > 0) section(headings.options, draft.propositions.map((proposition) => `* ${proposition.title}`).join('\n'));

  const lead = outcomeLead(draft);
  if (lead !== '' || draft.outcomeDetails.trim() !== '') section(headings.outcome, [lead, draft.outcomeDetails.trim()].filter(Boolean).join('\n\n'));

  const detailed = draft.propositions.filter(
    (proposition) => proposition.body.trim() !== '' || proposition.pros.length > 0 || proposition.cons.length > 0 || proposition.neutral.length > 0,
  );
  if (detailed.length > 0) {
    const { pro, con, neutral } = ARGUMENTS[draft.language];
    const subsections = detailed.map((proposition) => {
      const parts = [`### ${proposition.title}`];
      if (proposition.body.trim() !== '') parts.push(proposition.body.trim());
      // MADR template order: Good, Neutral, Bad.
      const bullets = [
        ...proposition.pros.map((text) => `* ${pro} ${text}`),
        ...proposition.neutral.map((text) => `* ${neutral} ${text}`),
        ...proposition.cons.map((text) => `* ${con} ${text}`),
      ];
      if (bullets.length > 0) parts.push(bullets.join('\n'));
      return parts.join('\n\n');
    });
    section(headings.prosCons, subsections.join('\n\n'));
  }

  for (const other of draft.otherSections) section(other.heading, other.body);
  if (draft.moreInfo.trim() !== '') section(headings.moreInfo, draft.moreInfo);
  return `${blocks.join('\n\n')}\n`;
}

/** The draft that rewrites an ADR as it was read. */
export function draftFromAdr(adr: Adr): MadrDraft {
  const chosenIds = adr.decision?.retained.length ? adr.decision.retained : adr.recommended;
  return {
    title: adr.title,
    status: adr.status,
    replacedBy: adr.decision?.replacedBy ?? null,
    date: adr.date,
    nextReview: adr.decision?.nextReview ?? null,
    deciders: adr.deciders,
    consulted: adr.consulted,
    informed: adr.informed,
    tags: adr.tags,
    otherMetadata: adr.otherMetadata,
    context: adr.context,
    drivers: adr.drivers,
    propositions: adr.propositions.map(({ title, body, pros, cons, neutral }) => ({ title, body, pros, cons, neutral })),
    chosen: chosenIds.map((id) => adr.propositions.findIndex((proposition) => proposition.id === id)).filter((index) => index !== -1),
    comment: adr.decision?.comment ?? adr.rationale,
    outcomeDetails: adr.outcomeDetails,
    moreInfo: adr.moreInfo,
    otherSections: adr.otherSections,
    language: adr.language,
  };
}

/** What an ADR says, independently of how its file is formatted (used to tell real edits from rewrites). */
function substance(adr: Adr): unknown {
  const { file: _file, id: _id, rawStatus: _rawStatus, language: _language, ...rest } = adr;
  return rest;
}

/** True when two ADRs carry the same content, whatever the layout of their files. */
export function sameAdrContent(a: Adr, b: Adr): boolean {
  return JSON.stringify(substance(a)) === JSON.stringify(substance(b));
}
