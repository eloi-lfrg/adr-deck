import mammoth from 'mammoth';
import { HTMLElement, NodeType, parse, type Node } from 'node-html-parser';
import { isMadrFileName, madrFileName, normalizeKey, serializeMadr, STATUSES, type Language, type MadrDraft, type Status } from '@adr/format';
import { CODE_BLOCK_STYLE, EXPORT_LANGUAGES, INLINE_CODE_STYLE, LABELS, type Labels } from './styles.ts';

/** A problem found in the .docx; `location` points to the ADR or section concerned. */
export interface ImportIssue {
  location: string;
  message: string;
}

export interface ImportedFile {
  /** MADR file name (`NNNN-title.md`). */
  name: string;
  /** ID read from the document (`ADR-0007`). */
  id: string;
  content: string;
}

export interface DocxImport {
  /** Document title (cover page). */
  title: string | null;
  files: ImportedFile[];
  issues: ImportIssue[];
}

export interface DocxImportOptions {
  /** Language of the MADR headings written for each ADR (default English, the MADR template language). */
  language?: (id: string, fileName: string) => Language;
}

export class DocxImportError extends Error {
  constructor(readonly issues: ImportIssue[]) {
    super(issues.map((issue) => `${issue.location}: ${issue.message}`).join('\n'));
    this.name = 'DocxImportError';
  }
}

/** Word styles of an exported document → HTML. Built-in style names are stored in English in .docx files. */
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Heading 1'] => h2:fresh",
  "p[style-name='heading 1'] => h2:fresh",
  "p[style-name='Heading 2'] => h3:fresh",
  "p[style-name='heading 2'] => h3:fresh",
  "p[style-name='Heading 3'] => h4:fresh",
  "p[style-name='heading 3'] => h4:fresh",
  "p[style-name='Heading 4'] => h5:fresh",
  "p[style-name='heading 4'] => h5:fresh",
  `p[style-name='${CODE_BLOCK_STYLE}'] => pre:separator('\\n')`,
  `r[style-name='${INLINE_CODE_STYLE}'] => code`,
];

// ---------------------------------------------------------------------------
// Labels of every export language, matched loosely.

type FieldKey = 'status' | 'file' | 'date' | 'deciders' | 'consulted' | 'informed' | 'tags' | 'retained' | 'nextReview' | 'replacedBy' | 'comment';
type SectionKey = 'context' | 'drivers' | 'options' | 'decision' | 'moreInfo';

function labelTable<K extends keyof Labels>(keys: readonly K[]): Map<string, K> {
  const table = new Map<string, K>();
  for (const language of EXPORT_LANGUAGES) for (const key of keys) table.set(normalizeKey(String(LABELS[language][key])), key);
  return table;
}

const FIELDS = labelTable<FieldKey>(['status', 'file', 'date', 'deciders', 'consulted', 'informed', 'tags', 'retained', 'nextReview', 'replacedBy', 'comment']);
const SECTIONS = labelTable<SectionKey>(['context', 'drivers', 'options', 'decision', 'moreInfo']);


const STATUS_LABELS = new Map<string, Status>();
for (const language of EXPORT_LANGUAGES) for (const status of STATUSES) STATUS_LABELS.set(normalizeKey(LABELS[language].statuses[status]), status);

/** `Pro: …` / `Pour : …` / `A favor: …` bullets of an option. */
const ARGUMENT_PREFIXES: [RegExp, 'pros' | 'cons'][] = EXPORT_LANGUAGES.flatMap((language) => [
  [new RegExp(`^${escape(LABELS[language].pros)}\\s*:\\s*`, 'iu'), 'pros'] as [RegExp, 'pros'],
  [new RegExp(`^${escape(LABELS[language].cons)}\\s*:\\s*`, 'iu'), 'cons'] as [RegExp, 'cons'],
]);

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

// ---------------------------------------------------------------------------
// HTML → markdown

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === NodeType.ELEMENT_NODE;
}

/** Inline markdown of an element (bold, italic, code, links, line breaks). */
function inline(node: Node): string {
  if (!isElement(node)) return node.nodeType === NodeType.TEXT_NODE ? node.text : '';
  const inner = node.childNodes.map(inline).join('');
  switch (node.tagName) {
    case 'STRONG':
    case 'B':
      return inner.trim() === '' ? inner : `**${inner}**`;
    case 'EM':
    case 'I':
      return inner.trim() === '' ? inner : `*${inner}*`;
    case 'CODE':
      return `\`${node.text}\``;
    case 'A': {
      const href = node.getAttribute('href');
      return href && !href.startsWith('#') ? `[${inner}](${href})` : inner;
    }
    case 'BR':
      return '\n';
    default:
      return inner;
  }
}

/** Plain text of an element (labels, metadata), lines kept. */
function plain(node: HTMLElement): string {
  return node
    .querySelectorAll('p')
    .map((paragraph) => paragraph.text)
    .join('\n')
    .trim() || node.text.trim();
}

