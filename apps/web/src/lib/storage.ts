type StorageKind = 'local' | 'session';

function storageOf(kind: StorageKind): Storage {
  return kind === 'local' ? window.localStorage : window.sessionStorage;
}

/** Web storage helpers for per-viewer conveniences; storage may be unavailable (private mode). */
export function readStored<T>(key: string, fallback: T, kind: StorageKind = 'local'): T {
  try {
    const raw = storageOf(kind).getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown, kind: StorageKind = 'local'): void {
  try {
    storageOf(kind).setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full: preferences simply won't persist.
  }
}
