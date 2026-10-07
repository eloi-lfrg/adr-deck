import type { Adr } from '@adr/format';

export type TimelineOrder = 'oldest' | 'newest';

/** ADRs of one month; `month` is null for the ADRs without a date, always last. */
export interface TimelineGroup {
  key: string;
  year: number | null;
  /** 1 to 12. */
  month: number | null;
  adrs: Adr[];
}

/** Date an ADR sits at on the timeline: its decision, or else the front matter `date`. */
export function timelineDate(adr: Adr): string | null {
  return adr.decision?.date ?? adr.date;
}

const number = (adr: Adr): number => Number(adr.id.slice(4));

/** Groups ADRs by month, in date order (then number order); undated ADRs come last, in number order. */
export function buildTimeline(adrs: Adr[], order: TimelineOrder): TimelineGroup[] {
  const direction = order === 'oldest' ? 1 : -1;
  const dated = adrs
    .filter((adr) => timelineDate(adr) !== null)
    .sort((a, b) => direction * (timelineDate(a)!.localeCompare(timelineDate(b)!) || number(a) - number(b)));
  const groups: TimelineGroup[] = [];
  for (const adr of dated) {
    const key = timelineDate(adr)!.slice(0, 7);
    const last = groups.at(-1);
    if (last?.key === key) last.adrs.push(adr);
    else groups.push({ key, year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), adrs: [adr] });
  }
  const undated = adrs.filter((adr) => timelineDate(adr) === null).sort((a, b) => number(a) - number(b));
  if (undated.length > 0) groups.push({ key: 'undated', year: null, month: null, adrs: undated });
  return groups;
}

/** First and last year of the timeline, or null without any dated ADR. */
export function timelineSpan(groups: TimelineGroup[]): [number, number] | null {
  const years = groups.map((group) => group.year).filter((year): year is number => year !== null);
  return years.length === 0 ? null : [Math.min(...years), Math.max(...years)];
}
