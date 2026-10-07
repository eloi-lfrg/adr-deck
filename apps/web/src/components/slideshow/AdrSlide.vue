<script setup lang="ts">
import { categoryOf, outcomeParts, reworkActions, type Adr, type Status } from '@adr/format';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { motion } from 'motion-v';
import { Folder, ShieldQuestion } from '@lucide/vue';
import AdrLink from '@/components/AdrLink.vue';
import MarkdownText from '@/components/MarkdownText.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import DecisionBar from '@/components/slideshow/DecisionBar.vue';
import DecisionStamp from '@/components/slideshow/DecisionStamp.vue';
import DecisionSummary from '@/components/slideshow/DecisionSummary.vue';
import PropositionCard from '@/components/slideshow/PropositionCard.vue';
import { useMotionPreset } from '@/composables/useMotion';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { useReviewStore } from '@/stores/review';

const props = defineProps<{
  adr: Adr;
  editing: boolean;
  selected: string[];
  animateStamp: boolean;
  hint: string | null;
}>();
const emit = defineEmits<{
  toggle: [id: string];
  decide: [status: Status];
  rework: [actions: string[]];
  modify: [];
  go: [id: string];
  lifecycle: [mode: 'supersede' | 'deprecate'];
}>();
const comment = defineModel<string>('comment', { required: true });
const nextReview = defineModel<string>('nextReview', { required: true });

const { reduced, duration } = useMotionPreset();
const bar = ref<InstanceType<typeof DecisionBar> | null>(null);
const contextBox = ref<HTMLElement | null>(null);
const contextExpanded = ref(false);
const contextOverflows = ref(false);

const review = useReviewStore();
const { m } = useI18n();
/** ADRs this one supersedes. */
const replaced = computed(() => review.replaces[props.adr.id] ?? []);
const hasStamp = computed(() => props.adr.status !== 'à décider' && props.adr.decision !== null);
const category = computed(() => categoryOf(props.adr.file));
/** « Decision Outcome » subsections: what accepting implies, and how it will be checked. */
const outcome = computed(() => outcomeParts(props.adr));
const openActions = computed(() => reworkActions(props.adr).filter((action) => !action.done));
const missingConfirmation = computed(() => props.adr.status === 'validée' && outcome.value.confirmation === '');
const columns = computed(() => Math.min(Math.max(props.adr.propositions.length, 2), 4));
const basis = computed(() => `calc((100% - ${columns.value - 1} * 1.2cqw) / ${columns.value})`);

function markOf(id: string): 'retained' | 'discarded' | null {
  if (props.editing || !props.adr.decision) return null;
  if (props.adr.status === 'validée') return props.adr.decision.retained.includes(id) ? 'retained' : 'discarded';
  if (props.adr.status === 'refusée') return 'discarded';
  return null;
}

function dimmed(id: string): boolean {
  if (props.editing) return props.selected.length > 0 && !props.selected.includes(id);
  return markOf(id) === 'discarded';
}

/** Entrance cascade: title, context, then cards, 60 ms apart. */
function enter(step: number): Record<string, unknown> {
  return {
    initial: { opacity: 0, y: reduced.value ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: duration(0.42), delay: reduced.value ? 0 : step * 0.06, ease: [0.16, 1, 0.3, 1] },
  };
}

let observer: ResizeObserver | null = null;
function measure(): void {
  const box = contextBox.value;
  if (box && !contextExpanded.value) contextOverflows.value = box.scrollHeight > box.clientHeight + 2;
}

onMounted(() => {
  observer = new ResizeObserver(measure);
  if (contextBox.value) observer.observe(contextBox.value);
  measure();
});
onBeforeUnmount(() => observer?.disconnect());
watch(
  () => [props.adr.context, props.adr.drivers, props.adr.outcomeDetails, props.adr.moreInfo],
  () => void nextTick(measure),
);

defineExpose({ focusComment: () => bar.value?.focusComment(), startRework: () => bar.value?.startRework() });
</script>

