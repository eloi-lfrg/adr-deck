<script setup lang="ts">
import type { Adr } from '@adr/format';
import { computed } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import { Check, ChevronDown, Circle, Minus, Play, Plus } from '@lucide/vue';
import AdrLink from '@/components/AdrLink.vue';
import MarkdownText from '@/components/MarkdownText.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { Button } from '@/components/ui/button';
import { useMotionPreset } from '@/composables/useMotion';
import { formatDate, useI18n } from '@/i18n';
import { plainExcerpt } from '@/lib/markdown';
import { STATUS_STYLES } from '@/lib/status';
import { timelineDate } from '@/lib/timeline';
import { cn } from '@/lib/utils';
import { useReviewStore } from '@/stores/review';

const props = defineProps<{ adr: Adr; expanded: boolean; active: boolean; flash: boolean }>();
const emit = defineEmits<{ toggle: []; go: [id: string]; open: [] }>();

const review = useReviewStore();
const { m } = useI18n();
const { reduced, duration } = useMotionPreset();

const date = computed(() => timelineDate(props.adr));
const replaced = computed(() => review.replaces[props.adr.id] ?? []);
const excerpt = computed(() => plainExcerpt(props.adr.context, 260));
const comment = computed(() => props.adr.decision?.comment ?? props.adr.rationale);
const isProposed = computed(() => props.adr.status === 'à décider');
/** Options chosen by the decision, or recommended while the ADR is proposed. */
const highlighted = computed(() => (isProposed.value ? props.adr.recommended : (props.adr.decision?.retained ?? [])));
const highlightedTitles = computed(() =>
  props.adr.propositions
    .filter((proposition) => highlighted.value.includes(proposition.id))
    .map((proposition) => proposition.title)
    .join(' · '),
);
const people = computed(() =>
  (
    [
      [m.value.timeline.deciders, props.adr.deciders],
      [m.value.timeline.consulted, props.adr.consulted],
      [m.value.timeline.informed, props.adr.informed],
    ] as const
  ).filter(([, names]) => names.length > 0),
);
const panelId = computed(() => `timeline-${props.adr.id}`);
</script>

