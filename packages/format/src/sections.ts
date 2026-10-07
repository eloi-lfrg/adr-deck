import type { Adr } from './schema.ts';
import { isActionsHeading, outcomeSubsectionOf } from './vocabulary.ts';

const FENCE = /^\s{0,3}(```|~~~)/u;

export interface MarkdownBlock {
  heading: string;
  body: string;
}

/** Splits markdown on its `###` headings (outside code blocks): the text before the first one, then each block. */
export function splitSubsections(markdown: string): { lead: string; blocks: MarkdownBlock[] } {
  const lead: string[] = [];
  const blocks: { heading: string; lines: string[] }[] = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence;
    const heading = inFence ? null : /^###\s+(.+?)\s*#*\s*$/u.exec(line);
    if (heading) blocks.push({ heading: heading[1]!, lines: [] });
    else (blocks.at(-1)?.lines ?? lead).push(line);
  }
  return { lead: lead.join('\n').trim(), blocks: blocks.map((block) => ({ heading: block.heading, body: block.lines.join('\n').trim() })) };
}

export interface OutcomeParts {
  /** `### Consequences` of « Decision Outcome ». */
  consequences: string;
  /** `### Confirmation`: how the implementation of the decision is checked. */
  confirmation: string;
  /** Other subsections, as written. */
  others: MarkdownBlock[];
}

/** The `###` subsections of « Decision Outcome » (`adr.outcomeDetails`). */
export function outcomeParts(adr: Pick<Adr, 'outcomeDetails'>): OutcomeParts {
  const parts: OutcomeParts = { consequences: '', confirmation: '', others: [] };
  for (const block of splitSubsections(adr.outcomeDetails).blocks) {
    const kind = outcomeSubsectionOf(block.heading);
    if (kind !== null && parts[kind] === '') parts[kind] = block.body;
    else parts.others.push(block);
  }
  return parts;
}

export interface ReworkAction {
  text: string;
  done: boolean;
}

/** Items of the `### Actions` subsection of « More Information » (follow-up of an ADR sent back for rework). */
export function reworkActions(adr: Pick<Adr, 'moreInfo'>): ReworkAction[] {
  const block = splitSubsections(adr.moreInfo).blocks.find((candidate) => isActionsHeading(candidate.heading));
  if (!block) return [];
  const actions: ReworkAction[] = [];
  for (const line of block.body.split('\n')) {
    const item = /^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.+)$/u.exec(line);
    if (item) actions.push({ text: item[2]!.trim(), done: item[1] !== undefined && item[1] !== ' ' });
  }
  return actions;
}
