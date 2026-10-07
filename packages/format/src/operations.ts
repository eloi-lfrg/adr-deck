import { parseDocument } from 'yaml';
import { parisDate } from './dates.ts';
import { analyze, joinLines, leadRange, type Layout, type Section } from './layout.ts';
import { parseMadr } from './parse.ts';
import type { Adr, Language, Status } from './schema.ts';
import { ACTIONS_HEADING, isActionsHeading, MORE_INFO_HEADING, normalizeKey, OUTCOME_HEADING, sectionOf, statusValue } from './vocabulary.ts';
import { yamlScalar } from './yaml.ts';

/** People present at a review: merged into the MADR `decision-makers` and `consulted` metadata. */
export interface Participants {
  deciders: string[];
  consulted: string[];
}

export interface DecisionInput {
  status: Status;
  /** Proposition IDs; required (non-empty) for `validée`, ignored otherwise. */
  retained: string[];
  comment: string | null;
  /** Only kept for `reportée`. */
  nextReview: string | null;
  /** Required for `remplacée`: the ADR that supersedes this one. */
  replacedBy: string | null;
  participants?: Participants;
}

/** Sends a proposed ADR back for rework: it stays `proposed` and gets follow-up actions. */
export interface ReworkInput {
  actions: string[];
  participants?: Participants;
}

/**
 * The parts of a file an operation rewrites, verbatim, so that an undo restores the file byte for byte.
 * `null` means the part did not exist.
 */
export interface DecisionSnapshot {
  frontmatter: string | null;
  /** Lead of « Decision Outcome ». */
  outcome: string | null;
  /** Whole « More Information » section, heading included. */
  moreInfo: string | null;
}

export type DocumentOperation =
  | { kind: 'decide'; adrId: string; input: DecisionInput; at: string }
  | { kind: 'rework'; adrId: string; input: ReworkInput; at: string }
  /** Note written in the ADR that supersedes `replaced` (the other half of a `remplacée` decision). */
  | { kind: 'supersedes'; adrId: string; replaced: string; title: string; at: string }
  | { kind: 'undo'; adrId: string; restore: DecisionSnapshot; at: string };

export type DecisionErrorCode = 'unreadableFile' | 'optionRequired' | 'unknownOption' | 'unknownAdr' | 'actionRequired' | 'replacementRequired' | 'selfReplacement';

/** A decision that cannot be applied; `code` and `params` let the UI word it in its own language. */
export class DecisionError extends Error {
  constructor(
    readonly code: DecisionErrorCode,
    readonly params: Record<string, string>,
    message: string,
  ) {
    super(message);
    this.name = 'DecisionError';
  }
}

function cleanComment(comment: string | null): string | null {
  const value = comment?.replace(/\s+/gu, ' ').trim() ?? '';
  return value === '' ? null : value;
}

function outcomeSection(layout: Layout): Section | undefined {
  return layout.sections.find((section) => sectionOf(section.heading)?.kind === 'outcome');
}

function moreInfoSection(layout: Layout): Section | undefined {
  return layout.sections.find((section) => sectionOf(section.heading)?.kind === 'moreInfo');
}

export function snapshotOf(content: string): DecisionSnapshot {
  const layout = analyze(content);
  const frontmatter = layout.frontmatter === null ? null : layout.lines.slice(layout.frontmatter.open + 1, layout.frontmatter.close).join('\n');
  const outcome = outcomeSection(layout);
  const more = moreInfoSection(layout);
  return {
    frontmatter,
    outcome: outcome ? layout.lines.slice(leadRange(outcome).start, leadRange(outcome).end).join('\n') : null,
    moreInfo: more ? layout.lines.slice(more.line, more.end).join('\n') : null,
  };
}

function readable(content: string, fileName: string): Adr {
  const { adr } = parseMadr(content, fileName);
  if (adr === null) throw new DecisionError('unreadableFile', { file: fileName }, `Unreadable file: ${fileName}.`);
  return adr;
}

