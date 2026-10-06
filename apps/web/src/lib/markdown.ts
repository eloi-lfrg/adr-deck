/** Minimal, safe markdown model for ADR texts (no HTML injection: rendered through Vue templates). */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'break' };

export type Block =
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'code'; text: string };

const INLINE_TOKEN = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/u;
const BULLET = /^\s*[-*+]\s+(.*)$/u;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/u;

function safeHref(href: string): string | null {
  return /^(https?:|mailto:)/iu.test(href) ? href : null;
}

export function parseInline(text: string): Inline[] {
  const inlines: Inline[] = [];
  for (const token of text.split(INLINE_TOKEN)) {
    if (token === '') continue;
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) inlines.push({ kind: 'strong', text: token.slice(2, -2) });
    else if (token.startsWith('`') && token.endsWith('`') && token.length > 2) inlines.push({ kind: 'code', text: token.slice(1, -1) });
    else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) inlines.push({ kind: 'em', text: token.slice(1, -1) });
    else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/u.exec(token);
      const href = link ? safeHref(link[2]!) : null;
      if (link && href) inlines.push({ kind: 'link', text: link[1]!, href });
      else inlines.push({ kind: 'text', text: token });
    }
  }
  return inlines;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const fenced = source.split(/^```[^\n]*\n?/mu);
  fenced.forEach((part, index) => {
    if (index % 2 === 1) {
      blocks.push({ kind: 'code', text: part.replace(/\n$/u, '') });
      return;
    }
    for (const chunk of part.split(/\n\s*\n/u)) {
      const lines = chunk.split('\n').filter((line) => line.trim() !== '');
      if (lines.length === 0) continue;
      if (lines.every((line) => BULLET.test(line))) {
        blocks.push({ kind: 'list', ordered: false, items: lines.map((line) => parseInline(BULLET.exec(line)![1]!)) });
      } else if (lines.every((line) => ORDERED.test(line))) {
        blocks.push({ kind: 'list', ordered: true, items: lines.map((line) => parseInline(ORDERED.exec(line)![1]!)) });
      } else {
        const inlines: Inline[] = [];
        lines.forEach((line, lineIndex) => {
          if (lineIndex > 0) inlines.push({ kind: 'break' });
          inlines.push(...parseInline(line.replace(/^#+\s+/u, '')));
        });
        blocks.push({ kind: 'paragraph', inlines });
      }
    }
  });
  return blocks;
}

/** Plain-text excerpt (markdown markers removed). */
export function plainExcerpt(source: string, max = 220): string {
  const firstParagraph = source.split(/\n\s*\n/u).find((block) => !/^\s*[-*+]\s/u.test(block)) ?? source;
  const text = firstParagraph
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/[*`#>]/gu, '')
    .replace(/^\s*[-+]\s+/gmu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
