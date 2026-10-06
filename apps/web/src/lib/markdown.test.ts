import { describe, expect, it } from 'vitest';
import { parseMarkdown, plainExcerpt } from './markdown';

describe('parseMarkdown', () => {
  it('splits paragraphs and lists and parses inline markers', () => {
    const blocks = parseMarkdown('Un **gras** et un [lien](https://x.dev).\nSuite.\n\n- a\n- b');
    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        inlines: [
          { kind: 'text', text: 'Un ' },
          { kind: 'strong', text: 'gras' },
          { kind: 'text', text: ' et un ' },
          { kind: 'link', text: 'lien', href: 'https://x.dev' },
          { kind: 'text', text: '.' },
          { kind: 'break' },
          { kind: 'text', text: 'Suite.' },
        ],
      },
      { kind: 'list', ordered: false, items: [[{ kind: 'text', text: 'a' }], [{ kind: 'text', text: 'b' }]] },
    ]);
  });

  it('refuses unsafe link targets', () => {
    const [block] = parseMarkdown('[x](javascript:alert(1))');
    expect(block?.kind === 'paragraph' && block.inlines.every((inline) => inline.kind === 'text')).toBe(true);
  });

  it('builds plain excerpts', () => {
    expect(plainExcerpt('**Gras** et `code` en tête\n\n- puce', 10)).toBe('Gras et c…');
  });
});
