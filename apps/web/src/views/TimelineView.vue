<script setup lang="ts">
import { STATUSES, type Status } from '@adr/format';
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { motion, useScroll, useSpring } from 'motion-v';
import { useIdle } from '@vueuse/core';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronsDownUp, ChevronsUpDown, LayoutGrid } from '@lucide/vue';
import CommandPalette from '@/components/CommandPalette.vue';
import FileHeader from '@/components/FileHeader.vue';
import ShortcutsDialog from '@/components/ShortcutsDialog.vue';
import TimelineEntry from '@/components/timeline/TimelineEntry.vue';
import { Button } from '@/components/ui/button';
import { useLaunch } from '@/composables/useLaunch';
import { useMotionPreset } from '@/composables/useMotion';
import { isTypingTarget, useShortcuts } from '@/composables/useShortcuts';
import { useI18n } from '@/i18n';
import { STATUS_STYLES } from '@/lib/status';
import { buildTimeline, timelineDate, timelineSpan, type TimelineGroup, type TimelineOrder } from '@/lib/timeline';
import { cn } from '@/lib/utils';
import { useReviewStore } from '@/stores/review';

const review = useReviewStore();
const route = useRoute();
const router = useRouter();
const launch = useLaunch();
const { m } = useI18n();
const { reduced, duration } = useMotionPreset();
const { idle } = useIdle(2500);

const order = ref<TimelineOrder>('newest');
const statuses = ref<Status[]>([]);
const expanded = ref<string[]>([]);
const activeId = ref<string | null>(null);
const flashId = ref<string | null>(null);
const paletteOpen = ref(false);
const helpOpen = ref(false);
const list = ref<HTMLElement | null>(null);

const groups = computed<TimelineGroup[]>(() =>
  buildTimeline(
    review.adrs.filter((adr) => statuses.value.length === 0 || statuses.value.includes(adr.status)),
    order.value,
  ),
);
const entries = computed(() => groups.value.flatMap((group) => group.adrs));
const span = computed(() => timelineSpan(buildTimeline(review.adrs, 'oldest')));
const allExpanded = computed(() => entries.value.length > 0 && entries.value.every((adr) => expanded.value.includes(adr.id)));

/** The spine fills up as the reader scrolls through the timeline. */
const { scrollYProgress } = useScroll({ target: list, offset: ['start 65%', 'end 65%'] });
const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });

function monthLabel(group: TimelineGroup): string {
  if (group.year === null || group.month === null) return m.value.timeline.undated;
  return new Intl.DateTimeFormat(m.value.intlLocale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(group.year, group.month - 1, 1)));
}