/** Markdown of one block element (paragraph, list, code block, heading inside a section). */
function block(node: HTMLElement): string {
  switch (node.tagName) {
    case 'UL':
      return node.childNodes.filter(isElement).map((item) => `* ${inline(item).trim()}`).join('\n');
    case 'OL':
      return node.childNodes.filter(isElement).map((item, index) => `${index + 1}. ${inline(item).trim()}`).join('\n');
    case 'PRE':
      return `\`\`\`\n${node.text.replace(/\n$/u, '')}\n\`\`\``;
    case 'H5':
    case 'H6':
      return `### ${inline(node).trim()}`;
    case 'TABLE':
      return node
        .querySelectorAll('tr')
        .map((row) => `| ${row.querySelectorAll('td, th').map((cellNode) => plain(cellNode).replace(/\n/gu, ' ')).join(' | ')} |`)
        .join('\n');
    default:
      return inline(node).trim();
  }
}

function markdown(nodes: HTMLElement[]): string {
  return nodes
    .map(block)
    .filter((text) => text !== '')
    .join('\n\n');
}

function rows(table: HTMLElement): [string, HTMLElement][] {
  return table.querySelectorAll('tr').flatMap((row) => {
    const cells = row.querySelectorAll('td, th');
    return cells.length >= 2 ? [[plain(cells[0]!), cells[1]!] as [string, HTMLElement]] : [];
  });
}

function list(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Document → ADR drafts

interface RawAdr {
  heading: string;
  /** Blocks between the ADR heading and its first section. */
  intro: HTMLElement[];
  sections: { heading: string; blocks: HTMLElement[] }[];
}

function splitDocument(root: HTMLElement): { title: string | null; adrs: RawAdr[] } {
  let title: string | null = null;
  const adrs: RawAdr[] = [];
  for (const node of root.childNodes.filter(isElement)) {
    const current = adrs.at(-1);
    if (node.tagName === 'H1') title ??= node.text.trim();
    else if (node.tagName === 'H2') adrs.push({ heading: node.text.trim(), intro: [], sections: [] });
    else if (!current) continue; // cover page and summary table
    else if (node.tagName === 'H3') current.sections.push({ heading: node.text.trim(), blocks: [] });
    else if (current.sections.length === 0) current.intro.push(node);
    else current.sections.at(-1)!.blocks.push(node);
  }
  return { title, adrs };
}

interface Parsed {
  id: string;
  fileName: string;
  draft: Omit<MadrDraft, 'language'>;
}

function readAdr(raw: RawAdr, issues: ImportIssue[]): Parsed | null {
  const match = /^ADR-?(\d+)\s*[·•:–—-]\s*(.+)$/u.exec(raw.heading);
  const location = match ? `ADR-${match[1]!}` : `"${raw.heading}"`;
  if (!match) {
    issues.push({ location, message: 'heading is not "ADR-NNNN · Title": section skipped.' });
    return null;
  }
  const id = `ADR-${match[1]!}`;
  const draft: Omit<MadrDraft, 'language'> = {
    title: match[2]!.trim(),
    status: 'à décider',
    replacedBy: null,
    date: null,
    nextReview: null,
    deciders: [],
    consulted: [],
    informed: [],
    tags: [],
    otherMetadata: [],
    context: '',
    drivers: '',
    propositions: [],
    chosen: [],
    comment: null,
    outcomeDetails: '',
    moreInfo: '',
    otherSections: [],
  };
  let fileName: string | null = null;

  const readStatusCell = (text: string): void => {
    const status = STATUS_LABELS.get(normalizeKey(text));
    if (status === undefined) issues.push({ location: id, message: `unknown status "${text}": read as proposed.` });
    else draft.status = status;
  };

  const metaTable = raw.intro.find((node) => node.tagName === 'TABLE');
  for (const [label, valueCell] of metaTable ? rows(metaTable) : []) {
    const value = plain(valueCell);
    switch (FIELDS.get(normalizeKey(label))) {
      case 'status':
        readStatusCell(value);
        break;
      case 'file':
        fileName = value;
        break;
      case 'date':
        draft.date = /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
        break;
      case 'deciders':
        draft.deciders = list(value);
        break;
      case 'consulted':
        draft.consulted = list(value);
        break;
      case 'informed':
        draft.informed = list(value);
        break;
      case 'tags':
        draft.tags = list(value);
        break;
      default:
        // Front matter key the app does not use: kept as written.
        draft.otherMetadata.push([label, value]);
    }
  }

  for (const section of raw.sections) {
    const kind = SECTIONS.get(normalizeKey(section.heading));
    if (kind === 'context') draft.context = markdown(section.blocks);
    else if (kind === 'drivers') draft.drivers = markdown(section.blocks);
    else if (kind === 'moreInfo') draft.moreInfo = markdown(section.blocks);
    else if (kind === 'options') readOptions(section.blocks, draft);
    else if (kind === 'decision') readDecision(section.blocks, draft, id, issues, readStatusCell);
    else draft.otherSections.push({ heading: section.heading, body: markdown(section.blocks) });
  }

  const name = fileName !== null && isMadrFileName(fileName) ? fileName : madrFileName(match[1]!, draft.title);
  if (fileName !== null && !isMadrFileName(fileName)) issues.push({ location: id, message: `file name "${fileName}" is not NNNN-title.md: written as ${name}.` });
  return { id, fileName: name, draft };
}

function readOptions(blocks: HTMLElement[], draft: Omit<MadrDraft, 'language'>): void {
  const options: { title: string; body: string[]; pros: string[]; cons: string[] }[] = [];
  for (const node of blocks) {
    if (node.tagName === 'H4') {
      options.push({ title: node.text.trim().replace(/^P\d+\s*[·•:–—-]\s*/u, ''), body: [], pros: [], cons: [] });
      continue;
    }
    const current = options.at(-1);
    if (!current) continue;
    if (node.tagName !== 'UL') {
      current.body.push(block(node));
      continue;
    }
    // `Pro: …` / `Con: …` bullets are the arguments; other bullets stay in the description.
    const others: string[] = [];
    for (const item of node.childNodes.filter(isElement)) {
      const text = inline(item).trim();
      const unlabelled = text.replace(/^\*\*([^*]+)\*\*\s*/u, '$1 ');
      const argument = ARGUMENT_PREFIXES.find(([prefix]) => prefix.test(unlabelled));
      if (argument) current[argument[1]].push(unlabelled.replace(argument[0], '').trim());
      else others.push(`* ${text}`);
    }
    if (others.length > 0) current.body.push(others.join('\n'));
  }
  draft.propositions = options.map(({ title, body, pros, cons }) => ({ title, body: body.filter(Boolean).join('\n\n'), pros, cons }));
}

function readDecision(
  blocks: HTMLElement[],
  draft: Omit<MadrDraft, 'language'>,
  id: string,
  issues: ImportIssue[],
  readStatusCell: (text: string) => void,
): void {
  const table = blocks.find((node) => node.tagName === 'TABLE');
  for (const [label, valueCell] of table ? rows(table) : []) {
    const value = plain(valueCell);
    switch (FIELDS.get(normalizeKey(label))) {
      case 'status':
        readStatusCell(value);
        break;
      case 'retained':
        draft.chosen = chosenOptions(value, draft, id, issues);
        break;
      case 'date':
        if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) draft.date = value;
        break;
      case 'nextReview':
        draft.nextReview = /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
        break;
      case 'replacedBy':
        draft.replacedBy = /^ADR-\d{3,}$/u.test(value) ? value : null;
        break;
      case 'comment':
        draft.comment = valueCell.querySelectorAll('p').map(inline).join(' ').trim() || null;
        break;
      default:
        break;
    }
  }
  draft.outcomeDetails = markdown(blocks.filter((node) => node !== table));
}

