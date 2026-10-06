import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { Document, Packer, Paragraph } from 'docx';
import { isMadrFileName, parseMadrStrict, type Adr } from '@adr/format';
import { DocxImportError, exportDocx, importDocx } from '../src/index.ts';

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

describe('importDocx', () => {
  /** What an export and import must keep. */
  const essentials = (adr: Adr): unknown => ({
    id: adr.id,
    file: adr.file,
    title: adr.title,
    status: adr.status,
    date: adr.date,
    deciders: adr.deciders,
    consulted: adr.consulted,
    informed: adr.informed,
    tags: adr.tags,
    otherMetadata: adr.otherMetadata,
    context: adr.context,
    drivers: adr.drivers,
    propositions: adr.propositions,
    recommended: adr.recommended,
    rationale: adr.rationale,
    decision: adr.decision,
    outcomeDetails: adr.outcomeDetails,
    moreInfo: adr.moreInfo,
    otherSections: adr.otherSections,
    language: adr.language,
  });
  const languageOf = (id: string): 'en' | 'fr' => adrs.find((adr) => adr.id === id)?.language ?? 'en';

  it.each(['en', 'fr', 'es'] as const)('reads back every example exported with %s labels', async (language) => {
    const buffer = await exportDocx({ title: 'Projet', source: '/d', adrs, now: new Date('2026-10-06T10:00:00Z'), language });
    const result = await importDocx(buffer, { language: languageOf });
    expect(result.issues).toEqual([]);
    expect(result.title).toBe('Projet');
    expect(result.files.map((file) => file.name)).toEqual(adrs.map((adr) => adr.file));
    for (const file of result.files) {
      const original = adrs.find((adr) => adr.file === file.name)!;
      expect(essentials(parseMadrStrict(file.content, file.name)), file.name).toEqual(essentials(original));
    }
  });

  // The info string of a code fence (```ts) has no place in Word and is not kept.
  it('keeps markdown, code, outcome subsections, other sections and metadata', async () => {
    const source = `---
status: accepted
date: 2026-10-01
decision-makers: Ann
consulted: Bob
informed: Team
jira: PLAT-12
---

# Rich ADR

## Context and Problem Statement

We need **speed** and *safety*, see [the RFC](https://example.com/rfc) and \`config.yml\`.

* first point
* second point

\`\`\`
const a = 1;
\`\`\`

## Considered Options

* Option A
* Option B

## Decision Outcome

Chosen option: "Option A", because it is simple.

### Consequences

* Good, because fast
* Bad, because new

### Confirmation

Code review.

## Pros and Cons of the Options

### Option A

Plain description.

* Good, because fast
* Neutral, because familiar
* Bad, because new

## Validation

Checked in March.

## More Information

Follow-up in Q1.
`;
    const original = parseMadrStrict(source, '0042-rich-adr.md');
    const imported = await importDocx(await exportDocx({ title: 'P', source: '/d', adrs: [original], now: new Date() }));
    expect(imported.issues).toEqual([]);
    expect(essentials(parseMadrStrict(imported.files[0]!.content, imported.files[0]!.name))).toEqual(essentials(original));
  });

  it('rejects a document that is not an adr-deck export', async () => {
    const other = new Document({ sections: [{ children: [new Paragraph('Hello')] }] });
    await expect(importDocx(await Packer.toBuffer(other))).rejects.toThrow(DocxImportError);
  });

  it('reports unknown statuses and options, and names files without a valid name', async () => {
    const adr = { ...adrs[0]!, file: 'notes.md' };
    const buffer = await exportDocx({ title: 'P', source: '/d', adrs: [adr], now: new Date() });
    const result = await importDocx(buffer);
    expect(result.files[0]?.name).toBe('0001-choix-de-la-file-de-messages.md');
    expect(result.issues[0]?.message).toContain('is not NNNN-title.md');
  });
});
