<script setup lang="ts">
import { STATUSES, type Adr, type Status } from '@adr/format';
import { computed, onMounted, ref } from 'vue';
import { motion } from 'motion-v';
import { toast } from 'vue-sonner';
import { FileDown, Play, Search, X } from '@lucide/vue';
import AdrCard from '@/components/AdrCard.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import FileHeader from '@/components/FileHeader.vue';
import FileIssuesNotice from '@/components/FileIssuesNotice.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useMotionPreset } from '@/composables/useMotion';
import { isTypingTarget, useShortcuts } from '@/composables/useShortcuts';
import { REVIEW_MODES, useLaunch, type ReviewMode } from '@/composables/useLaunch';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { STATUS_STYLES } from '@/lib/status';
import { cn } from '@/lib/utils';
import { usePreferencesStore } from '@/stores/preferences';
import { useReviewStore } from '@/stores/review';

type SortKey = 'file' | 'date' | 'status';

const review = useReviewStore();
const preferences = usePreferencesStore();
const launch = useLaunch();
const { m, locale } = useI18n();
const { duration } = useMotionPreset();

const statusFilter = ref<Status | 'all'>('all');
const search = ref('');
const tags = ref<string[]>([]);
const sort = ref<SortKey>('file');
const selection = ref<string[]>([]);
const mode = ref<ReviewMode>('pending');
const paletteOpen = ref(false);
const transitioningId = ref<string | null>(null);
const searchInput = ref<InstanceType<typeof Input> | null>(null);


function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function haystack(adr: Adr): string {
  return normalize(
    [adr.id, adr.title, adr.tags.join(' '), adr.context, adr.decision?.comment ?? '', ...adr.propositions.flatMap((p) => [p.title, p.body, ...p.pros, ...p.cons])].join(' '),
  );
}

const visible = computed<Adr[]>(() => {
  const terms = normalize(search.value).split(/\s+/u).filter(Boolean);
  const list = review.adrs.filter(
    (adr) =>
      (statusFilter.value === 'all' || adr.status === statusFilter.value) &&
      tags.value.every((tag) => adr.tags.includes(tag)) &&
      terms.every((term) => haystack(adr).includes(term)),
  );
  if (sort.value === 'status') return [...list].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status));
  if (sort.value === 'date') {
    const key = (adr: Adr): string => adr.decision?.date ?? adr.date ?? '';
    return [...list].sort((a, b) => key(b).localeCompare(key(a)));
  }
  return list;
});

const pendingCount = computed(() => review.counts['à décider'] + (preferences.includeDeferred ? review.counts['reportée'] : 0));
const launchCount = computed(() => {
  switch (mode.value) {
    case 'pending':
      return pendingCount.value;
    case 'decided':
      return review.counts['validée'] + review.counts['refusée'] + review.counts['remplacée'] + review.counts['obsolète'];
    case 'all':
      return review.adrs.length;
    case 'selection':
      return selection.value.length;
  }
  return 0;
});

function toggleSelect(id: string): void {
  selection.value = selection.value.includes(id) ? selection.value.filter((item) => item !== id) : [...selection.value, id];
  if (selection.value.length > 0) mode.value = 'selection';
  else if (mode.value === 'selection') mode.value = 'pending';
}

function launchReview(): void {
  if (launchCount.value === 0) {
    toast.info(m.value.grid.nothingToShow);
    return;
  }
  const ordered = review.adrs.map((adr) => adr.id).filter((id) => selection.value.includes(id));
  void launch({ mode: mode.value, ids: mode.value === 'selection' ? ordered : [], includeDeferred: preferences.includeDeferred, fullscreen: true });
}

async function openAt(id: string): Promise<void> {
  const ids = visible.value.map((adr) => adr.id);
  // A replacement hidden by the filters opens in « Toutes ».
  if (!ids.includes(id)) {
    await launch({ mode: 'all', at: id });
    return;
  }
  transitioningId.value = id;
  await launch({ mode: 'selection', ids, at: id, viewTransition: true });
}

async function exportDocx(): Promise<void> {
  try {
    await review.flushNow();
    const fileName = await api.downloadDocx(locale.value);
    toast.success(m.value.export.ready, { description: fileName });
  } catch (error) {
    toast.error(m.value.export.failed, { description: error instanceof Error ? error.message : String(error) });
  }
}

function clearFilters(): void {
  statusFilter.value = 'all';
  search.value = '';
  tags.value = [];
}

useShortcuts((event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    paletteOpen.value = !paletteOpen.value;
    return true;
  }
  if (paletteOpen.value || isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key === 'r' || event.key === 'R') {
    launchReview();
    return true;
  }
  if (event.key === '/') {
    (searchInput.value?.$el as HTMLInputElement | undefined)?.focus();
    return true;
  }
  return false;
});

onMounted(() => {
  // Warm the slideshow chunk so the shared transition starts immediately.
  void import('./SlideshowView.vue');
});
</script>