// ---------------------------------------------------------------------------
// Front matter

const KEY_ORDER = ['status', 'date', 'next-review'];

/** Sets (or removes, with `null`) a top-level `key: value` line, keeping the quoting style of the existing value. */
function setFrontmatterKey(lines: string[], key: string, value: string | null): string[] {
  const result = [...lines];
  const index = result.findIndex((line) => new RegExp(`^${key}\\s*:`, 'u').test(line));
  if (index === -1) {
    if (value === null) return result;
    // Keep status, date and next-review together, in that order.
    const order = KEY_ORDER.indexOf(key);
    let at = result.length;
    for (const previous of KEY_ORDER.slice(0, Math.max(order, 0)).reverse()) {
      const found = result.findIndex((line) => line.startsWith(`${previous}:`));
      if (found !== -1) {
        at = found + 1;
        break;
      }
    }
    result.splice(at, 0, `${key}: ${value}`);
    return result;
  }
  // A value may continue on indented or `- item` lines.
  let end = index + 1;
  while (end < result.length && /^(\s+\S|-\s)/u.test(result[end]!)) end++;
  if (value === null) {
    result.splice(index, end - index);
    return result;
  }
  const current = result[index]!.slice(result[index]!.indexOf(':') + 1).trim();
  const quote = current.startsWith('"') ? '"' : current.startsWith("'") ? "'" : '';
  const comment = /\s+#.*$/u.exec(quote === '' ? current : '')?.[0] ?? '';
  result.splice(index, end - index, `${key}: ${quote}${value}${quote}${comment}`);
  return result;
}

function replaceFrontmatter(layout: Layout, inner: string[] | null): string[] {
  const lines = [...layout.lines];
  if (layout.frontmatter !== null) {
    const { open, close } = layout.frontmatter;
    if (inner === null) {
      // Only an undo removes a front matter: the one the decision created, with the blank line after it.
      lines.splice(open, close - open + 1 + (lines[close + 1] === '' ? 1 : 0));
    } else {
      lines.splice(open + 1, close - open - 1, ...inner);
    }
    return lines;
  }
  if (inner === null) return lines;
  lines.unshift('---', ...inner, '---', '');
  return lines;
}

