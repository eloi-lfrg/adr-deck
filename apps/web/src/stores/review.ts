import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { toast } from 'vue-sonner';
import {
  applyOperation,
  DecisionError,
  parseCollection,
  snapshotOf,
  STATUSES,
  type Adr,
  type Collection,
  type DecisionInput,
  type DecisionSnapshot,
  type DocumentOperation,
  type FileIssues,
  type Status,
} from '@adr/format';
import { t } from '@/i18n';
import { api, ApiError, type FileContent } from '@/lib/api';

export const SAVE_DEBOUNCE_MS = 400;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface SessionDecision {
  adrId: string;
  title: string;
  status: Status;
  retained: string[];
  comment: string | null;
  at: string;
}

interface UndoEntry {
  adrId: string;
  snapshot: DecisionSnapshot;
}

/** A MADR file as confirmed by the server, plus the local operations not yet written. */
interface FileState {
  name: string;
  base: string;
  revision: string;
  /** Operations applied locally, oldest first, not yet confirmed by the server. */
  operations: DocumentOperation[];
  /** `base` with `operations` applied: what the UI shows. */
  content: string;
}

/** Replays operations on top of a content; operations that no longer apply are dropped. */
function replay(name: string, base: string, operations: DocumentOperation[]): { content: string; kept: DocumentOperation[]; dropped: number } {
  let content = base;
  const kept: DocumentOperation[] = [];
  for (const operation of operations) {
    try {
      content = applyOperation(content, name, operation);
      kept.push(operation);
    } catch (error) {
      if (!(error instanceof DecisionError)) throw error;
    }
  }
  return { content, kept, dropped: operations.length - kept.length };
}

