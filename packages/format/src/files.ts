/** MADR file naming: `NNNN-title-with-dashes.md`. */
export const MADR_FILE_PATTERN = /^(\d{3,})-[^/\\]+\.md$/iu;

export function isMadrFileName(name: string): boolean {
  return MADR_FILE_PATTERN.test(name) && !name.startsWith('.');
}

/** `0007-use-postgres.md` → `ADR-0007`; null when the name carries no number. */
export function adrIdFromFileName(name: string): string | null {
  const match = MADR_FILE_PATTERN.exec(name);
  return match ? `ADR-${match[1]!}` : null;
}

/** Numeric order of ADR IDs (`ADR-0002` before `ADR-0010`). */
export function compareAdrIds(a: string, b: string): number {
  return Number(a.slice(4)) - Number(b.slice(4)) || a.localeCompare(b);
}

/** File name part of a title: `Use PostgreSQL!` → `use-postgresql`. */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 60) || 'decision'
  );
}

/** `madrFileName('7', 'Use PostgreSQL')` → `0007-use-postgresql.md`; the digits are kept as written beyond four. */
export function madrFileName(digits: string, title: string): string {
  return `${digits.padStart(4, '0')}-${slugify(title)}.md`;
}

/** Number of the next ADR: one more than the highest numbered file (1 for an empty directory). */
export function nextAdrNumber(fileNames: string[]): number {
  let highest = 0;
  for (const name of fileNames) {
    const match = MADR_FILE_PATTERN.exec(name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}
