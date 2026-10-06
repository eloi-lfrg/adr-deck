import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IStylesOptions,
  type ParagraphChild,
} from 'docx';
import { parisDate, type Adr, type Status } from '@adr/format';
import { CODE_BLOCK_STYLE, INLINE_CODE_STYLE, LABELS, STATUS_COLORS, type ExportLanguage, type Labels } from './styles.ts';

/*
 * Document structure, read back by `importDocx`:
 *   Title                  project name, then the cover page and the summary table
 *   Heading 1              `ADR-0007 · Title`, then a key/value table (status, file, date, people, tags, other metadata)
 *   Heading 2              a section: context, decision drivers, considered options, decision, more information, or any other MADR section
 *   Heading 3              an option (`P1 · Title`) in « considered options »
 *   Heading 4              a markdown heading inside a section (`### Consequences`)
 *   « Source Code » style  a fenced code block; « Inline Code » character style for `code`
 */

const HEADING_FONT = 'Georgia';
const BODY_FONT = 'Arial';
const CODE_FONT = 'Courier New';
const INK = '1F2937';
const ACCENT = '1E3A8A';

const STYLES: IStylesOptions = {
  default: {
    document: { run: { font: BODY_FONT, size: 22, color: INK }, paragraph: { spacing: { after: 120, line: 300 } } },
    title: { run: { font: HEADING_FONT, size: 56, color: INK }, paragraph: { spacing: { after: 240 } } },
    heading1: { run: { font: HEADING_FONT, size: 36, color: INK }, paragraph: { spacing: { before: 240, after: 160 } } },
    heading2: { run: { font: HEADING_FONT, size: 28, color: ACCENT }, paragraph: { spacing: { before: 280, after: 120 } } },
    heading3: { run: { font: HEADING_FONT, size: 24, bold: true, color: INK }, paragraph: { spacing: { before: 200, after: 80 } } },
    heading4: { run: { font: BODY_FONT, size: 22, bold: true, color: INK }, paragraph: { spacing: { before: 160, after: 60 } } },
  },
  paragraphStyles: [
    {
      id: 'SourceCode',
      name: CODE_BLOCK_STYLE,
      basedOn: 'Normal',
      run: { font: CODE_FONT, size: 19 },
      paragraph: { spacing: { after: 0, line: 260 } },
    },
  ],
  characterStyles: [{ id: 'InlineCode', name: INLINE_CODE_STYLE, run: { font: CODE_FONT } }],
};

const INLINE_TOKEN = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/u;

/** Converts a line of inline markdown (bold, italic, code, links) into docx runs. */
function inlineRuns(text: string, base: { bold?: boolean } = {}): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  for (const token of text.split(INLINE_TOKEN)) {
    if (token === '') continue;
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    } else if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      runs.push(new TextRun({ text: token.slice(1, -1), style: 'InlineCode', ...base }));
    } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      runs.push(new TextRun({ text: token.slice(1, -1), italics: true, ...base }));
    } else if (token.startsWith('[')) {
      const match = /^\[([^\]]+)\]\(([^)\s]+)\)$/u.exec(token);
      if (match) {
        runs.push(new ExternalHyperlink({ link: match[2]!, children: [new TextRun({ text: match[1]!, style: 'Hyperlink' })] }));
      } else {
        runs.push(new TextRun({ text: token, ...base }));
      }
    } else {
      runs.push(new TextRun({ text: token, ...base }));
    }
  }
  return runs;
}

/** Converts a run of lines (one markdown paragraph) into runs with explicit line breaks. */
function multilineRuns(lines: string[]): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  lines.forEach((line, index) => {
    if (index > 0) runs.push(new TextRun({ text: '', break: 1 }));
    runs.push(...inlineRuns(line));
  });
  return runs;
}

const BULLET_LINE = /^\s*[-*+]\s+(.*)$/u;
const HEADING_LINE = /^#{1,6}\s+(.+?)\s*#*$/u;

