import { parseDocument } from 'yaml';
import { adrIdFromFileName } from './files.ts';
import { issueMessage, makeIssue } from './issues.ts';
import { analyze, leadRange, textOf, type Layout, type Section } from './layout.ts';
import { DATE_PATTERN, type Adr, type Decision, type Language, type ParseIssue, type ParseResult, type Proposition } from './schema.ts';
import { CON_BULLET, NEUTRAL_BULLET, normalizeKey, PRO_BULLET, readStatus, sectionOf, type SectionKind } from './vocabulary.ts';

type FrontmatterValues = Map<string, unknown>;

function readFrontmatter(layout: Layout, issues: ParseIssue[]): FrontmatterValues {
  const values: FrontmatterValues = new Map();
  if (layout.frontmatter === null) return values;
  const source = layout.lines.slice(layout.frontmatter.open + 1, layout.frontmatter.close).join('\n');
  const document = parseDocument(source);
  const [error] = document.errors;
  if (error) {
    issues.push(makeIssue((error.linePos?.[0].line ?? 1) + 1, 'error', 'invalidYaml', { detail: error.message.split('\n')[0]! }));
    return values;
  }
  const data: unknown = document.toJS();
  if (data === null || data === undefined) return values;
  if (typeof data !== 'object' || Array.isArray(data)) {
    issues.push(makeIssue(2, 'error', 'frontmatterNotMapping'));
    return values;
  }
  for (const [key, value] of Object.entries(data)) values.set(normalizeKey(key), value);
  return values;
}

function scalar(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(scalar).filter((item): item is string => item !== null);
  const text = scalar(value);
  return text === null ? [] : text.split(',').map((item) => item.trim()).filter(Boolean);
}

function pick(values: FrontmatterValues, ...keys: string[]): unknown {
  for (const key of keys) if (values.has(key)) return values.get(key);
  return undefined;
}

function frontmatterLine(layout: Layout, key: string): number {
  if (layout.frontmatter === null) return 1;
  const index = layout.lines.findIndex((line, i) => i > layout.frontmatter!.open && i < layout.frontmatter!.close && line.startsWith(`${key}:`));
  return (index === -1 ? layout.frontmatter.open : index) + 1;
}

/** Front matter keys read into dedicated fields; every other key is kept as written. */
const KNOWN_KEYS = new Set(['status', 'statut', 'date', 'decision makers', 'deciders', 'decideurs', 'consulted', 'informed', 'tags', 'etiquettes', 'next review', 'prochaine revue']);

