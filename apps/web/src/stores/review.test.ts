import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isMadrFileName, parseMadrStrict } from '@adr/format';
import { api, ApiError, type FileContent } from '@/lib/api';
import { SAVE_DEBOUNCE_MS, useReviewStore } from './review';

vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() }) }));

const examplesDir = resolve(__dirname, '../../../../examples/decisions');
const files: FileContent[] = readdirSync(examplesDir)
  .filter(isMadrFileName)
  .map((name) => ({ name, content: readFileSync(resolve(examplesDir, name), 'utf8'), revision: `r-${name}` }));
const CACHE = '0002-cache-http.md';
const cache = files.find((file) => file.name === CACHE)!;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  vi.spyOn(api, 'listAdrs').mockResolvedValue({ title: 'Projet', dir: '/repo/docs/decisions', files });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('review store', () => {
  it('loads every ADR of the directory in number order', async () => {
    const store = useReviewStore();
    await store.load();
    expect(store.title).toBe('Projet');
    expect(store.adrs.map((adr) => adr.id)).toEqual(Array.from({ length: 15 }, (_, index) => `ADR-${String(index + 1).padStart(4, '0')}`));
    expect(store.counts['à décider']).toBe(4);
    expect(store.issues).toEqual([]);
  });

  it('debounces writes per file and sends the known revision', async () => {
    const write = vi.spyOn(api, 'writeFile').mockImplementation(async (name) => ({ revision: `${name}-2` }));
    const store = useReviewStore();
    await store.load();
    store.decide('ADR-0002', { status: 'refusée', retained: [], comment: 'non', nextReview: null, replacedBy: null });
    store.decide('ADR-0006', { status: 'validée', retained: ['P1'], comment: null, nextReview: null, replacedBy: null });
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);
    expect(write).toHaveBeenCalledTimes(2);
    const [name, content, revision] = write.mock.calls[0]!;
    expect(name).toBe(CACHE);
    expect(revision).toBe(`r-${CACHE}`);
    expect(content).toContain('status: rejected');
    expect(content).toContain('Rejected, because non.');
    expect(write.mock.calls[1]![1]).toContain('Option retenue : « UUID v7 ».');
    expect(store.saveState).toBe('saved');
  });

  it('reloads on conflict and replays pending decisions', async () => {
    const external = cache.content.replace('# Stratégie de cache des réponses HTTP', '# Cache HTTP (modifié ailleurs)');
    const write = vi
      .spyOn(api, 'writeFile')
      .mockRejectedValueOnce(new ApiError('conflit', 409, { content: external, revision: 'r9' }))
      .mockResolvedValueOnce({ revision: 'r10' });
    const store = useReviewStore();
    await store.load();
    store.decide('ADR-0002', { status: 'reportée', retained: [], comment: null, nextReview: '2026-11-01', replacedBy: null });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]![2]).toBe('r9');
    const saved = parseMadrStrict(write.mock.calls[1]![1], CACHE);
    expect(saved.title).toBe('Cache HTTP (modifié ailleurs)');
    expect(saved.decision).toMatchObject({ status: 'reportée', nextReview: '2026-11-01' });
    expect(store.adrById('ADR-0002')?.title).toBe('Cache HTTP (modifié ailleurs)');
    expect(store.saveState).toBe('saved');
  });

  it('undoes the last decision and restores the file exactly', async () => {
    const write = vi.spyOn(api, 'writeFile').mockResolvedValue({ revision: 'r2' });
    const store = useReviewStore();
    await store.load();
    store.decide('ADR-0002', { status: 'refusée', retained: [], comment: null, nextReview: null, replacedBy: null });
    expect(store.undo()).toBe('ADR-0002');
    expect(store.adrById('ADR-0002')?.status).toBe('à décider');
    expect(store.contentOf(CACHE)).toBe(cache.content);
    expect(store.sessionDecisions).toEqual([]);
    expect(store.undo()).toBeNull();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);
    expect(write.mock.calls[0]![1]).toBe(cache.content);
  });

  it('keeps pending decisions when a file changes on disk', async () => {
    vi.spyOn(api, 'writeFile').mockResolvedValue({ revision: 'r2' });
    const store = useReviewStore();
    await store.load();
    store.decide('ADR-0002', { status: 'refusée', retained: [], comment: null, nextReview: null, replacedBy: null });
    vi.spyOn(api, 'readFile').mockResolvedValue({ name: CACHE, content: cache.content.replace('Stratégie de cache', 'Cache'), revision: 'r-ext' });
    await store.reloadFile(CACHE);
    expect(store.adrById('ADR-0002')).toMatchObject({ title: 'Cache des réponses HTTP', status: 'refusée' });
  });
});
