import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';
import { toast } from 'vue-sonner';
import {
  applyOperation,
  categoryOf,
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
  type Participants,
  type ReworkInput,
  type Status,
} from '@adr/format';
import { t } from '@/i18n';
import { api, ApiError, type FileContent } from '@/lib/api';
import { readStored, writeStored } from '@/lib/storage';

export const SAVE_DEBOUNCE_MS = 400;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** What a review did to an ADR: a status, or `rework` (sent back, still proposed, with actions). */
export type SessionOutcome = Status | 'rework';

export interface SessionDecision {
  adrId: string;
  title: string;
  outcome: SessionOutcome;
  retained: string[];
  comment: string | null;
  /** Actions of a rework. */
  actions: string[];
  at: string;
}

/** One undoable step: the files it changed (two for a supersede), each with its content before. */
interface UndoEntry {
  adrId: string;
  snapshots: { adrId: string; snapshot: DecisionSnapshot }[];
}

export type ParticipantRole = 'decider' | 'consulted';

/** Someone attending the review; written into `decision-makers` or `consulted` of each ADR decided. */
export interface Participant {
  name: string;
  role: ParticipantRole;
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

function isParticipant(value: unknown): value is Participant {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Participant).name === 'string' &&
    ((value as Participant).role === 'decider' || (value as Participant).role === 'consulted')
  );
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

  const readOnly = ref(false);
  const sessionDecisions = ref<SessionDecision[]>([]);
  const undoStack = ref<UndoEntry[]>([]);
  const participants = ref<Participant[]>([]);
  let events: EventSource | null = null;

  // Participants belong to a meeting: kept for the browser tab (reloads included), per decisions directory.
  const participantsKey = (): string => `adr-deck:participants:${dir.value}`;
  watch(participants, (value) => writeStored(participantsKey(), value, 'session'), { deep: true });

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
  /** Category folders of the decisions directory. */
  const categories = computed<string[]>(() =>
    [...new Set(adrs.value.map((adr) => categoryOf(adr.file)).filter((folder): folder is string => folder !== null))].sort((a, b) => a.localeCompare(b, 'fr')),
  );
  /** Everyone named in the ADRs (decision makers, consulted, informed), to pick participants quickly. */
  const knownPeople = computed<string[]>(() => {
    const names = new Map<string, string>();
    for (const adr of adrs.value) for (const name of [...adr.deciders, ...adr.consulted, ...adr.informed]) names.set(name.toLowerCase(), names.get(name.toLowerCase()) ?? name);
    return [...names.values()].sort((a, b) => a.localeCompare(b, 'fr'));
  });
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
      readOnly.value = response.readOnly === true;
      const stored = readStored<unknown>(participantsKey(), [], 'session');
      participants.value = Array.isArray(stored) ? stored.filter(isParticipant) : [];
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

  function fileOf(adrId: string): FileState {
    const adr = adrById(adrId);
    const file = adr === undefined ? undefined : files.value.get(adr.file);
    if (!adr || !file) throw new DecisionError('unknownAdr', { adr: adrId }, `ADR not found: ${adrId}.`);
    return file;
  }

  /**
   * Applies operations to their files at once (optimistic) and queues the writes. Every operation is checked before
   * any file changes, so a refused one leaves everything as it was. Returns the undo entry.
   */
  function applyAll(operations: DocumentOperation[]): UndoEntry {
    if (readOnly.value) throw new Error(t().api.codes['readOnly']);
    const changes = operations.map((operation) => {
      const file = fileOf(operation.adrId);
      return { operation, file, snapshot: snapshotOf(file.content), content: applyOperation(file.content, file.name, operation) };
    });
    for (const { operation, file, content } of changes) {
      updateFile(file.name, (current) => ({ ...current, content, operations: [...current.operations, operation] }));
    }
    scheduleSave();
    return { adrId: operations[0]!.adrId, snapshots: changes.map(({ operation, snapshot }) => ({ adrId: operation.adrId, snapshot })) };
  }

  function record(adrId: string, at: string, outcome?: SessionOutcome, actions: string[] = []): void {
    const adr = adrById(adrId)!;
    sessionDecisions.value = [
      ...sessionDecisions.value.filter((entry) => entry.adrId !== adrId),
      { adrId, title: adr.title, outcome: outcome ?? adr.status, retained: adr.decision?.retained ?? [], comment: adr.decision?.comment ?? null, actions, at },
    ];
  }

  /** The participants of the review, as written into the files (none: the people metadata is left alone). */
  function participantsInput(): Participants | undefined {
    if (participants.value.length === 0) return undefined;
    const names = (role: ParticipantRole): string[] => participants.value.filter((person) => person.role === role).map((person) => person.name);
    return { deciders: names('decider'), consulted: names('consulted') };
  }

  function withParticipants<T extends { participants?: Participants }>(input: T): T {
    const people = participantsInput();
    return people === undefined || input.participants !== undefined ? input : { ...input, participants: people };
  }

  /** Records a decision (optimistic) and queues the write. Throws DecisionError on invalid input. */
  function decide(adrId: string, input: DecisionInput): void {
    const at = new Date().toISOString();
    undoStack.value.push(applyAll([{ kind: 'decide', adrId, input: withParticipants(input), at }]));
    record(adrId, at);
  }

  /** Sends an ADR back for rework: it stays proposed, with follow-up actions in « More Information ». */
  function rework(adrId: string, actions: string[]): void {
    const at = new Date().toISOString();
    undoStack.value.push(applyAll([{ kind: 'rework', adrId, input: withParticipants<ReworkInput>({ actions }), at }]));
    record(adrId, at, 'rework', actions.map((action) => action.trim()).filter(Boolean));
  }

  /** Marks an ADR superseded by another one and notes it in both files (one undo step). */
  function supersede(adrId: string, replacedBy: string, comment: string | null): void {
    const replaced = adrById(adrId);
    if (!replaced) throw new DecisionError('unknownAdr', { adr: adrId }, `ADR not found: ${adrId}.`);
    const at = new Date().toISOString();
    undoStack.value.push(
      applyAll([
        { kind: 'decide', adrId, input: withParticipants<DecisionInput>({ status: 'remplacée', retained: [], comment, nextReview: null, replacedBy }), at },
        { kind: 'supersedes', adrId: replacedBy, replaced: adrId, title: replaced.title, at },
      ]),
    );
    record(adrId, at);
  }

  /** Marks an accepted ADR deprecated, keeping its decision. */
  function deprecate(adrId: string, comment: string | null): void {
    const at = new Date().toISOString();
    undoStack.value.push(applyAll([{ kind: 'decide', adrId, input: withParticipants<DecisionInput>({ status: 'obsolète', retained: [], comment, nextReview: null, replacedBy: null }), at }]));
    record(adrId, at);
  }

  /** Undoes the last step of the session (every file it changed); returns the ADR concerned. */
  function undo(): string | null {
    const entry = undoStack.value.pop();
    if (!entry) return null;
    const at = new Date().toISOString();
    applyAll(entry.snapshots.map(({ adrId, snapshot }): DocumentOperation => ({ kind: 'undo', adrId, restore: snapshot, at })));
    sessionDecisions.value = sessionDecisions.value.filter((item) => item.adrId !== entry.adrId);
    if (undoStack.value.some((item) => item.adrId === entry.adrId)) record(entry.adrId, at);
    return entry.adrId;
  }

  function addParticipant(name: string, role: ParticipantRole = 'decider'): void {
    const clean = name.replace(/\s+/gu, ' ').trim();
    if (clean === '' || participants.value.some((person) => person.name.toLowerCase() === clean.toLowerCase())) return;
    participants.value = [...participants.value, { name: clean, role }];
  }

  function setParticipantRole(name: string, role: ParticipantRole): void {
    participants.value = participants.value.map((person) => (person.name === name ? { ...person, role } : person));
  }

  function removeParticipant(name: string): void {
    participants.value = participants.value.filter((person) => person.name !== name);
  }

  /** Raw content currently shown for a file (for tests and debugging views). */
  function contentOf(name: string): string | undefined {
    return files.value.get(name)?.content;
  }

  return {
    title,
    dir,
    readOnly,
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
    categories,
    knownPeople,
    participants,
    hasPendingChanges,
    adrById,
    contentOf,
    load,
    decide,
    rework,
    supersede,
    deprecate,
    undo,
    addParticipant,
    setParticipantRole,
    removeParticipant,
    retrySave,
    flushNow,
    reloadFile,
    reloadAll,
    connectEvents,
  };
});
