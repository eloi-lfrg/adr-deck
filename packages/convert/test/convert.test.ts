import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { isMadrFileName, parseMadrStrict } from '@adr/format';
import { exportDocx } from '../src/index.ts';

const dir = fileURLToPath(new URL('../../../examples/decisions/', import.meta.url));
const adrs = readdirSync(dir)
  .filter(isMadrFileName)
  .sort()
  .map((name) => parseMadrStrict(readFileSync(`${dir}${name}`, 'utf8'), name));

async function documentText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml.replace(/<\/w:p>/gu, '\n').replace(/<[^>]+>/gu, '').replace(/&apos;/gu, "'").replace(/&amp;/gu, '&');
}

describe('exportDocx', () => {
  it('builds a document with a cover page, a summary and one section per ADR', async () => {
    const buffer = await exportDocx({ title: 'Projet', source: '/repo/docs/decisions', adrs, now: new Date('2026-10-06T10:00:00Z'), language: 'fr' });
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    const text = await documentText(buffer);
    expect(text).toContain('Projet');
    expect(text).toContain('Généré le : 2026-10-06');
    for (const adr of adrs) expect(text).toContain(`${adr.id} · ${adr.title}`);
    expect(text).toContain('Pour : zéro infra en plus, transactions partagées');
    expect(text).toContain('P1 · PostgreSQL comme file (pg-boss)');
    expect(text).toContain('Prochaine revue');
  });

  it('writes the labels in the requested language, English by default', async () => {
    const now = new Date('2026-10-06T10:00:00Z');
    const english = await documentText(await exportDocx({ title: 'P', source: '/d', adrs, now }));
    expect(english).toContain('Generated on: 2026-10-06');
    expect(english).toContain('Pro: zéro infra en plus, transactions partagées');
    expect(english).toContain('accepted');
    const spanish = await documentText(await exportDocx({ title: 'P', source: '/d', adrs, now, language: 'es' }));
    expect(spanish).toContain('Generado el: 2026-10-06');
    expect(spanish).toContain('Próxima revisión');
  });
});