const TOP_LEVEL_KEY = /^([^\s#:][^:]*):(.*)$/u;
/** Front matter keys of the people metadata, by MADR name (MADR 3 `deciders` and French spellings included). */
const PEOPLE_KEYS: Record<'decision-makers' | 'consulted', string[]> = {
  'decision-makers': ['decision makers', 'deciders', 'decideurs'],
  consulted: ['consulted', 'consultes'],
};
/** Keys a missing people key is written after, nearest first. */
const PEOPLE_AFTER: Record<'decision-makers' | 'consulted', string[]> = {
  'decision-makers': ['next review', 'date', 'status'],
  consulted: ['decision makers', 'deciders', 'decideurs', 'next review', 'date', 'status'],
};

interface Entry {
  index: number;
  /** First line after the entry (continuation lines included). */
  end: number;
  key: string;
  inline: string;
}

function entryOf(lines: string[], names: string[]): Entry | null {
  for (let index = 0; index < lines.length; index++) {
    const match = TOP_LEVEL_KEY.exec(lines[index]!);
    if (!match || !names.includes(normalizeKey(match[1]!))) continue;
    let end = index + 1;
    while (end < lines.length && /^(\s+\S|-\s)/u.test(lines[end]!)) end++;
    return { index, end, key: match[1]!.trim(), inline: match[2]!.trim() };
  }
  return null;
}

function listValue(lines: string[], entry: Entry): string[] {
  const document = parseDocument(lines.slice(entry.index, entry.end).join('\n'));
  if (document.errors.length > 0) return [];
  const data: unknown = document.toJS();
  const value: unknown = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)[entry.key] : undefined;
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return items.map((item) => String(item).trim()).filter(Boolean);
}

const samePerson = (a: string, b: string): boolean => normalizeKey(a) === normalizeKey(b);

/** Adds people to a list key, keeping the names already there and the way the list is written. */
function addPeople(lines: string[], key: 'decision-makers' | 'consulted', people: string[]): string[] {
  const entry = entryOf(lines, PEOPLE_KEYS[key]);
  const existing = entry === null ? [] : listValue(lines, entry);
  const added = people.filter((name, index) => name.trim() !== '' && !existing.some((other) => samePerson(other, name)) && people.findIndex((other) => samePerson(other, name)) === index);
  if (added.length === 0) return lines;
  const values = [...existing, ...added.map((name) => name.trim())];
  const result = [...lines];
  if (entry === null) {
    let at = result.length;
    for (const previous of PEOPLE_AFTER[key]) {
      const found = entryOf(result, [previous]);
      if (found !== null) {
        at = found.end;
        break;
      }
    }
    result.splice(at, 0, `${key}: ${values.map(yamlScalar).join(', ')}`);
    return result;
  }
  const continuation = result.slice(entry.index + 1, entry.end);
  let written: string[];
  if (entry.inline.startsWith('[')) {
    written = [`${entry.key}: [${values.map(yamlScalar).join(', ')}]`];
  } else if (entry.inline === '' && continuation.length > 0 && continuation.every((line) => /^\s*-\s/u.test(line))) {
    const indent = /^\s*/u.exec(continuation[0]!)![0];
    written = [`${entry.key}:`, ...values.map((value) => `${indent}- ${yamlScalar(value)}`)];
  } else {
    written = [`${entry.key}: ${values.map(yamlScalar).join(', ')}`];
  }
  result.splice(entry.index, entry.end - entry.index, ...written);
  return result;
}

/** Merges the participants of a review: deciders into `decision-makers`, the others into `consulted`. */
function addParticipants(lines: string[], participants: Participants | undefined): string[] {
  if (participants === undefined) return lines;
  const withDeciders = addPeople(lines, 'decision-makers', participants.deciders);
  const deciders = (() => {
    const entry = entryOf(withDeciders, PEOPLE_KEYS['decision-makers']);
    return entry === null ? [] : listValue(withDeciders, entry);
  })();
  return addPeople(
    withDeciders,
    'consulted',
    participants.consulted.filter((name) => !deciders.some((decider) => samePerson(decider, name))),
  );
}

function frontmatterLines(layout: Layout): string[] {
  return layout.frontmatter === null ? [] : layout.lines.slice(layout.frontmatter.open + 1, layout.frontmatter.close);
}

// ---------------------------------------------------------------------------
// Decision Outcome

function quoteTitles(titles: string[], language: Language): string {
  const quoted = titles.map((title) => (language === 'fr' ? `« ${title} »` : `"${title}"`));
  if (quoted.length <= 1) return quoted.join('');
  return `${quoted.slice(0, -1).join(', ')} ${language === 'fr' ? 'et' : 'and'} ${quoted.at(-1)!}`;
}

function sentence(text: string, comment: string | null, language: Language): string {
  if (comment === null) return `${text}.`;
  return `${text}, ${language === 'fr' ? 'car' : 'because'} ${comment}${/[.!?…]$/u.test(comment) ? '' : '.'}`;
}

/** The lead sentence of « Decision Outcome » for a decision, in the language of the file. */
export function outcomeSentence(status: Status, titles: string[], comment: string | null, replacedBy: string | null, language: Language): string {
  const fr = language === 'fr';
  switch (status) {
    case 'validée':
      return sentence(`${fr ? (titles.length > 1 ? 'Options retenues :' : 'Option retenue :') : titles.length > 1 ? 'Chosen options:' : 'Chosen option:'} ${quoteTitles(titles, language)}`, comment, language);
    case 'refusée':
      return comment === null ? (fr ? 'Refusée : aucune option retenue.' : 'Rejected: no option chosen.') : sentence(fr ? 'Refusée' : 'Rejected', comment, language);
    case 'reportée':
      return sentence(fr ? 'Reportée' : 'Deferred', comment, language);
    case 'remplacée':
      return sentence(replacedBy === null ? (fr ? 'Remplacée' : 'Superseded') : `${fr ? 'Remplacée par' : 'Superseded by'} ${replacedBy}`, comment, language);
    case 'obsolète':
      return sentence(fr ? 'Obsolète' : 'Deprecated', comment, language);
    case 'à décider':
      return '';
  }
}

/** Replaces the lead of « Decision Outcome » (`null` removes a section that has no subsection). */
function replaceOutcome(layout: Layout, lead: string[] | null, language: Language): string[] {
  const lines = [...layout.lines];
  const section = outcomeSection(layout);
  if (section) {
    if (lead === null && section.subsections.length === 0) {
      lines.splice(section.line, section.end - section.line);
      while (lines.length > 0 && lines.at(-1) === '') lines.pop();
      return lines;
    }
    const { start, end } = leadRange(section);
    lines.splice(start, end - start, ...(lead ?? []));
    return lines;
  }
  if (lead === null) return lines;
  // MADR order: the outcome comes before « Pros and Cons of the Options » and « More Information ».
  const before = layout.sections.find((candidate) => {
    const kind = sectionOf(candidate.heading)?.kind;
    return kind === 'prosCons' || kind === 'moreInfo';
  });
  const block = [`## ${OUTCOME_HEADING[language]}`, ...lead];
  if (before) {
    lines.splice(before.line, 0, ...block);
    return lines;
  }
  if (lines.length > 0 && lines.at(-1) !== '') lines.push('');
  lines.push(...block);
  return lines;
}

/** Lead lines for a new sentence: blank line, sentence, then a blank line unless it ends the file. */
function leadLines(text: string, endsFile: boolean): string[] {
  return endsFile ? ['', text] : ['', text, ''];
}

// ---------------------------------------------------------------------------
// More Information

interface BodyBlock {
  heading: string;
  /** Indexes in the section body (heading line, first line after the subsection). */
  start: number;
  end: number;
}

/** Rewrites the body of « More Information » (created at the end of the file when missing). */
function editMoreInfo(content: string, language: Language, edit: (body: string[], subsections: BodyBlock[]) => string[]): string {
  const layout = analyze(content);
  const lines = [...layout.lines];
  const section = moreInfoSection(layout);
  if (!section) {
    if (lines.length > 0 && lines.at(-1) !== '') lines.push('');
    lines.push(`## ${MORE_INFO_HEADING[language]}`, ...edit([], []));
    return joinLines({ ...layout, lines });
  }
  const body = lines.slice(section.line + 1, section.end);
  // Blank lines before the next section stay where they are.
  let kept = body.length;
  while (kept > 0 && body[kept - 1]!.trim() === '') kept--;
  const offset = section.line + 1;
  const subsections = section.subsections.map((block) => ({ heading: block.heading, start: block.line - offset, end: Math.min(block.end - offset, kept) }));
  lines.splice(offset, body.length, ...edit(body.slice(0, kept), subsections), ...body.slice(kept));
  return joinLines({ ...layout, lines });
}

function trimEnd(lines: string[], from: number, to: number): number {
  let end = to;
  while (end > from && lines[end - 1]!.trim() === '') end--;
  return end;
}

/** Adds a paragraph at the end of the lead of « More Information », before its subsections. */
function addNote(text: string): (body: string[], subsections: BodyBlock[]) => string[] {
  return (body, subsections) => {
    const first = subsections[0]?.start ?? body.length;
    const end = trimEnd(body, 0, first);
    const rest = body.slice(first);
    return [...body.slice(0, end), '', text, ...(rest.length > 0 ? (first > end ? body.slice(end, first) : ['']) : []), ...rest];
  };
}

/** Adds unchecked task items to the `### Actions` subsection, created at the end when missing. */
function addActions(actions: string[]): (body: string[], subsections: BodyBlock[]) => string[] {
  const items = actions.map((action) => `* [ ] ${action}`);
  return (body, subsections) => {
    const target = subsections.find((block) => isActionsHeading(block.heading));
    if (target === undefined) return [...body, '', `### ${ACTIONS_HEADING}`, '', ...items];
    const end = trimEnd(body, target.start + 1, target.end);
    return [...body.slice(0, end), ...(end === target.start + 1 ? [''] : []), ...items, ...body.slice(end)];
  };
}

/** Restores « More Information » as captured (`null`: removes a section created since, at the end of the file). */
function restoreMoreInfo(layout: Layout, section: string | null): string[] {
  const lines = [...layout.lines];
  const current = moreInfoSection(layout);
  if (current) {
    lines.splice(current.line, current.end - current.line, ...(section === null ? [] : section.split('\n')));
    if (section === null) while (lines.length > 0 && lines.at(-1) === '') lines.pop();
    return lines;
  }
  if (section === null) return lines;
  if (lines.length > 0 && lines.at(-1) !== '') lines.push('');
  lines.push(...section.split('\n'));
  return lines;
}

/** Note written in « More Information » when an accepted ADR is superseded or deprecated. */
export function lifecycleNote(status: 'remplacée' | 'obsolète', replacedBy: string | null, comment: string | null, date: string, language: Language): string {
  const fr = language === 'fr';
  if (status === 'remplacée') return sentence(`${fr ? 'Remplacée par' : 'Superseded by'} ${replacedBy ?? ''} ${fr ? 'le' : 'on'} ${date}`, comment, language);
  return sentence(`${fr ? 'Rendue obsolète le' : 'Deprecated on'} ${date}`, comment, language);
}

/** Note written in « More Information » of the ADR that supersedes another one. */
export function supersedesNote(replaced: string, title: string, language: Language): string {
  return `${language === 'fr' ? 'Remplace' : 'Supersedes'} ${replaced} (${title}).`;
}

// ---------------------------------------------------------------------------
// Operations

/**
 * Records a decision in a MADR file: front matter `status`, `date` (today, Europe/Paris), `next-review` and the
 * review participants, and the lead sentence of « Decision Outcome ». Superseding or deprecating an ADR keeps its
 * decision (outcome sentence and date) and adds a dated note to « More Information » instead. The rest of the file
 * is left untouched.
 */
export function applyDecision(content: string, fileName: string, input: DecisionInput, now: Date): string {
  const adr = readable(content, fileName);
  const known = new Map(adr.propositions.map((proposition) => [proposition.id, proposition.title]));
  const retained = input.status === 'validée' ? [...new Set(input.retained)] : [];
  if (input.status === 'validée' && retained.length === 0) throw new DecisionError('optionRequired', {}, 'Accepting requires at least one selected option.');
  const unknown = retained.filter((id) => !known.has(id));
  if (unknown.length > 0) throw new DecisionError('unknownOption', { adr: adr.id, options: unknown.join(', ') }, `Unknown option in ${adr.id}: ${unknown.join(', ')}.`);
  retained.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const replacedBy = input.status === 'remplacée' ? input.replacedBy : null;
  if (input.status === 'remplacée' && replacedBy === null) throw new DecisionError('replacementRequired', { adr: adr.id }, `${adr.id}: the superseding ADR is required.`);
  if (replacedBy === adr.id) throw new DecisionError('selfReplacement', { adr: adr.id }, `${adr.id} cannot supersede itself.`);
  const lifecycle = input.status === 'remplacée' || input.status === 'obsolète';

  let layout = analyze(content);
  let inner = frontmatterLines(layout);
  inner = setFrontmatterKey(inner, 'status', statusValue(input.status, replacedBy));
  // The decision date stays the one of the decision being superseded or deprecated.
  if (!lifecycle) inner = setFrontmatterKey(inner, 'date', parisDate(now));
  inner = setFrontmatterKey(inner, 'next-review', input.status === 'reportée' ? input.nextReview : null);
  inner = addParticipants(inner, input.participants);
  const withFrontmatter = joinLines({ ...layout, lines: replaceFrontmatter(layout, inner) });
  if (input.status === 'à décider') return withFrontmatter;
  if (input.status === 'remplacée' || input.status === 'obsolète') return editMoreInfo(withFrontmatter, adr.language, addNote(lifecycleNote(input.status, replacedBy, cleanComment(input.comment), parisDate(now), adr.language)));

  layout = analyze(withFrontmatter);
  const text = outcomeSentence(input.status, retained.map((id) => known.get(id)!), cleanComment(input.comment), replacedBy, adr.language);
  const section = outcomeSection(layout);
  const endsFile = section ? section.subsections.length === 0 && section.end === layout.lines.length : !layout.sections.some((candidate) => ['prosCons', 'moreInfo'].includes(sectionOf(candidate.heading)?.kind ?? ''));
  return joinLines({ ...layout, lines: replaceOutcome(layout, leadLines(text, endsFile), adr.language) });
}

/**
 * Sends an ADR back for rework: `status: proposed`, today's `date`, the participants, and the actions added as
 * unchecked items of `### Actions` in « More Information ». Its « Decision Outcome » (recommendation) is kept.
 */
export function applyRework(content: string, fileName: string, input: ReworkInput, now: Date): string {
  const adr = readable(content, fileName);
  const actions = input.actions.map((action) => action.replace(/\s+/gu, ' ').trim()).filter(Boolean);
  if (actions.length === 0) throw new DecisionError('actionRequired', { adr: adr.id }, `${adr.id}: sending back for rework requires at least one action.`);
  const layout = analyze(content);
  let inner = frontmatterLines(layout);
  inner = setFrontmatterKey(inner, 'status', statusValue('à décider', null));
  inner = setFrontmatterKey(inner, 'date', parisDate(now));
  inner = setFrontmatterKey(inner, 'next-review', null);
  inner = addParticipants(inner, input.participants);
  return editMoreInfo(joinLines({ ...layout, lines: replaceFrontmatter(layout, inner) }), adr.language, addActions(actions));
}

/** Notes in the superseding ADR which one it replaces (nothing is written when the note is already there). */
export function applySupersedes(content: string, fileName: string, replaced: string, title: string): string {
  const adr = readable(content, fileName);
  if (new RegExp(`(?:supersedes|remplace)\\s+${replaced}\\b`, 'iu').test(adr.moreInfo)) return content;
  return editMoreInfo(content, adr.language, addNote(supersedesNote(replaced, title, adr.language)));
}

/** Restores the front matter, « Decision Outcome » lead and « More Information » captured before an operation. */
export function applyUndo(content: string, restore: DecisionSnapshot): string {
  let layout = analyze(content);
  const withFrontmatter = joinLines({ ...layout, lines: replaceFrontmatter(layout, restore.frontmatter === null ? null : restore.frontmatter.split('\n')) });
  layout = analyze(withFrontmatter);
  // The language only matters to recreate a section removed in the meantime.
  const withOutcome = joinLines({ ...layout, lines: replaceOutcome(layout, restore.outcome === null ? null : restore.outcome.split('\n'), 'en') });
  layout = analyze(withOutcome);
  return joinLines({ ...layout, lines: restoreMoreInfo(layout, restore.moreInfo) });
}

export function applyOperation(content: string, fileName: string, operation: DocumentOperation): string {
  switch (operation.kind) {
    case 'decide':
      return applyDecision(content, fileName, operation.input, new Date(operation.at));
    case 'rework':
      return applyRework(content, fileName, operation.input, new Date(operation.at));
    case 'supersedes':
      return applySupersedes(content, fileName, operation.replaced, operation.title);
    case 'undo':
      return applyUndo(content, operation.restore);
  }
}
