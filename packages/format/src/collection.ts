import { compareAdrIds } from './files.ts';
import { makeIssue } from './issues.ts';
import { parseMadr } from './parse.ts';
import type { Adr, ParseIssue } from './schema.ts';

export interface FileIssues {
  file: string;
  issues: ParseIssue[];
}

export interface Collection {
  /** Readable ADRs, ordered by number. */
  adrs: Adr[];
  /** Files with issues; files with errors are left out of `adrs`. */
  issues: FileIssues[];
  /** Reverse of `decision.replacedBy`: ADR ID → IDs of the ADRs it supersedes, in number order. */
  replaces: Record<string, string[]>;
}

/** Parses the MADR files of a directory; two files with the same number are both reported and the second is left out. */
export function parseCollection(files: { name: string; content: string }[]): Collection {
  const adrs: Adr[] = [];
  const issues: FileIssues[] = [];
  const byId = new Map<string, string>();
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))) {
    const result = parseMadr(file.content, file.name);
    const fileIssues = [...result.issues];
    let adr = result.adr;
    if (adr !== null) {
      const existing = byId.get(adr.id);
      if (existing !== undefined) {
        fileIssues.push(makeIssue(1, 'error', 'duplicateNumber', { id: adr.id, file: existing }));
        adr = null;
      } else {
        byId.set(adr.id, file.name);
      }
    }
    if (adr !== null) adrs.push(adr);
    if (fileIssues.length > 0) issues.push({ file: file.name, issues: fileIssues });
  }
  adrs.sort((a, b) => compareAdrIds(a.id, b.id));

  const replaces: Record<string, string[]> = {};
  for (const adr of adrs) {
    const target = adr.decision?.replacedBy ?? null;
    if (target === null) continue;
    if (byId.has(target)) {
      (replaces[target] ??= []).push(adr.id);
    } else {
      const issue = makeIssue(1, 'warning', 'missingReplacement', { id: target });
      const entry = issues.find((item) => item.file === adr.file);
      if (entry) entry.issues.push(issue);
      else issues.push({ file: adr.file, issues: [issue] });
    }
  }
  issues.sort((a, b) => a.file.localeCompare(b.file, 'fr', { numeric: true }));
  return { adrs, issues, replaces };
}
