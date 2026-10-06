<script setup lang="ts">
import { DecisionError, type Adr, type Status } from '@adr/format';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFullscreen, useIdle, useMouse } from '@vueuse/core';
import { toast } from 'vue-sonner';
import { ArrowLeft, Keyboard, Maximize, Minimize, PanelRight } from '@lucide/vue';
import CommandPalette from '@/components/CommandPalette.vue';
import SaveIndicator from '@/components/SaveIndicator.vue';
import ShortcutsDialog from '@/components/ShortcutsDialog.vue';
import AdrSlide from '@/components/slideshow/AdrSlide.vue';
import SummarySheet from '@/components/slideshow/SummarySheet.vue';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type ReviewMode } from '@/composables/useLaunch';
import { useI18n } from '@/i18n';
import { isTypingTarget, useShortcuts } from '@/composables/useShortcuts';
import { isDecided } from '@/lib/status';
import { usePreferencesStore } from '@/stores/preferences';
import { useReviewStore } from '@/stores/review';

const AUTO_ADVANCE_MS = 1200;
const CHROME_IDLE_MS = 2200;
const HINT_MS = 2600;

const route = useRoute();
const router = useRouter();
const review = useReviewStore();
const preferences = usePreferencesStore();
const { m } = useI18n();
const { isFullscreen, toggle: toggleFullscreen, exit: exitFullscreen } = useFullscreen();

const mode = computed<ReviewMode>(() => {
  const value = route.query['mode'];
  return value === 'decided' || value === 'all' || value === 'selection' ? value : 'pending';
});

/** The slide list is computed once per launch so that deciding does not reshuffle it. */
function computeIds(): string[] {
  const includeDeferred = route.query['reportees'] !== '0';
  const explicit = typeof route.query['ids'] === 'string' ? route.query['ids'].split(',').filter(Boolean) : [];
  const known = new Set(review.adrs.map((adr) => adr.id));
  switch (mode.value) {
    case 'pending':
      return review.adrs.filter((adr) => adr.status === 'à décider' || (includeDeferred && adr.status === 'reportée')).map((adr) => adr.id);
    case 'decided':
      return review.adrs.filter((adr) => isDecided(adr.status)).map((adr) => adr.id);
    case 'all':
      return review.adrs.map((adr) => adr.id);
    case 'selection':
      return explicit.filter((id) => known.has(id));
  }
  return [];
}

const ids = ref<string[]>(computeIds());
const index = ref(Math.max(0, ids.value.indexOf(String(route.query['at'] ?? ''))));
const direction = ref<'next' | 'prev'>('next');
const slides = computed<Adr[]>(() => ids.value.map((id) => review.adrById(id)).filter((adr): adr is Adr => adr !== undefined));
const current = computed<Adr | null>(() => slides.value[index.value] ?? null);

watch(
  () => [route.query['mode'], route.query['ids'], route.query['reportees']],
  () => {
    ids.value = computeIds();
    index.value = Math.max(0, ids.value.indexOf(String(route.query['at'] ?? '')));
  },
);
watch(slides, (list) => {
  if (index.value > list.length - 1) index.value = Math.max(0, list.length - 1);
});

const selections = reactive(new Map<string, string[]>());
const comments = reactive(new Map<string, string>());
const nextReviews = reactive(new Map<string, string>());
const editOverrides = reactive(new Set<string>());
const justDecided = ref<string | null>(null);
const summaryOpen = ref(false);
const paletteOpen = ref(false);
const helpOpen = ref(false);
const hint = ref<string | null>(null);
let hintTimer: ReturnType<typeof setTimeout> | null = null;

// Presentation mode: controls and cursor fade out when the mouse rests; keys never wake them up.
const { idle } = useIdle(CHROME_IDLE_MS, { events: ['mousemove', 'mousedown', 'touchstart', 'wheel'] });
const { y: mouseY } = useMouse({ type: 'client', initialValue: { x: 0, y: Number.POSITIVE_INFINITY } });
const chromeVisible = computed(
  () =>
    !idle.value ||
    mouseY.value < 72 ||
    summaryOpen.value ||
    paletteOpen.value ||
    helpOpen.value ||
    review.saveState === 'error' ||
    current.value === null,
);

function showHint(message: string): void {
  hint.value = message;
  if (hintTimer !== null) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hint.value = null;
    hintTimer = null;
  }, HINT_MS);
}
const slideRef = ref<InstanceType<typeof AdrSlide> | null>(null);
let advanceTimer: ReturnType<typeof setTimeout> | null = null;

const editing = computed(() => current.value !== null && (!isDecided(current.value.status) || editOverrides.has(current.value.id)));
/** A proposed ADR starts with the options its « Decision Outcome » already names. */
const selected = computed(() => (current.value ? (selections.get(current.value.id) ?? (editing.value ? current.value.recommended : [])) : []));
const progress = computed(() => (slides.value.length === 0 ? 0 : ((index.value + 1) / slides.value.length) * 100));

