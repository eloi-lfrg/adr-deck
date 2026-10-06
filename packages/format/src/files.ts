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
