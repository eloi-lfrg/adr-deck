/** Line-level structure of a MADR file, used both to read it and to edit it in place. */

export interface Block {
  heading: string;
  /** Index of the heading line. */
  line: number;
  /** Index of the first line after the block (exclusive). */
  end: number;
}

export interface Section extends Block {
  /** `###` subsections, in order. */
  subsections: Block[];
}

export interface Layout {
  eol: string;
  /** Lines of the file, without the trailing newlines. */
  lines: string[];
  /** Newline sequence(s) ending the file, kept so that edits do not touch them. */
  trailing: string;
  /** Indexes of the opening and closing `---` lines. */
  frontmatter: { open: number; close: number } | null;
  title: { line: number; text: string } | null;
  sections: Section[];
}

const FENCE = /^\s{0,3}(```|~~~)/u;

export function splitLines(content: string): { eol: string; lines: string[]; trailing: string } {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const trailing = /(?:\r?\n)*$/u.exec(content)?.[0] ?? '';
  const body = content.slice(0, content.length - trailing.length);
  return { eol, lines: body === '' ? [] : body.split(eol), trailing };
}

export function joinLines(layout: Pick<Layout, 'eol' | 'lines' | 'trailing'>): string {
  return layout.lines.join(layout.eol) + layout.trailing;
}

export function analyze(content: string): Layout {
  const { eol, lines, trailing } = splitLines(content);
  let frontmatter: Layout['frontmatter'] = null;
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((line, index) => index > 0 && (line.trim() === '---' || line.trim() === '...'));
    if (close !== -1) frontmatter = { open: 0, close };
  }

  let title: Layout['title'] = null;
  const sections: Section[] = [];
  let inFence = false;
  for (let index = frontmatter === null ? 0 : frontmatter.close + 1; index < lines.length; index++) {
    const line = lines[index]!;
    if (FENCE.test(line)) inFence = !inFence;
    if (inFence) continue;
    const heading = /^(#{1,3})\s+(.+?)\s*#*\s*$/u.exec(line);
    if (!heading) continue;
    const level = heading[1]!.length;
    const text = heading[2]!;
    const current = sections.at(-1);
    if (level === 1) {
      if (title === null) title = { line: index, text };
    } else if (level === 2) {
      if (current) closeSection(current, index);
      sections.push({ heading: text, line: index, end: lines.length, subsections: [] });
    } else if (current) {
      const previous = current.subsections.at(-1);
      if (previous) previous.end = index;
      current.subsections.push({ heading: text, line: index, end: lines.length });
    }
  }
  return { eol, lines, trailing, frontmatter, title, sections };
}

function closeSection(section: Section, end: number): void {
  section.end = end;
  const last = section.subsections.at(-1);
  if (last) last.end = end;
}

/** Lines of a block below its heading, up to its first subsection when there is one. */
export function leadRange(section: Section): { start: number; end: number } {
  return { start: section.line + 1, end: section.subsections[0]?.line ?? section.end };
}

/** Text between two line indexes, with HTML comments removed and outer blank lines trimmed. */
export function textOf(lines: string[], start: number, end: number): string {
  return lines
    .slice(start, end)
    .join('\n')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/^\s*\n|\n\s*$/gu, '')
    .trim();
}
