import { z } from 'zod';
import type { IssueCode } from './issues.ts';

/** IDs come from the MADR file number: `0007-use-postgres.md` → `ADR-0007`. */
export const ADR_ID_PATTERN = /^ADR-\d{3,}$/;
export const PROPOSITION_ID_PATTERN = /^P\d+$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Statuses shown in the UI, in display order; each one maps to a MADR `status` value (see `vocabulary.ts`). */
export const STATUSES = ['à décider', 'validée', 'refusée', 'reportée', 'remplacée', 'obsolète'] as const;
export const StatusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof StatusSchema>;

/** Language of the MADR file, used to write the decision sentence in the same language. */
export const LanguageSchema = z.enum(['en', 'fr']);
export type Language = z.infer<typeof LanguageSchema>;

/** One of the « Considered Options », enriched with its « Pros and Cons » subsection. */
export const PropositionSchema = z.object({
  id: z.string().regex(PROPOSITION_ID_PATTERN),
  title: z.string().min(1),
  /** Free markdown text of the option subsection (without the Good/Bad bullets). */
  body: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});
export type Proposition = z.infer<typeof PropositionSchema>;

export const DecisionSchema = z.object({
  status: StatusSchema,
  retained: z.array(z.string().regex(PROPOSITION_ID_PATTERN)),
  date: z.string().regex(DATE_PATTERN).nullable(),
  nextReview: z.string().regex(DATE_PATTERN).nullable(),
  replacedBy: z.string().regex(ADR_ID_PATTERN).nullable(),
  comment: z.string().nullable(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const AdrSchema = z.object({
  id: z.string().regex(ADR_ID_PATTERN),
  /** MADR file name, relative to the decisions directory. */
  file: z.string().min(1),
  title: z.string().min(1),
  status: StatusSchema,
  /** `status` value as written in the file. */
  rawStatus: z.string().nullable(),
  tags: z.array(z.string()),
  /** Front matter `date`: when the decision was last updated. */
  date: z.string().nullable(),
  deciders: z.array(z.string()),
  context: z.string(),
  /** « Decision Drivers » section. */
  drivers: z.string(),
  propositions: z.array(PropositionSchema),
  /** Options already named in « Decision Outcome » while the ADR is still proposed. */
  recommended: z.array(z.string().regex(PROPOSITION_ID_PATTERN)),
  /** Justification already written in « Decision Outcome » while the ADR is still proposed. */
  rationale: z.string().nullable(),
  decision: DecisionSchema.nullable(),
  language: LanguageSchema,
});
export type Adr = z.infer<typeof AdrSchema>;

export type IssueSeverity = 'error' | 'warning';

export interface ParseIssue {
  /** 1-based line number in the source. */
  line: number;
  severity: IssueSeverity;
  code: IssueCode;
  params: Record<string, string>;
  /** English message (see `issueMessage` for other languages). */
  message: string;
}

export interface ParseResult {
  /** Null when the file cannot be read as an ADR (see the errors). */
  adr: Adr | null;
  issues: ParseIssue[];
}
