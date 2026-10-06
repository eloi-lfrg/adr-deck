import type { Language, Status } from './schema.ts';

/** Lowercases, strips accents, punctuation and extra whitespace so that headings and titles can be matched loosely. */
export function normalizeKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export type SectionKind = 'context' | 'drivers' | 'options' | 'outcome' | 'prosCons' | 'moreInfo';

/** `##` headings recognised in a MADR file (English template and common French translations). */
/** `language` is null for headings shared by both languages. */
const SECTION_HEADINGS: Record<string, { kind: SectionKind; language: Language | null }> = {
  'context and problem statement': { kind: 'context', language: 'en' },
  'context and problem': { kind: 'context', language: 'en' },
  'problem statement': { kind: 'context', language: 'en' },
  context: { kind: 'context', language: 'en' },
  contexte: { kind: 'context', language: 'fr' },
  'contexte et problematique': { kind: 'context', language: 'fr' },
  'contexte et enonce du probleme': { kind: 'context', language: 'fr' },
  problematique: { kind: 'context', language: 'fr' },
  'decision drivers': { kind: 'drivers', language: 'en' },
  drivers: { kind: 'drivers', language: 'en' },
  'criteres de decision': { kind: 'drivers', language: 'fr' },
  'facteurs de decision': { kind: 'drivers', language: 'fr' },
  'considered options': { kind: 'options', language: 'en' },
  options: { kind: 'options', language: null },
  'options envisagees': { kind: 'options', language: 'fr' },
  'options considerees': { kind: 'options', language: 'fr' },
  'decision outcome': { kind: 'outcome', language: 'en' },
  decision: { kind: 'outcome', language: null },
  'resultat de la decision': { kind: 'outcome', language: 'fr' },
  'pros and cons of the options': { kind: 'prosCons', language: 'en' },
  'pros and cons': { kind: 'prosCons', language: 'en' },
  'avantages et inconvenients des options': { kind: 'prosCons', language: 'fr' },
  'avantages et inconvenients': { kind: 'prosCons', language: 'fr' },
  'more information': { kind: 'moreInfo', language: 'en' },
  'informations complementaires': { kind: 'moreInfo', language: 'fr' },
  'plus d informations': { kind: 'moreInfo', language: 'fr' },
};

export function sectionOf(heading: string): { kind: SectionKind; language: Language | null } | null {
  return SECTION_HEADINGS[normalizeKey(heading)] ?? null;
}

/** Heading written when a « Decision Outcome » section has to be created. */
export const OUTCOME_HEADING: Record<Language, string> = { en: 'Decision Outcome', fr: 'Décision' };

const STATUS_WORDS: Record<string, Status> = {
  proposed: 'à décider',
  draft: 'à décider',
  open: 'à décider',
  'in review': 'à décider',
  propose: 'à décider',
  proposee: 'à décider',
  'a decider': 'à décider',
  brouillon: 'à décider',
  'en discussion': 'à décider',
  accepted: 'validée',
  approved: 'validée',
  decided: 'validée',
  acceptee: 'validée',
  accepte: 'validée',
  validee: 'validée',
  valide: 'validée',
  rejected: 'refusée',
  declined: 'refusée',
  refusee: 'refusée',
  refuse: 'refusée',
  rejetee: 'refusée',
  deferred: 'reportée',
  postponed: 'reportée',
  'on hold': 'reportée',
  reportee: 'reportée',
  reporte: 'reportée',
  deprecated: 'obsolète',
  obsolete: 'obsolète',
  superseded: 'remplacée',
  remplacee: 'remplacée',
  remplace: 'remplacée',
};

/** Matches `superseded by ADR-0005`, `superseded by [ADR-0005](0005-x.md)` or `remplacée par 0005-x.md`. */
const SUPERSEDED = /^(?:superseded|remplacee?)\s+(?:by|par)\s+(.+)$/u;

export interface StatusReading {
  status: Status;
  replacedBy: string | null;
  /** False when the value was not recognised (read as `à décider`). */
  known: boolean;
}

/** Reads a MADR `status` value; a missing status means the ADR is still proposed. */
export function readStatus(raw: string | null): StatusReading {
  if (raw === null || raw.trim() === '') return { status: 'à décider', replacedBy: null, known: true };
  const plain = raw.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const superseded = SUPERSEDED.exec(plain);
  if (superseded) {
    const target = /adr-?(\d{3,})|(?:^|[\s(/[])(\d{3,})-/u.exec(superseded[1]!);
    const digits = target?.[1] ?? target?.[2] ?? null;
    return { status: 'remplacée', replacedBy: digits === null ? null : `ADR-${digits}`, known: true };
  }
  const status = STATUS_WORDS[normalizeKey(raw)];
  return status === undefined ? { status: 'à décider', replacedBy: null, known: false } : { status, replacedBy: null, known: true };
}

/** MADR `status` value written for a decision (always the standard English vocabulary). */
export function statusValue(status: Status, replacedBy: string | null): string {
  switch (status) {
    case 'à décider':
      return 'proposed';
    case 'validée':
      return 'accepted';
    case 'refusée':
      return 'rejected';
    case 'reportée':
      return 'deferred';
    case 'obsolète':
      return 'deprecated';
    case 'remplacée':
      return replacedBy === null ? 'superseded' : `superseded by ${replacedBy}`;
  }
}

/** `* Good, because …` / `* Bad, because …` bullets of an option (also `Bon, car …`, `Avantage : …`). */
export const PRO_BULLET = /^[-*+]\s+(?:good|pro|bon|pour|avantage)\s*[,:]\s*(?:because\s+|car\s+|parce que\s+)?(.+)$/iu;
export const CON_BULLET = /^[-*+]\s+(?:bad|con|mauvais|contre|inconvenient|inconvénient)\s*[,:]\s*(?:because\s+|car\s+|parce que\s+)?(.+)$/iu;