/** `P1 · Title, P3 · Title` → option indexes (by number, or by title when renumbered). */
function chosenOptions(value: string, draft: Omit<MadrDraft, 'language'>, id: string, issues: ImportIssue[]): number[] {
  if (value === '' || value === '—') return [];
  const chosen: number[] = [];
  for (const part of value.split(/,\s*(?=P\d+\s*[·•:–—-])/u)) {
    const match = /^P(\d+)\s*[·•:–—-]\s*(.*)$/u.exec(part.trim());
    const byTitle = draft.propositions.findIndex((proposition) => normalizeKey(proposition.title) === normalizeKey(match?.[2] ?? part));
    const index = byTitle !== -1 ? byTitle : match ? Number(match[1]) - 1 : -1;
    if (index >= 0 && index < draft.propositions.length) chosen.push(index);
    else issues.push({ location: id, message: `chosen option "${part.trim()}" is not among the considered options.` });
  }
  return [...new Set(chosen)];
}

/**
 * Reads a .docx exported by adr-deck (possibly edited in Word or Google Docs) back into MADR files.
 * Throws `DocxImportError` when the document holds no ADR section.
 */
export async function importDocx(buffer: Buffer, options: DocxImportOptions = {}): Promise<DocxImport> {
  const { value: html } = await mammoth.convertToHtml({ buffer }, { styleMap: STYLE_MAP });
  const { title, adrs } = splitDocument(parse(html));
  const issues: ImportIssue[] = [];
  if (adrs.length === 0) {
    throw new DocxImportError([{ location: 'document', message: 'no "ADR-NNNN · Title" heading (Heading 1) found: is this a .docx exported by adr-deck?' }]);
  }
  const files: ImportedFile[] = [];
  const names = new Set<string>();
  for (const raw of adrs) {
    const parsed = readAdr(raw, issues);
    if (parsed === null) continue;
    if (names.has(parsed.fileName) || files.some((file) => file.id === parsed.id)) {
      issues.push({ location: parsed.id, message: 'duplicate ADR number: section skipped.' });
      continue;
    }
    names.add(parsed.fileName);
    const language = options.language?.(parsed.id, parsed.fileName) ?? 'en';
    files.push({ name: parsed.fileName, id: parsed.id, content: serializeMadr({ ...parsed.draft, language }) });
  }
  return { title, files, issues };
}
