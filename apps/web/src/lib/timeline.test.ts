import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMadrFileName, parseCollection, type Adr } from '@adr/format';
import { buildTimeline, timelineDate, timelineSpan } from './timeline';

const examplesDir = resolve(__dirname, '../../../../examples/decisions');
const examples: Adr[] = parseCollection(
  readdirSync(examplesDir)
    .filter(isMadrFileName)
    .map((name) => ({ name, content: readFileSync(resolve(examplesDir, name), 'utf8') })),
).adrs;

const withDate = (adr: Adr, date: string | null): Adr => ({ ...adr, date, decision: adr.decision && { ...adr.decision, date } });

describe('buildTimeline', () => {
  it('groups the examples by month, oldest first', () => {
    const groups = buildTimeline(examples, 'oldest');
    expect(groups.map((group) => group.key)).toEqual(['2025-02', '2025-05', '2025-09', '2026-03', '2026-04', '2026-06', '2026-09', '2026-10']);
    expect(groups.flatMap((group) => group.adrs).length).toBe(examples.length);
    const dates = groups.flatMap((group) => group.adrs.map((adr) => timelineDate(adr)!));
    expect(dates).toEqual([...dates].sort());
  });

  it('reverses the order and breaks ties by number', () => {
    const groups = buildTimeline(examples, 'newest');
    expect(groups[0]?.key).toBe('2026-10');
    // ADR-0014 and ADR-0015 share their date.
    const april = groups.find((group) => group.key === '2026-04')!;
    expect(april.adrs.map((adr) => adr.id)).toEqual(['ADR-0015', 'ADR-0014']);
    expect(buildTimeline(examples, 'oldest').find((group) => group.key === '2026-04')!.adrs.map((adr) => adr.id)).toEqual(['ADR-0014', 'ADR-0015']);
  });

  it('puts undated ADRs last, in number order', () => {
    const [first, second, third] = examples;
    const groups = buildTimeline([withDate(third!, null), withDate(second!, '2024-01-10'), withDate(first!, null)], 'newest');
    expect(groups.map((group) => group.key)).toEqual(['2024-01', 'undated']);
    expect(groups[1]).toMatchObject({ year: null, month: null });
    expect(groups[1]!.adrs.map((adr) => adr.id)).toEqual([first!.id, third!.id]);
  });

  it('gives the span of years', () => {
    expect(timelineSpan(buildTimeline(examples, 'oldest'))).toEqual([2025, 2026]);
    expect(timelineSpan([])).toBeNull();
  });
});