function dayLabel(date: string | null): string {
  if (date === null) return '';
  return new Intl.DateTimeFormat(m.value.intlLocale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

/** Year shown above a group when it differs from the previous one. */
function startsYear(index: number): boolean {
  const group = groups.value[index];
  return group !== undefined && group.year !== null && group.year !== groups.value[index - 1]?.year;
}

function toggleStatus(status: Status): void {
  statuses.value = statuses.value.includes(status) ? statuses.value.filter((item) => item !== status) : [...statuses.value, status];
}

function toggle(id: string): void {
  activeId.value = id;
  expanded.value = expanded.value.includes(id) ? expanded.value.filter((item) => item !== id) : [...expanded.value, id];
}

function toggleAll(): void {
  expanded.value = allExpanded.value ? [] : entries.value.map((adr) => adr.id);
}

async function reveal(id: string, options: { expand?: boolean; flash?: boolean; instant?: boolean } = {}): Promise<void> {
  if (!entries.value.some((adr) => adr.id === id)) statuses.value = [];
  activeId.value = id;
  if (options.expand && !expanded.value.includes(id)) expanded.value = [...expanded.value, id];
  await nextTick();
  document.getElementById(`entry-${id}`)?.scrollIntoView({ block: options.expand ? 'start' : 'center', behavior: reduced.value || options.instant ? 'auto' : 'smooth' });
  if (options.flash) {
    flashId.value = id;
    setTimeout(() => {
      if (flashId.value === id) flashId.value = null;
    }, 1400);
  }
}

function move(step: number): void {
  const ids = entries.value.map((adr) => adr.id);
  if (ids.length === 0) return;
  const current = activeId.value === null ? -1 : ids.indexOf(activeId.value);
  const next = current === -1 ? (step > 0 ? 0 : ids.length - 1) : Math.min(Math.max(current + step, 0), ids.length - 1);
  void reveal(ids[next]!);
}

useShortcuts((event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    paletteOpen.value = !paletteOpen.value;
    return true;
  }
  if (paletteOpen.value || helpOpen.value || isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return false;
  switch (event.key) {
    case 'ArrowDown':
    case 'j':
    case 'J':
      move(1);
      return true;
    case 'ArrowUp':
    case 'k':
    case 'K':
      move(-1);
      return true;
    case 'Enter':
    case ' ':
      if (activeId.value === null) return false;
      // Let focused buttons and links handle their own activation.
      if (event.target instanceof HTMLElement && event.target.closest('button, a') !== null) return false;
      toggle(activeId.value);
      return true;
    case 'a':
    case 'A':
      toggleAll();
      return true;
    case 'g':
    case 'G':
    case 'Escape':
      void router.push({ name: 'grid' });
      return true;
    case '?':
      helpOpen.value = true;
      return true;
  }
  return false;
});

onMounted(() => {
  const at = route.query['at'];
  if (typeof at === 'string' && review.adrById(at)) void reveal(at, { expand: true, flash: true, instant: true });
});
</script>

<template>
  <div class="min-h-dvh">
    <FileHeader @search="paletteOpen = true" />

    <main class="mx-auto max-w-5xl px-4 pb-32 sm:px-10">
      <motion.section
        class="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-14 pb-10"
        :initial="{ opacity: 0, y: reduced ? 0 : 14 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: duration(0.6), ease: [0.16, 1, 0.3, 1] }"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-mono text-xs text-muted-foreground" :title="review.dir">{{ review.dir }}</p>
          <h1 class="mt-2 text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">{{ m.timeline.title }}</h1>
          <p class="mt-3 text-lg text-muted-foreground">
            {{ review.title }} · {{ m.timeline.summary(review.adrs.length) }}<template v-if="span"> · {{ span[0] === span[1] ? span[0] : `${span[0]} – ${span[1]}` }}</template>
          </p>
        </div>
        <Button variant="outline" @click="router.push({ name: 'grid' })"><LayoutGrid /> {{ m.slideshow.back }}</Button>
      </motion.section>

      <div class="relative z-20 -mx-4 mb-10 md:sticky md:top-14 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-10 sm:px-10">
        <div class="flex flex-wrap items-center gap-1 text-sm" role="group" :aria-label="m.timeline.statusFilter">
          <button
            v-for="status in STATUSES"
            :key="status"
            type="button"
            :aria-pressed="statuses.includes(status)"
            :disabled="review.counts[status] === 0"
            :class="
              cn(
                'flex items-center gap-2 rounded-full border px-3 py-1 transition-colors disabled:pointer-events-none disabled:opacity-35',
                statuses.includes(status) ? 'border-foreground/30 bg-secondary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            "
            @click="toggleStatus(status)"
          >
            <span class="size-2 rounded-full" :style="{ background: STATUS_STYLES[status].color }" aria-hidden="true" />
            {{ m.status[status].plural }}
            <span class="text-muted-foreground tabular-nums">{{ review.counts[status] }}</span>
          </button>
        </div>
        <div class="flex-1" />
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground"
            :aria-label="order === 'oldest' ? m.timeline.oldest : m.timeline.newest"
            :title="order === 'oldest' ? m.timeline.oldest : m.timeline.newest"
            @click="order = order === 'oldest' ? 'newest' : 'oldest'"
          >
            <ArrowDownWideNarrow v-if="order === 'oldest'" /><ArrowUpNarrowWide v-else />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground"
            :disabled="entries.length === 0"
            :aria-label="allExpanded ? m.timeline.collapseAll : m.timeline.expandAll"
            :title="`${allExpanded ? m.timeline.collapseAll : m.timeline.expandAll} (A)`"
            @click="toggleAll"
          >
            <ChevronsDownUp v-if="allExpanded" /><ChevronsUpDown v-else />
          </Button>
        </div>
      </div>

      <div v-if="entries.length > 0" ref="list" class="relative">
        <!-- Spine: a faint rail, and the part already read in the accent color. -->
        <div class="absolute top-2 bottom-2 left-3 w-px -translate-x-1/2 bg-border md:left-[8.5rem]" aria-hidden="true">
          <motion.div v-if="!reduced" class="absolute inset-0 origin-top bg-primary/70" :style="{ scaleY: progress }" />
        </div>

        <section v-for="(group, groupIndex) in groups" :key="`${order}-${group.key}`" :aria-label="`${monthLabel(group)} ${group.year ?? ''}`">
          <motion.div
            v-if="startsYear(groupIndex)"
            class="relative grid grid-cols-[1.5rem_1fr] items-center pt-4 pb-6 md:grid-cols-[7rem_3rem_1fr]"
            :initial="{ opacity: 0 }"
            :while-in-view="{ opacity: 1 }"
            :in-view-options="{ once: true }"
            :transition="{ duration: duration(0.5) }"
          >
            <span class="hidden text-right text-3xl font-semibold tracking-tight tabular-nums md:block">{{ group.year }}</span>
            <span class="relative z-10 mx-auto size-2.5 rotate-45 bg-foreground" aria-hidden="true" />
            <span class="text-3xl font-semibold tracking-tight tabular-nums md:hidden">{{ group.year }}</span>
          </motion.div>

          <div class="grid grid-cols-[1.5rem_1fr] items-center pb-4 md:grid-cols-[7rem_3rem_1fr]">
            <h2 class="hidden text-right text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase md:block">{{ monthLabel(group) }}</h2>
            <span class="relative z-10 mx-auto size-1.5 rounded-full bg-muted-foreground/60" aria-hidden="true" />
            <span class="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase md:hidden" aria-hidden="true">{{ monthLabel(group) }}</span>
          </div>

          <ol class="space-y-5 pb-8">
            <motion.li
              v-for="(adr, index) in group.adrs"
              :id="`entry-${adr.id}`"
              :key="adr.id"
              class="grid scroll-mt-40 grid-cols-[1.5rem_1fr] md:grid-cols-[7rem_3rem_1fr]"
              :initial="{ opacity: 0, y: reduced ? 0 : 28 }"
              :while-in-view="{ opacity: 1, y: 0 }"
              :in-view-options="{ once: true, margin: '0px 0px -8% 0px' }"
              :transition="{ duration: duration(0.55), delay: reduced ? 0 : Math.min(index, 3) * 0.05, ease: [0.16, 1, 0.3, 1] }"
            >
              <span class="hidden pt-7 pr-1 text-right text-sm text-muted-foreground tabular-nums md:block">{{ dayLabel(timelineDate(adr)) }}</span>
              <span class="relative flex justify-center pt-7">
                <motion.span
                  class="relative z-10 size-3.5 rounded-full border-2 bg-background transition-colors duration-300"
                  :style="{ borderColor: STATUS_STYLES[adr.status].color, background: activeId === adr.id || expanded.includes(adr.id) ? STATUS_STYLES[adr.status].color : undefined }"
                  :initial="{ scale: reduced ? 1 : 0 }"
                  :while-in-view="{ scale: 1 }"
                  :in-view-options="{ once: true }"
                  :transition="reduced ? { duration: 0.15 } : { type: 'spring', stiffness: 420, damping: 18, delay: 0.12 }"
                  aria-hidden="true"
                />
              </span>
              <TimelineEntry
                :adr="adr"
                :expanded="expanded.includes(adr.id)"
                :active="activeId === adr.id"
                :flash="flashId === adr.id"
                @toggle="toggle(adr.id)"
                @go="(id) => reveal(id, { flash: true })"
                @open="launch({ mode: 'all', at: adr.id })"
              />
            </motion.li>
          </ol>
        </section>
      </div>

      <div v-else class="rounded-2xl border border-dashed px-6 py-16 text-center text-muted-foreground">
        <template v-if="review.adrs.length === 0">
          <p>{{ m.grid.emptyTitle }}</p>
          <p class="mt-2 text-sm">{{ m.grid.emptyHelp('NNNN-title.md', 'docs/decisions', 'docs/adr') }}</p>
        </template>
        <template v-else>
          {{ m.timeline.noMatch }}
          <Button variant="link" @click="statuses = []">{{ m.timeline.showAll }}</Button>
        </template>
      </div>
    </main>

    <Transition
      enter-active-class="transition-opacity duration-300"
      leave-active-class="transition-opacity duration-500"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <p
        v-if="!idle && entries.length > 0"
        class="pointer-events-none fixed bottom-6 left-1/2 z-30 hidden -translate-x-1/2 rounded-full border bg-background/85 px-4 py-1.5 text-xs text-muted-foreground shadow-soft backdrop-blur-md sm:block"
      >
        {{ m.timeline.hint }}
      </p>
    </Transition>

    <ShortcutsDialog v-model:open="helpOpen" variant="timeline" />
    <CommandPalette v-model:open="paletteOpen" @select-adr="(id) => reveal(id, { expand: true, flash: true })" @launch="launch({ mode: 'pending', fullscreen: true })" />
  </div>
</template>