const comment = computed({
  get: () => (current.value ? (comments.get(current.value.id) ?? (editing.value ? (current.value.rationale ?? '') : '')) : ''),
  set: (value: string) => {
    if (current.value) comments.set(current.value.id, value);
  },
});
const nextReview = computed({
  get: () => (current.value ? (nextReviews.get(current.value.id) ?? '') : ''),
  set: (value: string) => {
    if (current.value) nextReviews.set(current.value.id, value);
  },
});

function cancelAdvance(): void {
  if (advanceTimer !== null) clearTimeout(advanceTimer);
  advanceTimer = null;
}

function finish(): void {
  cancelAdvance();
  void router.push({ name: 'recap' });
}

function go(target: number): void {
  cancelAdvance();
  if (target < 0 || slides.value.length === 0) return;
  if (target >= slides.value.length) {
    finish();
    return;
  }
  if (target === index.value) return;
  direction.value = target > index.value ? 'next' : 'prev';
  index.value = target;
  justDecided.value = null;
  hint.value = null;
}

const next = (): void => go(index.value + 1);
const prev = (): void => go(index.value - 1);

function toggle(id: string): void {
  const adr = current.value;
  if (!adr || !editing.value) return;
  const list = selected.value;
  selections.set(adr.id, list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  hint.value = null;
}

function decide(status: Status): void {
  const adr = current.value;
  if (!adr || !editing.value) return;
  const retained = status === 'validée' ? selected.value : [];
  if (status === 'validée' && retained.length === 0) {
    showHint(m.value.slideshow.selectHint);
    return;
  }
  try {
    review.decide(adr.id, {
      status,
      retained,
      comment: comment.value.trim() || null,
      nextReview: status === 'reportée' && nextReview.value !== '' ? nextReview.value : null,
      replacedBy: null,
    });
  } catch (error) {
    if (!(error instanceof DecisionError)) throw error;
    toast.error(m.value.decisionErrors[error.code](error.params));
    return;
  }
  editOverrides.delete(adr.id);
  justDecided.value = adr.id;
  (document.activeElement as HTMLElement | null)?.blur();
  cancelAdvance();
  if (preferences.autoAdvance) {
    const decidedIndex = index.value;
    advanceTimer = setTimeout(() => {
      advanceTimer = null;
      if (index.value === decidedIndex) next();
    }, AUTO_ADVANCE_MS);
  }
}

function modify(): void {
  const adr = current.value;
  if (!adr || editing.value) return;
  cancelAdvance();
  editOverrides.add(adr.id);
  selections.set(adr.id, [...(adr.decision?.retained ?? [])]);
  comments.set(adr.id, adr.decision?.comment ?? '');
  nextReviews.set(adr.id, adr.decision?.nextReview ?? '');
}

function undo(): void {
  cancelAdvance();
  const adrId = review.undo();
  if (adrId === null) {
    toast.info(m.value.slideshow.nothingToUndo);
    return;
  }
  const target = ids.value.indexOf(adrId);
  if (target !== -1) go(target);
  justDecided.value = null;
  const adr = review.adrById(adrId);
  if (adr) selections.set(adrId, [...(adr.decision?.retained ?? [])]);
  toast(m.value.slideshow.undone(adrId));
}

/** Opens another ADR: in the current list when it is there, otherwise in « Toutes ». */
function goToAdr(id: string): void {
  const target = ids.value.indexOf(id);
  if (target !== -1) {
    go(target);
    return;
  }
  cancelAdvance();
  void router.push({ query: { mode: 'all', at: id } });
}

/** Follows the replacement of a superseded ADR. */
function followReplacement(): boolean {
  const target = current.value?.decision?.replacedBy ?? null;
  if (target === null || review.adrById(target) === undefined) return false;
  goToAdr(target);
  return true;
}

async function leave(): Promise<void> {
  cancelAdvance();
  if (isFullscreen.value) await exitFullscreen();
  await router.push({ name: 'grid' });
}

useShortcuts((event) => {
  const key = event.key;
  const mod = event.ctrlKey || event.metaKey;
  if (mod && key.toLowerCase() === 'k') {
    paletteOpen.value = !paletteOpen.value;
    return true;
  }
  if (paletteOpen.value || helpOpen.value) return false;
  if (summaryOpen.value) {
    if (key.toLowerCase() === 's' && !mod) {
      summaryOpen.value = false;
      return true;
    }
    return false;
  }
  if (isTypingTarget(event.target)) {
    if (key === 'Escape') {
      (event.target as HTMLElement).blur();
      return true;
    }
    return false;
  }
  if (mod && key.toLowerCase() === 'z' && !event.shiftKey) {
    undo();
    return true;
  }
  if (mod || event.altKey) return false;

  if (key === 'ArrowRight') next();
  else if (key === 'ArrowLeft') prev();
  else if (/^[1-9]$/u.test(key)) {
    const proposition = current.value?.propositions[Number(key) - 1];
    if (!proposition) return false;
    toggle(proposition.id);
  } else {
    switch (key.toLowerCase()) {
      case 'v':
        decide('validée');
        break;
      case 'x':
        decide('refusée');
        break;
      case 'p':
        decide('reportée');
        break;
      case 'm':
        modify();
        break;
      case 'l':
        if (!followReplacement()) return false;
        break;
      case 'c':
        if (!editing.value) return false;
        slideRef.value?.focusComment();
        break;
      case 's':
        summaryOpen.value = true;
        break;
      case '?':
        helpOpen.value = true;
        break;
      case 'g':
        void leave();
        break;
      case 'f':
        void toggleFullscreen();
        break;
      case 'escape':
        void leave();
        break;
      default:
        return false;
    }
  }
  return true;
});

onBeforeUnmount(() => {
  cancelAdvance();
  if (hintTimer !== null) clearTimeout(hintTimer);
});
</script>

<template>
  <div class="relative flex h-dvh flex-col overflow-hidden bg-background" :class="!chromeVisible && 'cursor-none'">
    <div class="absolute inset-x-0 top-0 z-40 h-0.5 bg-border/60" aria-hidden="true">
      <div class="h-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none" :style="{ width: `${progress}%` }" />
    </div>

    <header
      class="absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-4 px-4 transition-opacity duration-300 sm:px-6"
      :class="chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
    >
      <Button variant="ghost" size="sm" class="text-muted-foreground" :aria-label="m.slideshow.backLabel" @click="leave"><ArrowLeft /> {{ m.slideshow.back }}</Button>
      <span class="font-mono text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {{ slides.length === 0 ? 0 : index + 1 }} / {{ slides.length }}
      </span>
      <div class="flex-1" />
      <SaveIndicator v-if="review.saveState === 'error' || review.saveState === 'saving'" />
      <label class="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
        {{ m.slideshow.autoAdvance }}
        <Switch v-model="preferences.autoAdvance" :aria-label="m.slideshow.autoAdvanceLabel" />
      </label>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" class="text-muted-foreground" :aria-label="m.slideshow.shortcutsLabel" @click="helpOpen = true"><Keyboard /></Button>
        </TooltipTrigger>
        <TooltipContent>{{ m.slideshow.shortcuts }}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" class="text-muted-foreground" :aria-label="m.slideshow.summaryLabel" @click="summaryOpen = true"><PanelRight /></Button>
        </TooltipTrigger>
        <TooltipContent>{{ m.slideshow.summary }}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground"
            :aria-label="isFullscreen ? m.slideshow.exitFullscreen : m.slideshow.enterFullscreen"
            @click="toggleFullscreen"
          >
            <Minimize v-if="isFullscreen" />
            <Maximize v-else />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ m.slideshow.fullscreen }}</TooltipContent>
      </Tooltip>
    </header>

    <main class="grid min-h-0 flex-1 place-items-center px-4 py-10 sm:px-10">
      <div
        v-if="current"
        class="@container relative aspect-video w-full max-w-[calc((100dvh-5rem)*16/9)]"
        style="view-transition-name: adr-stage"
      >
        <Transition :name="direction === 'next' ? 'slide-next' : 'slide-prev'">
          <AdrSlide
            :key="current.id"
            ref="slideRef"
            v-model:comment="comment"
            v-model:next-review="nextReview"
            :adr="current"
            :editing="editing"
            :selected="selected"
            :animate-stamp="justDecided === current.id"
            :hint="hint"
            @toggle="toggle"
            @decide="decide"
            @modify="modify"
            @go="goToAdr"
          />
        </Transition>
      </div>
      <div v-else class="max-w-md text-center">
        <h1 class="font-display text-3xl">{{ m.slideshow.nothingTitle }}</h1>
        <p class="mt-2 text-muted-foreground">{{ m.slideshow.nothingText(m.modes[mode]) }}</p>
        <Button variant="outline" class="mt-6" @click="leave"><ArrowLeft /> {{ m.slideshow.backToGrid }}</Button>
      </div>
    </main>

    <SummarySheet v-model:open="summaryOpen" :adrs="slides" :current-index="index" @go="go" />
    <ShortcutsDialog v-model:open="helpOpen" />
    <CommandPalette
      v-model:open="paletteOpen"
      @select-adr="goToAdr"
      @launch="router.push({ query: { mode: 'pending' } })"
    />
  </div>
</template>
