import { makeIssue } from './issues.ts';
import { analyze, leadRange, textOf } from './layout.ts';
import { parseMadr } from './parse.ts';
import type { ParseIssue } from './schema.ts';
import { outcomeParts } from './sections.ts';
import { sectionOf } from './vocabulary.ts';

/** markdownlint rules checked by `validate --strict`: the defaults of the MADR `.markdownlint.yml`, without MD013 and MD024. */
export const MARKDOWNLINT_RULES = ['MD001', 'MD004', 'MD009', 'MD010', 'MD012', 'MD018', 'MD019', 'MD022', 'MD023', 'MD025', 'MD031', 'MD032', 'MD034', 'MD040', 'MD041', 'MD047'] as const;
export type MarkdownlintRule = (typeof MARKDOWNLINT_RULES)[number];

const FENCE = /^(\s*)(```+|~~~+)\s*([^\s`]*)/u;
const ATX = /^(#{1,6})(\s*)(.*)$/u;
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+/u;
const BARE_URL = /(^|[\s(])(https?:\/\/[^\s)<>]+)/u;

interface Line {
  /** 0-based index in the file. */
  index: number;
  text: string;
  /** Inside a fenced code block (fence lines excluded). */
  code: boolean;
  fence: 'open' | 'close' | null;
}

function scan(lines: string[], from: number): Line[] {
  const result: Line[] = [];
  let open: string | null = null;
  for (let index = from; index < lines.length; index++) {
    const text = lines[index]!;
    const fence = FENCE.exec(text);
    if (fence && open === null) {
      open = fence[2]!.slice(0, 3);
      result.push({ index, text, code: false, fence: 'open' });
    } else if (fence && open !== null && fence[2]!.startsWith(open) && fence[3] === '') {
      open = null;
      result.push({ index, text, code: false, fence: 'close' });
    } else {
      result.push({ index, text, code: open !== null, fence: null });
    }
  }
  return result;
}

const blank = (line: Line | undefined): boolean => line === undefined || line.text.trim() === '';

/** markdownlint checks of the MADR configuration, on the markdown after the front matter. */
function markdownlint(content: string): ParseIssue[] {
  const layout = analyze(content);
  const start = layout.frontmatter === null ? 0 : layout.frontmatter.close + 1;
  const lines = scan(layout.lines, start);
  const issues: ParseIssue[] = [];
  const report = (line: Line | number, rule: MarkdownlintRule): void => {
    issues.push(makeIssue((typeof line === 'number' ? line : line.index) + 1, 'warning', 'markdownlint', { rule }));
  };

  let previousLevel = 0;
  let titles = 0;
  let listMarker: string | null = null;
  const firstContent = lines.find((line) => !blank(line));
  if (firstContent !== undefined && !/^#\s/u.test(firstContent.text)) report(firstContent, 'MD041');

  lines.forEach((line, position) => {
    const before = lines[position - 1];
    const after = lines[position + 1];
    if (line.code) return;
    if (line.fence === 'open') {
      if (!blank(before) && position > 0) report(line, 'MD031');
      if ((FENCE.exec(line.text)?.[3] ?? '') === '') report(line, 'MD040');
      return;
    }
    if (line.fence === 'close') {
      if (!blank(after)) report(line, 'MD031');
      return;
    }
    const trailing = /\s+$/u.exec(line.text)?.[0] ?? '';
    if (trailing !== '' && line.text.trim() !== '' && trailing !== '  ') report(line, 'MD009');
    if (line.text.includes('\t')) report(line, 'MD010');
    if (blank(line) && blank(before) && position > 0 && before !== undefined) report(line, 'MD012');
    if (BARE_URL.test(line.text.replace(/\[[^\]]*\]\([^)]*\)|<[^>]+>|`[^`]*`/gu, ''))) report(line, 'MD034');

    if (/^ {1,3}#{1,6}\s/u.test(line.text)) report(line, 'MD023');
    const heading = ATX.exec(line.text);
    if (heading) {
      const level = heading[1]!.length;
      if (heading[2] === '' && heading[3] !== '') report(line, 'MD018');
      else if (heading[2]!.length > 1) report(line, 'MD019');
      if (previousLevel > 0 && level > previousLevel + 1) report(line, 'MD001');
      previousLevel = level;
      if (level === 1 && ++titles > 1) report(line, 'MD025');
      if ((position > 0 && !blank(before)) || !blank(after)) report(line, 'MD022');
      return;
    }

    const item = LIST_ITEM.exec(line.text);
    if (item) {
      const marker = item[1]!;
      if (/^[-*+]$/u.test(marker) && /^\S/u.test(line.text)) {
        listMarker ??= marker;
        if (marker !== listMarker) report(line, 'MD004');
      }
      const previousIsList = before !== undefined && !blank(before) && (LIST_ITEM.test(before.text) || /^\s+\S/u.test(before.text));
      if (!blank(before) && !previousIsList && position > 0) report(line, 'MD032');
      const nextContinues = after !== undefined && (LIST_ITEM.test(after.text) || /^\s+\S/u.test(after.text));
      if (!blank(after) && !nextContinues) report(line, 'MD032');
    }
  });

  const last = layout.trailing;
  if (last !== '\n' && last !== '\r\n') issues.push(makeIssue(Math.max(layout.lines.length, 1), 'warning', 'markdownlint', { rule: 'MD047' }));
  return issues;
}

/**
 * Stricter checks than `parseMadr`, for `validate --strict`: what every MADR template (full, minimal, bare) has —
 * context and, once decided, a « Decision Outcome » —, a `### Confirmation` for an accepted ADR, and the markdownlint
 * rules of the MADR configuration. Optional sections (drivers, pros and cons, more information, metadata) are not
 * required, so a minimal MADR file passes.
 */
export function lintMadr(content: string, fileName: string): ParseIssue[] {
  const { adr } = parseMadr(content, fileName);
  if (adr === null) return [];
  const issues: ParseIssue[] = [];
  const layout = analyze(content);
  const find = (kind: string) => layout.sections.find((section) => sectionOf(section.heading)?.kind === kind);
  const titleLine = (layout.title?.line ?? 0) + 1;

  if (adr.context === '') issues.push(makeIssue((find('context')?.line ?? titleLine - 1) + 1, 'warning', 'missingContext'));
  const outcome = find('outcome');
  const lead = outcome ? textOf(layout.lines, leadRange(outcome).start, leadRange(outcome).end) : '';
  if (adr.status !== 'à décider' && lead === '') issues.push(makeIssue((outcome?.line ?? titleLine - 1) + 1, 'warning', 'missingOutcome'));
  if (adr.status === 'validée' && outcomeParts(adr).confirmation === '') issues.push(makeIssue((outcome?.line ?? titleLine - 1) + 1, 'warning', 'missingConfirmation'));
  issues.push(...markdownlint(content));
  return issues.sort((a, b) => a.line - b.line);
}
