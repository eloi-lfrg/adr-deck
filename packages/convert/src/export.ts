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
import { LABELS, STATUS_COLORS, type ExportLanguage, type Labels } from './styles.ts';

const HEADING_FONT = 'Georgia';
const BODY_FONT = 'Arial';
const INK = '1F2937';
const ACCENT = '1E3A8A';

const STYLES: IStylesOptions = {
  default: {
    document: { run: { font: BODY_FONT, size: 22, color: INK }, paragraph: { spacing: { after: 120, line: 300 } } },
    title: { run: { font: HEADING_FONT, size: 56, color: INK }, paragraph: { spacing: { after: 240 } } },
    heading1: { run: { font: HEADING_FONT, size: 36, color: INK }, paragraph: { spacing: { before: 240, after: 160 } } },
    heading2: { run: { font: HEADING_FONT, size: 28, color: ACCENT }, paragraph: { spacing: { before: 280, after: 120 } } },
    heading3: { run: { font: HEADING_FONT, size: 24, bold: true, color: INK }, paragraph: { spacing: { before: 200, after: 80 } } },
  },
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
      runs.push(new TextRun({ text: token.slice(1, -1), font: 'Courier New', ...base }));
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

/** Renders markdown blocks (paragraphs and bullet lists) as Normal paragraphs. */
function markdownParagraphs(markdown: string): Paragraph[] {
  if (markdown.trim() === '') return [];
  const paragraphs: Paragraph[] = [];
  for (const block of markdown.split(/\n\s*\n/u)) {
    const lines = block.split('\n');
    if (lines.every((line) => BULLET_LINE.test(line))) {
      for (const line of lines) {
        paragraphs.push(new Paragraph({ children: inlineRuns(BULLET_LINE.exec(line)![1]!), bullet: { level: 0 } }));
      }
    } else {
      paragraphs.push(new Paragraph({ children: multilineRuns(lines) }));
    }
  }
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

function cell(text: string, options: { bold?: boolean; fill?: string; width?: number } = {}): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: inlineRuns(text, { bold: options.bold ?? false }), spacing: { after: 0 } })],
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    ...(options.width !== undefined ? { width: { size: options.width, type: WidthType.PERCENTAGE } } : {}),
    ...(options.fill !== undefined ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: options.fill } } : {}),
  });
}

function statusCell(status: Status, labels: Labels, width?: number): TableCell {
  return cell(labels.statuses[status], { fill: STATUS_COLORS[status], bold: true, ...(width !== undefined ? { width } : {}) });
}

/** Two-column key/value table. */
function keyValueTable(rows: [string, string, boolean][], labels: Labels): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: rows.map(
      ([key, value, isStatus]) =>
        new TableRow({
          children: [cell(key, { bold: true, width: 28, fill: 'F5F5F4' }), isStatus ? statusCell(value as Status, labels, 72) : cell(value, { width: 72 })],
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
            children: [cell(adr.id, { width: 14 }), cell(adr.title, { width: 52 }), statusCell(adr.status, labels, 18), cell(adr.decision?.date ?? labels.empty, { width: 16 })],
          }),
      ),
    ],
  });
}

function argumentParagraphs(label: string, values: string[], colon: string): Paragraph[] {
  return values.map((value) => new Paragraph({ children: [new TextRun({ text: `${label}${colon}`, bold: true }), ...inlineRuns(value)], bullet: { level: 0 } }));
}

function adrSection(adr: Adr, labels: Labels): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [new Paragraph({ text: `${adr.id} · ${adr.title}`, heading: HeadingLevel.HEADING_1, pageBreakBefore: true })];

  const meta: [string, string, boolean][] = [
    [labels.status, adr.status, true],
    [labels.file, adr.file, false],
  ];
  if (adr.tags.length > 0) meta.push([labels.tags, adr.tags.join(', '), false]);
  if (adr.deciders.length > 0) meta.push([labels.deciders, adr.deciders.join(', '), false]);
  children.push(keyValueTable(meta, labels));

  if (adr.context !== '') {
    children.push(new Paragraph({ text: labels.context, heading: HeadingLevel.HEADING_2 }));
    children.push(...markdownParagraphs(adr.context));
  }
  if (adr.drivers !== '') {
    children.push(new Paragraph({ text: labels.drivers, heading: HeadingLevel.HEADING_2 }));
    children.push(...markdownParagraphs(adr.drivers));
  }

  if (adr.propositions.length > 0) {
    children.push(new Paragraph({ text: labels.options, heading: HeadingLevel.HEADING_2 }));
    for (const proposition of adr.propositions) {
      children.push(new Paragraph({ text: `${proposition.id} · ${proposition.title}`, heading: HeadingLevel.HEADING_3 }));
      children.push(...markdownParagraphs(proposition.body));
      children.push(...argumentParagraphs(labels.pros, proposition.pros, labels.colon), ...argumentParagraphs(labels.cons, proposition.cons, labels.colon));
    }
  }

  if (adr.decision !== null) {
    const decision = adr.decision;
    const titles = decision.retained.map((id) => `${id} · ${adr.propositions.find((proposition) => proposition.id === id)?.title ?? ''}`);
    children.push(new Paragraph({ text: labels.decision, heading: HeadingLevel.HEADING_2 }));
    const rows: [string, string, boolean][] = [
      [labels.status, adr.status, true],
      [labels.retained, titles.length > 0 ? titles.join(', ') : labels.empty, false],
      [labels.date, decision.date ?? labels.empty, false],
    ];
    if (decision.nextReview !== null) rows.push([labels.nextReview, decision.nextReview, false]);
    if (decision.replacedBy !== null) rows.push([labels.replacedBy, decision.replacedBy, false]);
    if (decision.comment !== null) rows.push([labels.comment, decision.comment, false]);
    children.push(keyValueTable(rows, labels));
  }
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
