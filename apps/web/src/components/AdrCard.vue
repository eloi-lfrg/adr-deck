<script setup lang="ts">
import type { Adr } from '@adr/format';
import { computed } from 'vue';
import { Check } from '@lucide/vue';
import AdrLink from '@/components/AdrLink.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { decisionLabel, STATUS_STYLES } from '@/lib/status';
import { plainExcerpt } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

const props = defineProps<{ adr: Adr; selected: boolean; transitioning: boolean }>();
defineEmits<{ open: []; toggleSelect: []; openAdr: [id: string] }>();

const { m } = useI18n();
const excerpt = computed(() => plainExcerpt(props.adr.context, 200));
const decided = computed(() => (props.adr.decision?.date ? decisionLabel(props.adr.status, props.adr.decision.date) : null));
</script>

<template>
  <article
    :class="
      cn(
        'group relative flex h-full flex-col rounded-xl border bg-card p-5 transition-colors duration-200 hover:border-foreground/20',
        selected && 'border-primary/60 ring-2 ring-primary/25',
      )
    "
    :style="transitioning ? { viewTransitionName: 'adr-stage' } : undefined"
  >
    <span class="absolute top-5 bottom-5 left-0 w-[3px] rounded-r-full" :style="{ background: STATUS_STYLES[adr.status].color }" aria-hidden="true" />
    <button
      type="button"
      class="absolute inset-0 z-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
      :aria-label="m.card.open(adr.id, adr.title)"
      @click="$emit('open')"
    />
    <div class="pointer-events-none relative z-10 flex items-center justify-between gap-2">
      <span class="font-mono text-xs tracking-wide text-muted-foreground">{{ adr.id }}</span>
      <StatusBadge :status="adr.status" size="sm" />
    </div>
    <h3 class="pointer-events-none relative z-10 mt-2.5 font-display text-lg leading-snug font-medium text-balance">{{ adr.title }}</h3>
    <p class="pointer-events-none relative z-10 mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{{ excerpt }}</p>
    <div class="pointer-events-none relative z-10 mt-auto flex flex-wrap items-center gap-1.5 pt-4">
      <span v-if="adr.tags.length > 0" class="truncate text-[0.7rem] text-muted-foreground">{{ adr.tags.join(' · ') }}</span>
      <span class="flex-1" />
      <span v-if="adr.decision?.replacedBy" class="pointer-events-auto flex items-center gap-1 text-[0.7rem] text-muted-foreground">
        {{ m.card.supersededBy }} <AdrLink :id="adr.decision.replacedBy" @go="(id) => $emit('openAdr', id)" />
      </span>
      <span v-else-if="decided" class="text-[0.7rem] text-muted-foreground">{{ decided }}</span>
      <span v-else class="text-[0.7rem] text-muted-foreground">{{ m.card.propositions(adr.propositions.length) }}</span>
    </div>
    <button
      type="button"
      :aria-pressed="selected"
      :aria-label="selected ? m.card.unselect(adr.id) : m.card.select(adr.id)"
      :class="
        cn(
          'absolute -top-2 -left-2 z-20 grid size-6 place-items-center rounded-full border bg-background shadow-sm transition-all focus-visible:opacity-100',
          selected ? 'border-primary bg-primary text-primary-foreground opacity-100' : 'opacity-0 group-hover:opacity-100',
        )
      "
      @click.stop="$emit('toggleSelect')"
    >
      <Check class="size-3.5" />
    </button>
  </article>
</template>