<template>
  <article class="absolute inset-0 flex flex-col" :aria-label="`${adr.id} · ${adr.title}`">
    <DecisionStamp
      v-if="hasStamp"
      :key="`${adr.id}-${adr.status}-${adr.decision?.date ?? ''}-${adr.decision?.retained.join(',') ?? ''}`"
      :status="adr.status"
      :date="adr.decision?.date ?? null"
      :animate="animateStamp"
    />

    <div class="flex min-h-0 flex-1 flex-col gap-[1.8cqw] px-[3cqw] pt-[2.4cqw] pb-[1.6cqw]">
      <motion.header v-bind="enter(0)" :class="cn('shrink-0', hasStamp && 'pr-[24cqw]')">
        <p class="flex flex-wrap items-center gap-x-[1cqw] gap-y-1 text-[max(14px,0.85cqw)] text-muted-foreground">
          <span class="font-mono">{{ adr.id }}</span>
          <StatusBadge :status="adr.status" class="text-[max(14px,0.85cqw)]" />
          <span v-if="category" class="inline-flex items-center gap-1 font-mono"><Folder class="size-[1em]" aria-hidden="true" />{{ category }}</span>
          <span v-if="adr.tags.length > 0">{{ adr.tags.join(' · ') }}</span>
          <span v-if="missingConfirmation" class="inline-flex items-center gap-1 text-status-deferred" :title="m.slide.noConfirmationLabel">
            <ShieldQuestion class="size-[1em]" aria-hidden="true" />{{ m.slide.noConfirmation }}
          </span>
          <span v-if="replaced.length > 0" class="flex flex-wrap items-center gap-x-1.5">
            {{ m.slide.replaces }}
            <AdrLink v-for="id in replaced" :id="id" :key="id" @go="(target) => emit('go', target)" />
          </span>
        </p>
        <h2 class="mt-[0.8cqw] font-display text-[max(40px,3.2cqw)] leading-[1.05] font-medium tracking-tight text-balance">{{ adr.title }}</h2>
      </motion.header>

      <motion.section v-bind="enter(1)" class="shrink-0" :aria-label="m.slide.context">
        <div
          ref="contextBox"
          :class="
            cn(
              'max-w-[72ch] text-[max(20px,1.28cqw)] leading-[1.55] text-foreground/75',
              contextExpanded ? 'max-h-[32cqw] overflow-y-auto pr-2' : 'line-clamp-6',
            )
          "
        >
          <MarkdownText :source="adr.context" />
          <template v-if="adr.drivers">
            <p class="mt-[0.8cqw] font-medium text-foreground/90">{{ m.slide.drivers }}</p>
            <MarkdownText :source="adr.drivers" />
          </template>
          <template v-if="openActions.length > 0">
            <p class="mt-[0.8cqw] font-medium text-primary">{{ m.slide.actions }}</p>
            <ul class="list-disc pl-[1.2em]">
              <li v-for="(action, index) in openActions" :key="index">{{ action.text }}</li>
            </ul>
          </template>
          <template v-if="outcome.consequences">
            <p class="mt-[0.8cqw] font-medium text-foreground/90">{{ m.slide.consequences }}</p>
            <MarkdownText :source="outcome.consequences" />
          </template>
          <template v-if="outcome.confirmation">
            <p class="mt-[0.8cqw] font-medium text-foreground/90">{{ m.slide.confirmation }}</p>
            <MarkdownText :source="outcome.confirmation" />
          </template>
        </div>
        <button
          v-if="contextOverflows || contextExpanded"
          type="button"
          class="mt-1 rounded text-[max(15px,0.85cqw)] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          :aria-expanded="contextExpanded"
          @click="(contextExpanded = !contextExpanded), nextTick(measure)"
        >
          {{ contextExpanded ? m.slide.collapse : m.slide.readMore }}
        </button>
      </motion.section>

      <section class="flex min-h-0 flex-1 flex-col" :aria-label="m.slide.options">
        <div
          v-if="adr.propositions.length > 0"
          :class="cn('flex min-h-0 flex-1 snap-x items-start gap-[1.2cqw] overflow-x-auto pt-1 pb-1', adr.propositions.length < columns && 'justify-start')"
        >
          <PropositionCard
            v-for="(proposition, index) in adr.propositions"
            :key="proposition.id"
            :proposition="proposition"
            :index="index"
            :editing="editing"
            :selected="selected.includes(proposition.id)"
            :dimmed="dimmed(proposition.id)"
            :mark="markOf(proposition.id)"
            :basis="basis"
            :enter-delay="(2 + index) * 0.06"
            @toggle="emit('toggle', proposition.id)"
          />
        </div>
        <p v-else class="text-[max(18px,1cqw)] text-muted-foreground">{{ m.slide.noOptions }}</p>
      </section>

      <motion.div v-bind="enter(2 + Math.min(adr.propositions.length, 4))" class="shrink-0 border-t border-border/70 pt-[1.2cqw]">
        <DecisionBar
          v-if="editing"
          ref="bar"
          v-model:comment="comment"
          v-model:next-review="nextReview"
          :adr-id="adr.id"
          :selected="selected"
          :hint="hint"
          @decide="(status) => emit('decide', status)"
          @rework="(actions) => emit('rework', actions)"
        />
        <DecisionSummary v-else :adr="adr" @modify="emit('modify')" @go="(id) => emit('go', id)" @lifecycle="(mode) => emit('lifecycle', mode)" />
      </motion.div>
    </div>
  </article>
</template>
