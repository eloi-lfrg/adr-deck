import { parisDate } from './dates.ts';
import { analyze, joinLines, leadRange, type Layout } from './layout.ts';
import { parseMadr } from './parse.ts';
import type { Language, Status } from './schema.ts';
import { OUTCOME_HEADING, sectionOf, statusValue } from './vocabulary.ts';

export interface DecisionInput {
  status: Status;
  /** Proposition IDs; required (non-empty) for `validée`, ignored otherwise. */
  retained: string[];
  comment: string | null;
  /** Only kept for `reportée`. */
  nextReview: string | null;
  /** Only kept for `remplacée`. */
  replacedBy: string | null;
}

/**
 * The two parts of a file a decision rewrites, verbatim, so that an undo restores the file byte for byte.
 * `null` means the part did not exist.
 */
export interface DecisionSnapshot {
  frontmatter: string | null;
  outcome: string | null;
}

export type DocumentOperation =
  | { kind: 'decide'; adrId: string; input: DecisionInput; at: string }
  | { kind: 'undo'; adrId: string; restore: DecisionSnapshot; at: string };

export type DecisionErrorCode = 'unreadableFile' | 'optionRequired' | 'unknownOption' | 'unknownAdr';

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

function outcomeSection(layout: Layout) {
  return layout.sections.find((section) => sectionOf(section.heading)?.kind === 'outcome');
}

export function snapshotOf(content: string): DecisionSnapshot {
  const layout = analyze(content);
  const frontmatter = layout.frontmatter === null ? null : layout.lines.slice(layout.frontmatter.open + 1, layout.frontmatter.close).join('\n');
  const section = outcomeSection(layout);
  if (!section) return { frontmatter, outcome: null };
  const { start, end } = leadRange(section);
  return { frontmatter, outcome: layout.lines.slice(start, end).join('\n') };
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
// Operations

/**
 * Records a decision in a MADR file: front matter `status`, `date` (today, Europe/Paris) and `next-review`,
 * and the lead sentence of « Decision Outcome ». The rest of the file is left untouched.
 */
export function applyDecision(content: string, fileName: string, input: DecisionInput, now: Date): string {
  const { adr } = parseMadr(content, fileName);
  if (adr === null) throw new DecisionError('unreadableFile', { file: fileName }, `Unreadable file: ${fileName}.`);
  const known = new Map(adr.propositions.map((proposition) => [proposition.id, proposition.title]));
  const retained = input.status === 'validée' ? [...new Set(input.retained)] : [];
  if (input.status === 'validée' && retained.length === 0) throw new DecisionError('optionRequired', {}, 'Accepting requires at least one selected option.');
  const unknown = retained.filter((id) => !known.has(id));
  if (unknown.length > 0) throw new DecisionError('unknownOption', { adr: adr.id, options: unknown.join(', ') }, `Unknown option in ${adr.id}: ${unknown.join(', ')}.`);
  retained.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const replacedBy = input.status === 'remplacée' ? input.replacedBy : null;

  let layout = analyze(content);
  let inner = layout.frontmatter === null ? [] : layout.lines.slice(layout.frontmatter.open + 1, layout.frontmatter.close);
  inner = setFrontmatterKey(inner, 'status', statusValue(input.status, replacedBy));
  inner = setFrontmatterKey(inner, 'date', parisDate(now));
  inner = setFrontmatterKey(inner, 'next-review', input.status === 'reportée' ? input.nextReview : null);
  const withFrontmatter = joinLines({ ...layout, lines: replaceFrontmatter(layout, inner) });
  if (input.status === 'à décider') return withFrontmatter;

  layout = analyze(withFrontmatter);
  const text = outcomeSentence(input.status, retained.map((id) => known.get(id)!), cleanComment(input.comment), replacedBy, adr.language);
  const section = outcomeSection(layout);
  const endsFile = section ? section.subsections.length === 0 && section.end === layout.lines.length : !layout.sections.some((candidate) => ['prosCons', 'moreInfo'].includes(sectionOf(candidate.heading)?.kind ?? ''));
  return joinLines({ ...layout, lines: replaceOutcome(layout, leadLines(text, endsFile), adr.language) });
}

/** Restores the front matter and « Decision Outcome » lead captured before a decision. */
export function applyUndo(content: string, restore: DecisionSnapshot): string {
  let layout = analyze(content);
  const withFrontmatter = joinLines({ ...layout, lines: replaceFrontmatter(layout, restore.frontmatter === null ? null : restore.frontmatter.split('\n')) });
  layout = analyze(withFrontmatter);
  // The language only matters to recreate a section removed in the meantime.
  return joinLines({ ...layout, lines: replaceOutcome(layout, restore.outcome === null ? null : restore.outcome.split('\n'), 'en') });
}

export function applyOperation(content: string, fileName: string, operation: DocumentOperation): string {
  switch (operation.kind) {
    case 'decide':
      return applyDecision(content, fileName, operation.input, new Date(operation.at));
    case 'undo':
      return applyUndo(content, operation.restore);
  }
}