export const useReviewStore = defineStore('review', () => {
  const title = ref('');
  const dir = ref('');
  const files = shallowRef<Map<string, FileState>>(new Map());
  const loaded = ref(false);
  const loading = ref(false);
  const loadError = ref<string | null>(null);

  const saveState = ref<SaveState>('idle');
  const saveError = ref<string | null>(null);
  let saving = false;
  let flushAgain = false;
  /** External changes notified during a write, checked once it is done. */
  const externalChecks = new Set<string>();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const sessionDecisions = ref<SessionDecision[]>([]);
  const undoStack = ref<UndoEntry[]>([]);
  let events: EventSource | null = null;

  const collection = computed<Collection>(() => parseCollection([...files.value.values()].map((file) => ({ name: file.name, content: file.content }))));
  const adrs = computed<Adr[]>(() => collection.value.adrs);
  const issues = computed<FileIssues[]>(() => collection.value.issues);
  /** ADR ID → IDs of the ADRs it supersedes. */
  const replaces = computed<Record<string, string[]>>(() => collection.value.replaces);
  const counts = computed<Record<Status, number>>(() => {
    const result = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<Status, number>;
    for (const adr of adrs.value) result[adr.status]++;
    return result;
  });
  const allTags = computed<string[]>(() => [...new Set(adrs.value.flatMap((adr) => adr.tags))].sort((a, b) => a.localeCompare(b, 'fr')));
  const hasPendingChanges = computed(() => saveState.value === 'saving' || saveState.value === 'error');

  function adrById(id: string): Adr | undefined {
    return adrs.value.find((adr) => adr.id === id);
  }

  function commit(next: Map<string, FileState>): void {
    files.value = next;
  }

  function updateFile(name: string, update: (file: FileState) => FileState | null): void {
    const current = files.value.get(name);
    if (!current) return;
    const next = new Map(files.value);
    const updated = update(current);
    if (updated === null) next.delete(name);
    else next.set(name, updated);
    commit(next);
  }

  /** Takes a server version of a file, keeping (and replaying) the local operations not yet written. */
  function receive(file: FileContent): number {
    const existing = files.value.get(file.name);
    const operations = existing?.operations ?? [];
    const { content, kept, dropped } = replay(file.name, file.content, operations);
    const next = new Map(files.value);
    next.set(file.name, { name: file.name, base: file.content, revision: file.revision, operations: kept, content });
    commit(next);
    return dropped;
  }

  function connectEvents(): void {
    if (events !== null || typeof EventSource === 'undefined') return;
    events = new EventSource('/api/events');
    events.addEventListener('changed', (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as { name: string; revision: string };
      if (files.value.get(payload.name)?.revision !== payload.revision) void reloadFile(payload.name);
    });
    events.addEventListener('files', () => {
      void reloadAll();
    });
  }

  async function load(): Promise<void> {
    connectEvents();
    if (loaded.value) return;
    loading.value = true;
    loadError.value = null;
    try {
      const response = await api.listAdrs();
      title.value = response.title;
      dir.value = response.dir;
      commit(new Map(response.files.map((file) => [file.name, { name: file.name, base: file.content, revision: file.revision, operations: [], content: file.content }])));
      loaded.value = true;
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : String(error);
    } finally {
      loading.value = false;
    }
  }

  /** Hot reload of one file after an external modification, keeping pending decisions. */
  async function reloadFile(name: string): Promise<void> {
    if (saving) {
      externalChecks.add(name);
      return;
    }
    let file: FileContent;
    try {
      file = await api.readFile(name);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        updateFile(name, () => null);
        return;
      }
      toast.error(t().toasts.reloadFailed, { description: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (file.revision === files.value.get(name)?.revision) return;
    const dropped = receive(file);
    toast.info(t().toasts.fileReloaded(name), {
      description: dropped > 0 ? t().toasts.changedDropped(dropped) : t().toasts.changedOutside,
    });
    if (files.value.get(name)!.operations.length > 0) scheduleSave();
  }

  /** Files added or removed on disk. */
  async function reloadAll(): Promise<void> {
    let response;
    try {
      response = await api.listAdrs();
    } catch (error) {
      toast.error(t().toasts.reloadFailed, { description: error instanceof Error ? error.message : String(error) });
      return;
    }
    const names = new Set(response.files.map((file) => file.name));
    const next = new Map([...files.value].filter(([name, file]) => names.has(name) || file.operations.length > 0));
    commit(next);
    for (const file of response.files) {
      if (files.value.get(file.name)?.revision !== file.revision) receive(file);
    }
  }

  function scheduleSave(): void {
    saveState.value = 'saving';
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
  }

  async function writeOne(name: string): Promise<void> {
    const file = files.value.get(name);
    if (!file || file.operations.length === 0) return;
    const sent = file.operations.length;
    const content = file.content;
    try {
      const result = await api.writeFile(name, content, file.revision);
      updateFile(name, (current) => {
        const operations = current.operations.slice(sent);
        return { ...current, base: content, revision: result.revision, operations, content: replay(name, content, operations).content };
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && typeof error.body['content'] === 'string') {
        // Modified elsewhere: take the file from disk and replay our pending decisions on top of it.
        const dropped = receive({ name, content: error.body['content'], revision: String(error.body['revision']) });
        flushAgain = true;
        toast.warning(t().toasts.conflict(name), {
          description: dropped > 0 ? t().toasts.conflictDropped(dropped) : t().toasts.conflictReplayed,
        });
        return;
      }
      throw error;
    }
  }

  async function flush(): Promise<void> {
    if (saving) {
      flushAgain = true;
      return;
    }
    const dirty = [...files.value.values()].filter((file) => file.operations.length > 0).map((file) => file.name);
    if (dirty.length === 0) {
      if (saveState.value === 'saving') saveState.value = 'saved';
      await runExternalChecks();
      return;
    }
    saving = true;
    saveState.value = 'saving';
    try {
      for (const name of dirty) await writeOne(name);
      saveError.value = null;
      saveState.value = [...files.value.values()].some((file) => file.operations.length > 0) ? 'saving' : 'saved';
    } catch (error) {
      saveState.value = 'error';
      saveError.value = error instanceof Error ? error.message : String(error);
      toast.error(t().toasts.saveFailed, { description: saveError.value });
      return;
    } finally {
      saving = false;
    }
    if (flushAgain || saveState.value === 'saving') {
      flushAgain = false;
      await flush();
      return;
    }
    await runExternalChecks();
  }

  async function runExternalChecks(): Promise<void> {
    const names = [...externalChecks];
    externalChecks.clear();
    for (const name of names) await reloadFile(name);
  }

  /** Saves immediately (before leaving the page or exporting). */
  async function flushNow(): Promise<void> {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await flush();
  }

  function retrySave(): void {
    void flushNow();
  }

  function apply(adrId: string, operation: DocumentOperation): void {
    const adr = adrById(adrId);
    if (!adr) throw new DecisionError('unknownAdr', { adr: adrId }, `ADR not found: ${adrId}.`);
    updateFile(adr.file, (file) => ({ ...file, content: applyOperation(file.content, file.name, operation), operations: [...file.operations, operation] }));
    scheduleSave();
  }

  function record(adrId: string, at: string): void {
    const adr = adrById(adrId)!;
    sessionDecisions.value = [
      ...sessionDecisions.value.filter((entry) => entry.adrId !== adrId),
      { adrId, title: adr.title, status: adr.status, retained: adr.decision?.retained ?? [], comment: adr.decision?.comment ?? null, at },
    ];
  }

  /** Records a decision (optimistic) and queues the write. Throws DecisionError on invalid input. */
  function decide(adrId: string, input: DecisionInput): void {
    const adr = adrById(adrId);
    if (!adr) throw new DecisionError('unknownAdr', { adr: adrId }, `ADR not found: ${adrId}.`);
    const snapshot = snapshotOf(files.value.get(adr.file)!.content);
    const at = new Date().toISOString();
    apply(adrId, { kind: 'decide', adrId, input, at });
    undoStack.value.push({ adrId, snapshot });
    record(adrId, at);
  }

  /** Undoes the last decision of the session; returns the ADR concerned. */
  function undo(): string | null {
    const entry = undoStack.value.pop();
    if (!entry) return null;
    apply(entry.adrId, { kind: 'undo', adrId: entry.adrId, restore: entry.snapshot, at: new Date().toISOString() });
    sessionDecisions.value = sessionDecisions.value.filter((item) => item.adrId !== entry.adrId);
    if (undoStack.value.some((item) => item.adrId === entry.adrId)) record(entry.adrId, new Date().toISOString());
    return entry.adrId;
  }

  /** Raw content currently shown for a file (for tests and debugging views). */
  function contentOf(name: string): string | undefined {
    return files.value.get(name)?.content;
  }

  return {
    title,
    dir,
    loaded,
    loading,
    loadError,
    saveState,
    saveError,
    sessionDecisions,
    undoStack,
    adrs,
    issues,
    replaces,
    counts,
    allTags,
    hasPendingChanges,
    adrById,
    contentOf,
    load,
    decide,
    undo,
    retrySave,
    flushNow,
    reloadFile,
    reloadAll,
    connectEvents,
  };
});