<template>
  <div class="min-h-dvh">
    <FileHeader @search="paletteOpen = true" />

    <main class="mx-auto max-w-7xl px-6 pb-20 sm:px-10">
      <motion.section
        class="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-14 pb-10"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :transition="{ duration: duration(0.4) }"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-mono text-xs text-muted-foreground" :title="review.dir">{{ review.dir }}</p>
          <h1 class="mt-2 font-display text-3xl leading-tight font-semibold text-balance sm:text-4xl">{{ review.title }}</h1>
        </div>

        <div class="flex flex-col items-end gap-3">
          <div class="flex items-center gap-1 text-sm" role="radiogroup" :aria-label="m.grid.slideshowContent">
            <button
              v-for="key in REVIEW_MODES"
              :key="key"
              type="button"
              role="radio"
              :aria-checked="mode === key"
              :disabled="key === 'selection' && selection.length === 0"
              :class="
                cn(
                  'rounded-md px-2.5 py-1 transition-colors disabled:pointer-events-none disabled:opacity-40',
                  mode === key ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              "
              @click="mode = key"
            >
              {{ m.modes[key] }}<template v-if="key === 'selection' && selection.length > 0"> ({{ selection.length }})</template>
            </button>
          </div>
          <div class="flex items-center gap-3">
            <label v-if="mode === 'pending'" class="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch v-model="preferences.includeDeferred" /> {{ m.grid.includeDeferred }}
            </label>
            <Button variant="ghost" size="icon" class="text-muted-foreground" :aria-label="m.grid.export" :title="m.grid.export" @click="exportDocx"><FileDown /></Button>
            <Button @click="launchReview">
              <Play /> {{ m.grid.launch }}
              <span class="text-primary-foreground/70 tabular-nums">{{ launchCount }}</span>
            </Button>
          </div>
        </div>
      </motion.section>

      <div class="mb-6 flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border pb-px text-sm" role="radiogroup" :aria-label="m.grid.statusFilter">
        <button
          v-for="filter in (['all', ...STATUSES] as const)"
          :key="filter"
          type="button"
          role="radio"
          :aria-checked="statusFilter === filter"
          :class="
            cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 transition-colors',
              statusFilter === filter ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )
          "
          :style="statusFilter === filter && filter !== 'all' ? { borderColor: STATUS_STYLES[filter].color } : undefined"
          @click="statusFilter = filter"
        >
          <span v-if="filter !== 'all'" class="size-2 rounded-full" :style="{ background: STATUS_STYLES[filter].color }" aria-hidden="true" />
          {{ filter === 'all' ? m.grid.all : m.status[filter].plural }}
          <span class="text-muted-foreground tabular-nums">{{ filter === 'all' ? review.adrs.length : review.counts[filter] }}</span>
        </button>
      </div>

      <div class="mb-6 flex flex-wrap items-center gap-3">
        <div class="relative w-full sm:w-72">
          <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input ref="searchInput" v-model="search" type="search" :placeholder="m.grid.search" class="border-transparent bg-secondary/60 pl-9 shadow-none" :aria-label="m.grid.searchLabel" />
        </div>
        <ToggleGroup v-if="review.allTags.length > 0" v-model="tags" type="multiple" size="sm" :spacing="1" class="flex-wrap" :aria-label="m.grid.tagsFilter">
          <ToggleGroupItem v-for="tag in review.allTags" :key="tag" :value="tag" class="rounded-md px-2 text-xs text-muted-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground">{{ tag }}</ToggleGroupItem>
        </ToggleGroup>
        <div class="flex-1" />
        <ToggleGroup
          :model-value="sort"
          type="single"
                    size="sm"
          :aria-label="m.grid.sort"
          @update:model-value="(value) => (sort = (value as SortKey | undefined) ?? 'file')"
        >
          <ToggleGroupItem value="file" class="px-2.5 text-xs text-muted-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground">{{ m.grid.sortNumber }}</ToggleGroupItem>
          <ToggleGroupItem value="date" class="px-2.5 text-xs text-muted-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground">{{ m.grid.sortDate }}</ToggleGroupItem>
          <ToggleGroupItem value="status" class="px-2.5 text-xs text-muted-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground">{{ m.grid.sortStatus }}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <FileIssuesNotice v-if="review.issues.length > 0" :issues="review.issues" class="mb-6" />

      <div v-if="selection.length > 0" class="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
        {{ m.grid.selected(selection.length) }}
        <Button variant="ghost" size="xs" @click="(selection = []), (mode = 'pending')"><X /> {{ m.grid.clearSelection }}</Button>
      </div>

      <ul v-if="visible.length > 0" class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <motion.li
          v-for="(adr, index) in visible"
          :key="adr.id"
          :initial="{ opacity: 0, y: 14 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ duration: duration(0.4), delay: Math.min(index, 12) * 0.04 }"
        >
          <AdrCard
            :adr="adr"
            :selected="selection.includes(adr.id)"
            :transitioning="transitioningId === adr.id"
            @open="openAt(adr.id)"
            @open-adr="openAt"
            @toggle-select="toggleSelect(adr.id)"
          />
        </motion.li>
      </ul>
      <div v-else-if="review.adrs.length === 0" class="rounded-2xl border border-dashed px-6 py-16 text-center text-muted-foreground">
        <p>{{ m.grid.emptyTitle }}</p>
        <p class="mt-2 text-sm">{{ m.grid.emptyHelp('NNNN-title.md', 'docs/decisions', 'docs/adr') }}</p>
      </div>
      <div v-else class="rounded-2xl border border-dashed py-16 text-center text-muted-foreground">
        {{ m.grid.noMatch }}
        <Button variant="link" @click="clearFilters">{{ m.grid.reset }}</Button>
      </div>
    </main>

    <CommandPalette
      v-model:open="paletteOpen"
      @select-adr="(id) => launch({ mode: 'all', at: id })"
      @launch="launchReview"
    />
  </div>
</template>