/** Renders markdown: paragraphs, bullet lists, headings (Heading 4) and fenced code (Source Code style). */
function markdownParagraphs(markdown: string): Paragraph[] {
  if (markdown.trim() === '') return [];
  const paragraphs: Paragraph[] = [];
  markdown.split(/^```[^\n]*\n?/mu).forEach((part, index) => {
    if (index % 2 === 1) {
      for (const line of part.replace(/\n$/u, '').split('\n')) paragraphs.push(new Paragraph({ style: 'SourceCode', children: [new TextRun(line)] }));
      return;
    }
    for (const block of part.split(/\n\s*\n/u)) {
      const lines = block.split('\n').filter((line) => line.trim() !== '');
      if (lines.length === 0) continue;
      if (lines.length === 1 && HEADING_LINE.test(lines[0]!)) {
        paragraphs.push(new Paragraph({ children: inlineRuns(HEADING_LINE.exec(lines[0]!)![1]!), heading: HeadingLevel.HEADING_4 }));
      } else if (lines.every((line) => BULLET_LINE.test(line))) {
        for (const line of lines) paragraphs.push(new Paragraph({ children: inlineRuns(BULLET_LINE.exec(line)![1]!), bullet: { level: 0 } }));
      } else {
        paragraphs.push(new Paragraph({ children: multilineRuns(lines) }));
      }
    }
  });
  return paragraphs;
}

const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: 'D6D3D1' };
const tableBorders = {
  top: thinBorder,
  bottom: thinBorder,
  left: thinBorder,
  right: thinBorder,
  insideHorizontal: thinBorder,
  insideVertical: thinBorder,
};

interface CellOptions {
  bold?: boolean;
  fill?: string;
  width?: number;
  /** Plain text, one paragraph per line (metadata kept as written). */
  verbatim?: boolean;
}

function cell(text: string, options: CellOptions = {}): TableCell {
  const children = options.verbatim
    ? text.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)], spacing: { after: 0 } }))
    : [new Paragraph({ children: inlineRuns(text, { bold: options.bold ?? false }), spacing: { after: 0 } })];
  return new TableCell({
    children,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    ...(options.width !== undefined ? { width: { size: options.width, type: WidthType.PERCENTAGE } } : {}),
    ...(options.fill !== undefined ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: options.fill } } : {}),
  });
}

function statusCell(status: Status, labels: Labels, width?: number): TableCell {
  return cell(labels.statuses[status], { fill: STATUS_COLORS[status], bold: true, ...(width !== undefined ? { width } : {}) });
}

type Row = [label: string, value: string, kind: 'text' | 'status' | 'verbatim'];

/** Two-column key/value table. */
function keyValueTable(rows: Row[], labels: Labels): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: rows.map(
      ([key, value, kind]) =>
        new TableRow({
          children: [
            cell(key, { bold: true, width: 28, fill: 'F5F5F4', verbatim: kind === 'verbatim' }),
            kind === 'status' ? statusCell(value as Status, labels, 72) : cell(value, { width: 72, verbatim: kind === 'verbatim' }),
          ],
        }),
    ),
  });
}

function summaryTable(adrs: Adr[], labels: Labels): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [labels.id, labels.title, labels.status, labels.date].map((label) => cell(label, { bold: true, fill: 'E7E5E4' })),
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      header,
      ...adrs.map(
        (adr) =>
          new TableRow({
            children: [cell(adr.id, { width: 14 }), cell(adr.title, { width: 52 }), statusCell(adr.status, labels, 18), cell(adr.decision?.date ?? adr.date ?? labels.empty, { width: 16 })],
          }),
      ),
    ],
  });
}

function argumentParagraphs(label: string, values: string[], colon: string): Paragraph[] {
  return values.map((value) => new Paragraph({ children: [new TextRun({ text: `${label}${colon}`, bold: true }), ...inlineRuns(value)], bullet: { level: 0 } }));
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel], pageBreakBefore = false): Paragraph {
  return new Paragraph({ text, heading: level, pageBreakBefore });
}

function textSection(title: string, markdown: string): (Paragraph | Table)[] {
  return [heading(title, HeadingLevel.HEADING_2), ...markdownParagraphs(markdown)];
}

function adrSection(adr: Adr, labels: Labels): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [heading(`${adr.id} · ${adr.title}`, HeadingLevel.HEADING_1, true)];

  const meta: Row[] = [
    [labels.status, adr.status, 'status'],
    [labels.file, adr.file, 'text'],
  ];
  if (adr.date !== null) meta.push([labels.date, adr.date, 'text']);
  if (adr.deciders.length > 0) meta.push([labels.deciders, adr.deciders.join(', '), 'text']);
  if (adr.consulted.length > 0) meta.push([labels.consulted, adr.consulted.join(', '), 'text']);
  if (adr.informed.length > 0) meta.push([labels.informed, adr.informed.join(', '), 'text']);
  if (adr.tags.length > 0) meta.push([labels.tags, adr.tags.join(', '), 'text']);
  for (const [key, value] of adr.otherMetadata) meta.push([key, value, 'verbatim']);
  children.push(keyValueTable(meta, labels));

  if (adr.context !== '') children.push(...textSection(labels.context, adr.context));
  if (adr.drivers !== '') children.push(...textSection(labels.drivers, adr.drivers));

  if (adr.propositions.length > 0) {
    children.push(heading(labels.options, HeadingLevel.HEADING_2));
    for (const proposition of adr.propositions) {
      children.push(heading(`${proposition.id} · ${proposition.title}`, HeadingLevel.HEADING_3));
      children.push(...markdownParagraphs(proposition.body));
      children.push(...argumentParagraphs(labels.pros, proposition.pros, labels.colon), ...argumentParagraphs(labels.cons, proposition.cons, labels.colon));
    }
  }

  // A proposed ADR may already name its recommended options: they are exported as its decision draft.
  const chosen = adr.decision?.retained.length ? adr.decision.retained : adr.recommended;
  const comment = adr.decision?.comment ?? adr.rationale;
  if (adr.decision !== null || chosen.length > 0 || comment !== null || adr.outcomeDetails !== '') {
    const titles = chosen.map((id) => `${id} · ${adr.propositions.find((proposition) => proposition.id === id)?.title ?? ''}`);
    children.push(heading(labels.decision, HeadingLevel.HEADING_2));
    const rows: Row[] = [
      [labels.status, adr.status, 'status'],
      [labels.retained, titles.length > 0 ? titles.join(', ') : labels.empty, 'text'],
      [labels.date, adr.decision?.date ?? labels.empty, 'text'],
    ];
    if (adr.decision?.nextReview) rows.push([labels.nextReview, adr.decision.nextReview, 'text']);
    if (adr.decision?.replacedBy) rows.push([labels.replacedBy, adr.decision.replacedBy, 'text']);
    if (comment !== null) rows.push([labels.comment, comment, 'text']);
    children.push(keyValueTable(rows, labels));
    children.push(...markdownParagraphs(adr.outcomeDetails));
  }

  for (const other of adr.otherSections) children.push(...textSection(other.heading, other.body));
  if (adr.moreInfo !== '') children.push(...textSection(labels.moreInfo, adr.moreInfo));
  return children;
}

export interface DocxExportInput {
  /** Title of the cover page (usually the project or directory name). */
  title: string;
  /** Decisions directory, shown on the cover page. */
  source: string;
  adrs: Adr[];
  now: Date;
  /** Language of the labels (the ADR texts stay as written). Defaults to English. */
  language?: ExportLanguage;
}

function coverPage({ title, source, adrs, now }: DocxExportInput, labels: Labels): (Paragraph | Table)[] {
  return [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { before: 2400 } }),
    new Paragraph({ children: [new TextRun({ text: `${labels.source}${labels.colon}`, bold: true }), new TextRun(source)] }),
    new Paragraph({ children: [new TextRun({ text: `${labels.generated}${labels.colon}`, bold: true }), new TextRun(parisDate(now))] }),
    new Paragraph({ children: [new TextRun({ text: labels.summary, bold: true, color: ACCENT })], spacing: { before: 480 } }),
    summaryTable(adrs, labels),
    new Paragraph({ text: '', alignment: AlignmentType.LEFT }),
  ];
}

/** Builds a `.docx` view of the MADR decisions: cover page, summary table, then one section per ADR. */
export async function exportDocx(input: DocxExportInput): Promise<Buffer> {
  const labels = LABELS[input.language ?? 'en'];
  const docx = new Document({
    title: input.title,
    description: labels.description,
    styles: STYLES,
    numbering: { config: [] },
    sections: [
      {
        properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } },
        children: [...coverPage(input, labels), ...input.adrs.flatMap((adr) => adrSection(adr, labels))],
      },
    ],
  });
  return Packer.toBuffer(docx);
}