/** Top-level front matter entries not read elsewhere, with their raw YAML value (single or multi-line). */
function otherMetadata(layout: Layout): [string, string][] {
  if (layout.frontmatter === null) return [];
  const lines = layout.lines.slice(layout.frontmatter.open + 1, layout.frontmatter.close);
  const entries: [string, string][] = [];
  for (let index = 0; index < lines.length; index++) {
    const match = /^([^\s#:][^:]*):(.*)$/u.exec(lines[index]!);
    if (!match || KNOWN_KEYS.has(normalizeKey(match[1]!))) continue;
    const value = [match[2]!.trim()];
    while (index + 1 < lines.length && /^(\s+\S|-\s)/u.test(lines[index + 1]!)) value.push(lines[++index]!);
    entries.push([match[1]!.trim(), value.join('\n')]);
  }
  return entries;
}

/** Strips markdown decoration from a list item or heading used as an option title. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\*\*|__|`/gu, '')
    .trim()
    .replace(/^[*_]+|[*_]+$/gu, '')
    .replace(/^["“«]\s*|\s*["”»]$/gu, '')
    .trim();
}

function sameTitle(a: string, b: string): boolean {
  const x = normalizeKey(a);
  const y = normalizeKey(b);
  if (x === '' || y === '') return false;
  return x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)));
}

function findProposition(propositions: Proposition[], title: string): Proposition | undefined {
  const normalized = normalizeKey(title);
  return propositions.find((proposition) => normalizeKey(proposition.title) === normalized) ?? propositions.find((proposition) => sameTitle(proposition.title, title));
}

function optionsFrom(layout: Layout, section: Section | undefined): Proposition[] {
  if (!section) return [];
  const { start, end } = leadRange(section);
  const titles: string[] = [];
  for (const line of layout.lines.slice(start, end)) {
    const item = /^(?:[-*+]|\d+[.)])\s+(.+)$/u.exec(line);
    if (item) {
      const title = cleanTitle(item[1]!);
      if (title !== '') titles.push(title);
    }
  }
  return titles.map((title, index) => ({ id: `P${index + 1}`, title, body: '', pros: [], cons: [], neutral: [] }));
}

/** Fills option bodies and Good/Bad arguments from the « Pros and Cons of the Options » subsections. */
function addProsAndCons(layout: Layout, section: Section | undefined, propositions: Proposition[]): Proposition[] {
  if (!section) return propositions;
  const result = propositions.map((proposition) => ({ ...proposition, pros: [...proposition.pros], cons: [...proposition.cons], neutral: [...proposition.neutral] }));
  for (const subsection of section.subsections) {
    const title = cleanTitle(subsection.heading);
    let proposition = findProposition(result, title);
    if (!proposition) {
      proposition = { id: `P${result.length + 1}`, title, body: '', pros: [], cons: [], neutral: [] };
      result.push(proposition);
    }
    const body: string[] = [];
    for (const line of layout.lines.slice(subsection.line + 1, subsection.end)) {
      const pro = PRO_BULLET.exec(line);
      const con = CON_BULLET.exec(line);
      const neutral = NEUTRAL_BULLET.exec(line);
      if (pro) proposition.pros.push(pro[1]!.trim());
      else if (con) proposition.cons.push(con[1]!.trim());
      else if (neutral) proposition.neutral.push(neutral[1]!.trim());
      else body.push(line);
    }
    proposition.body = textOf(body, 0, body.length);
  }
  return result;
}

const QUOTED = /"([^"]+)"|“([^”]+)”|«\s*([^»]+?)\s*»|\*\*([^*]+)\*\*|`([^`]+)`/gu;
const CHOSEN = /^(?:chosen options?|options? retenues?|options? choisies?)\s*:\s*/iu;
const BECAUSE = /,?\s+(?:because|car|parce qu(?:e|')\s*)\s*/iu;
const STATUS_LEAD =
  /^(?:rejected|deferred|deprecated|superseded(?: by \S+)?|refusée?|reportée?|décision reportée|obsolète|remplacée?(?: par \S+)?)\s*[,.:]?\s*(?:(?:because|car)\s+)?/iu;
const NOTHING_CHOSEN = /^(?:no option (?:was )?chosen|aucune option (?:n'est )?retenue)\.?$/iu;

function cleanComment(text: string): string | null {
  const value = text.replace(/\s+/gu, ' ').trim().replace(/\.$/u, '').trim();
  return value === '' ? null : value;
}

interface OutcomeReading {
  chosen: string[];
  unmatched: string[];
  comment: string | null;
}

/** Reads the lead paragraph of « Decision Outcome »: `Chosen option: "X", because Y.` or a status sentence. */
export function readOutcome(lead: string, propositions: Proposition[]): OutcomeReading {
  const paragraphs = lead.split(/\n\s*\n/u).map((paragraph) => paragraph.replace(/\s*\n\s*/gu, ' ').trim()).filter(Boolean);
  const first = paragraphs[0] ?? '';
  if (CHOSEN.test(first)) {
    const sentence = first.replace(CHOSEN, '');
    const because = BECAUSE.exec(sentence);
    const optionsPart = because ? sentence.slice(0, because.index) : sentence;
    const comment = because ? cleanComment(sentence.slice(because.index + because[0].length)) : null;
    const quoted = [...optionsPart.matchAll(QUOTED)].map((match) => (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '').trim());
    const titles = quoted.length > 0 ? quoted : [cleanTitle(optionsPart.replace(/[.,;]+$/u, ''))];
    const chosen: string[] = [];
    const unmatched: string[] = [];
    for (const title of titles.filter(Boolean)) {
      const proposition = findProposition(propositions, title);
      if (proposition && !chosen.includes(proposition.id)) chosen.push(proposition.id);
      else if (!proposition) unmatched.push(title);
    }
    return { chosen, unmatched, comment };
  }
  const text = paragraphs.join(' ');
  const rest = text.replace(STATUS_LEAD, '');
  return { chosen: [], unmatched: [], comment: NOTHING_CHOSEN.test(rest.trim()) ? null : cleanComment(rest) };
}

/** Parses one MADR file. `fileName` gives the ADR ID (`0007-x.md` → `ADR-0007`). */
export function parseMadr(content: string, fileName: string): ParseResult {
  const issues: ParseIssue[] = [];
  const layout = analyze(content);
  const id = adrIdFromFileName(fileName);
  if (id === null) issues.push(makeIssue(1, 'error', 'fileNameWithoutNumber', { file: fileName }));
  if (layout.title === null) issues.push(makeIssue(1, 'error', 'missingTitle'));
  const values = readFrontmatter(layout, issues);

  const sections = new Map<SectionKind, Section>();
  const otherSections: Adr['otherSections'] = [];
  let language: Language | null = null;
  for (const section of layout.sections) {
    const known = sectionOf(section.heading);
    if (!known || sections.has(known.kind)) {
      otherSections.push({ heading: section.heading, body: textOf(layout.lines, section.line + 1, section.end) });
      continue;
    }
    sections.set(known.kind, section);
    language ??= known.language;
  }

  const sectionText = (kind: SectionKind): string => {
    const section = sections.get(kind);
    if (!section) return '';
    return textOf(layout.lines, section.line + 1, section.end);
  };

  let propositions = addProsAndCons(layout, sections.get('prosCons'), optionsFrom(layout, sections.get('options')));
  propositions = propositions.map((proposition, index) => ({ ...proposition, id: `P${index + 1}` }));
  if (propositions.length === 0) {
    issues.push(makeIssue((sections.get('options')?.line ?? 0) + 1, 'warning', 'noOptions'));
  }

  const rawStatus = scalar(values.get('status') ?? values.get('statut'));
  const reading = readStatus(rawStatus);
  if (!reading.known) {
    issues.push(makeIssue(frontmatterLine(layout, 'status'), 'warning', 'unknownStatus', { status: rawStatus ?? '' }));
  }

  const outcomeSection = sections.get('outcome');
  const lead = outcomeSection ? textOf(layout.lines, leadRange(outcomeSection).start, leadRange(outcomeSection).end) : '';
  const outcome = readOutcome(lead, propositions);
  if (outcome.unmatched.length > 0) {
    issues.push(makeIssue((outcomeSection?.line ?? 0) + 1, 'warning', 'unmatchedChosenOption', { titles: outcome.unmatched.map((title) => `"${title}"`).join(', ') }));
  }

  const dateValue = scalar(values.get('date'));
  const date = dateValue !== null && DATE_PATTERN.test(dateValue) ? dateValue : null;
  const nextReviewValue = scalar(pick(values, 'next review', 'prochaine revue'));
  const decision: Decision | null =
    reading.status === 'à décider'
      ? null
      : {
          status: reading.status,
          // A superseded or deprecated ADR keeps the options it had chosen (its outcome sentence is left as decided).
          retained: reading.status === 'validée' || reading.status === 'remplacée' || reading.status === 'obsolète' ? outcome.chosen : [],
          date,
          nextReview: reading.status === 'reportée' && nextReviewValue !== null && DATE_PATTERN.test(nextReviewValue) ? nextReviewValue : null,
          replacedBy: reading.replacedBy,
          comment: outcome.comment,
        };

  if (id === null || layout.title === null || issues.some((issue) => issue.severity === 'error')) return { adr: null, issues };

  const adr: Adr = {
    id,
    file: fileName,
    title: cleanTitle(layout.title.text) || layout.title.text,
    status: reading.status,
    rawStatus,
    tags: list(pick(values, 'tags', 'etiquettes')),
    date,
    deciders: list(pick(values, 'decision makers', 'deciders', 'decideurs')),
    consulted: list(values.get('consulted')),
    informed: list(values.get('informed')),
    otherMetadata: otherMetadata(layout),
    context: sectionText('context'),
    drivers: sectionText('drivers'),
    propositions,
    recommended: reading.status === 'à décider' ? outcome.chosen : [],
    rationale: reading.status === 'à décider' ? outcome.comment : null,
    decision,
    outcomeDetails: outcomeSection ? textOf(layout.lines, leadRange(outcomeSection).end, outcomeSection.end) : '',
    moreInfo: sectionText('moreInfo'),
    otherSections,
    language: language ?? 'en',
  };
  return { adr, issues };
}

export function hasErrors(issues: ParseIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

export class AdrParseError extends Error {
  constructor(readonly issues: ParseIssue[]) {
    super(issues.filter((issue) => issue.severity === 'error').map((issue) => `line ${issue.line}: ${issueMessage(issue, 'en')}`).join('\n'));
    this.name = 'AdrParseError';
  }
}

/** Parses a file and throws when it cannot be read as an ADR. */
export function parseMadrStrict(content: string, fileName: string): Adr {
  const { adr, issues } = parseMadr(content, fileName);
  if (adr === null) throw new AdrParseError(issues);
  return adr;
}