<template>
  <article
    :class="
      cn(
        'group relative rounded-2xl border bg-card transition-[border-color,box-shadow] duration-300',
        active ? 'border-foreground/25 shadow-soft' : 'hover:border-foreground/15',
        flash && 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background',
      )
    "
    :aria-labelledby="`${panelId}-title`"
  >
    <button
      type="button"
      class="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2"
      :aria-expanded="expanded"
      :aria-controls="panelId"
      :aria-label="`${expanded ? m.timeline.collapse : m.timeline.read} · ${adr.id} · ${adr.title}`"
      tabindex="-1"
      @click="emit('toggle')"
    />

    <div class="pointer-events-none relative z-10 p-5 sm:p-6">
      <p class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span class="font-mono tracking-wide">{{ adr.id }}</span>
        <StatusBadge :status="adr.status" size="sm" />
        <span v-if="date" class="tabular-nums md:hidden">{{ formatDate(date, 'long') }}</span>
        <span v-if="adr.tags.length > 0">{{ adr.tags.join(' · ') }}</span>
        <span v-if="replaced.length > 0" class="pointer-events-auto flex flex-wrap items-center gap-x-1.5">
          {{ m.slide.replaces }} <AdrLink v-for="id in replaced" :id="id" :key="id" @go="(target) => emit('go', target)" />
        </span>
        <span v-if="adr.decision?.replacedBy" class="pointer-events-auto flex items-center gap-1.5">
          {{ m.slide.supersededBy }} <AdrLink :id="adr.decision.replacedBy" @go="(target) => emit('go', target)" />
        </span>
      </p>

      <h3 :id="`${panelId}-title`" class="mt-2.5 text-xl leading-snug font-semibold tracking-tight text-balance sm:text-2xl">{{ adr.title }}</h3>

      <div v-if="highlightedTitles || comment" class="mt-3 flex gap-3">
        <span class="mt-1 w-[3px] shrink-0 self-stretch rounded-full" :style="{ background: STATUS_STYLES[adr.status].color }" aria-hidden="true" />
        <div class="min-w-0 text-[0.95rem] leading-relaxed">
          <p v-if="highlightedTitles" class="font-medium">
            {{ isProposed ? m.timeline.recommended(highlightedTitles) : m.timeline.chosen(highlightedTitles) }}
          </p>
          <p v-if="comment" class="text-foreground/75">{{ comment }}</p>
          <p v-if="adr.decision?.nextReview" class="mt-1 text-sm text-muted-foreground">{{ m.slide.nextReviewOn(formatDate(adr.decision.nextReview, 'long')) }}</p>
        </div>
      </div>

      <p v-if="!expanded && excerpt" class="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{{ excerpt }}</p>

      <AnimatePresence :initial="false">
        <motion.div
          v-if="expanded"
          :id="panelId"
          key="panel"
          class="pointer-events-auto overflow-hidden"
          :initial="{ height: reduced ? 'auto' : 0, opacity: 0 }"
          :animate="{ height: 'auto', opacity: 1 }"
          :exit="{ height: reduced ? 'auto' : 0, opacity: 0 }"
          :transition="{ duration: duration(0.38), ease: [0.16, 1, 0.3, 1] }"
        >
          <div class="space-y-7 pt-6 text-[0.95rem] leading-relaxed">
            <section v-if="adr.context">
              <h4 class="timeline-label">{{ m.slide.context }}</h4>
              <MarkdownText :source="adr.context" class="text-foreground/85" />
            </section>

            <section v-if="adr.drivers">
              <h4 class="timeline-label">{{ m.slide.drivers }}</h4>
              <MarkdownText :source="adr.drivers" class="text-foreground/85" />
            </section>

            <section v-if="adr.propositions.length > 0">
              <h4 class="timeline-label">{{ m.slide.options }}</h4>
              <ul class="grid gap-3 sm:grid-cols-2">
                <li
                  v-for="proposition in adr.propositions"
                  :key="proposition.id"
                  :class="
                    cn(
                      'rounded-xl border p-4',
                      highlighted.includes(proposition.id) ? 'border-transparent ring-1' : 'bg-muted/30',
                      !isProposed && adr.decision && !highlighted.includes(proposition.id) && 'opacity-70',
                    )
                  "
                  :style="highlighted.includes(proposition.id) ? { '--tw-ring-color': STATUS_STYLES[adr.status].color } : undefined"
                >
                  <p class="flex items-start gap-2 font-medium">
                    <Check v-if="highlighted.includes(proposition.id)" class="mt-1 size-4 shrink-0" :style="{ color: STATUS_STYLES[adr.status].color }" aria-hidden="true" />
                    <span class="min-w-0">{{ proposition.title }}</span>
                    <span v-if="highlighted.includes(proposition.id)" class="sr-only">({{ m.proposition.retained }})</span>
                  </p>
                  <MarkdownText v-if="proposition.body" :source="proposition.body" class="mt-1.5 text-sm text-muted-foreground" />
                  <ul v-if="proposition.pros.length + proposition.cons.length + proposition.neutral.length > 0" class="mt-2.5 space-y-1 text-sm">
                    <li v-for="(pro, index) in proposition.pros" :key="`pro-${index}`" class="flex gap-2">
                      <Plus class="mt-0.5 size-4 shrink-0 text-status-accepted" :aria-label="m.proposition.pro" />
                      <span>{{ pro }}</span>
                    </li>
                    <li v-for="(neutral, index) in proposition.neutral" :key="`neutral-${index}`" class="flex gap-2">
                      <Circle class="mt-1 size-3 shrink-0 text-muted-foreground" :aria-label="m.proposition.neutral" />
                      <span>{{ neutral }}</span>
                    </li>
                    <li v-for="(con, index) in proposition.cons" :key="`con-${index}`" class="flex gap-2">
                      <Minus class="mt-0.5 size-4 shrink-0 text-status-rejected" :aria-label="m.proposition.con" />
                      <span>{{ con }}</span>
                    </li>
                  </ul>
                </li>
              </ul>
            </section>

            <section v-if="adr.outcomeDetails">
              <h4 class="timeline-label">{{ m.timeline.outcome }}</h4>
              <MarkdownText :source="adr.outcomeDetails" class="text-foreground/85" />
            </section>

            <section v-for="section in adr.otherSections" :key="section.heading">
              <h4 class="timeline-label">{{ section.heading }}</h4>
              <MarkdownText :source="section.body" class="text-foreground/85" />
            </section>

            <section v-if="adr.moreInfo">
              <h4 class="timeline-label">{{ m.timeline.moreInfo }}</h4>
              <MarkdownText :source="adr.moreInfo" class="text-foreground/85" />
            </section>

            <div class="flex flex-wrap items-end justify-between gap-4 border-t pt-4">
              <dl v-if="people.length > 0" class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div v-for="[label, names] in people" :key="label">
                  <dt class="text-xs text-muted-foreground">{{ label }}</dt>
                  <dd>{{ names.join(', ') }}</dd>
                </div>
              </dl>
              <span v-else />
              <Button variant="outline" size="sm" @click.stop="emit('open')"><Play /> {{ m.timeline.openSlideshow }}</Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <button
        type="button"
        class="pointer-events-auto mt-4 inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        :aria-expanded="expanded"
        :aria-controls="panelId"
        @click.stop="emit('toggle')"
      >
        {{ expanded ? m.timeline.collapse : m.timeline.read }}
        <ChevronDown :class="cn('size-4 transition-transform duration-300', expanded && 'rotate-180')" aria-hidden="true" />
      </button>
    </div>
  </article>
</template>

<style scoped>
.timeline-label {
  margin-bottom: 0.5rem;
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
</style>
