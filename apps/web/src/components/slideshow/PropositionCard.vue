<script setup lang="ts">
import type { Proposition } from '@adr/format';
import { computed } from 'vue';
import { motion } from 'motion-v';
import { Check } from '@lucide/vue';
import MarkdownText from '@/components/MarkdownText.vue';
import { useMotionPreset } from '@/composables/useMotion';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

/** `mark`: how the card is shown in read mode (retained / set aside). */
const props = defineProps<{
  proposition: Proposition;
  index: number;
  editing: boolean;
  selected: boolean;
  dimmed: boolean;
  mark: 'retained' | 'discarded' | null;
  basis: string;
  /** Entrance cascade delay, in seconds. */
  enterDelay: number;
}>();
defineEmits<{ toggle: [] }>();

const { reduced, duration } = useMotionPreset();
const { m } = useI18n();
const highlighted = computed(() => props.selected || props.mark === 'retained');
const label = computed(() => {
  const base = `${props.proposition.id} · ${props.proposition.title}`;
  const texts = m.value.proposition;
  if (!props.editing) return props.mark === 'retained' ? `${base} — ${texts.retained}` : props.mark === 'discarded' ? `${base} — ${texts.discarded}` : base;
  return props.selected ? texts.unselect(base, props.index + 1) : texts.select(base, props.index + 1);
});
</script>

<template>
  <motion.div
    class="flex max-h-full min-h-0 snap-start"
    :style="{ flex: `0 0 ${basis}` }"
    :initial="{ opacity: 0, y: reduced ? 0 : 14 }"
    :animate="{ opacity: 1, y: 0 }"
    :transition="{ duration: duration(0.4), delay: reduced ? 0 : enterDelay, ease: [0.16, 1, 0.3, 1] }"
  >
    <motion.button
      type="button"
      :disabled="!editing"
      :aria-pressed="editing ? selected : undefined"
      :aria-label="label"
      :class="
        cn(
          'relative flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border p-[1.4cqw] text-left transition-[border-color,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default',
          editing && 'cursor-pointer hover:border-foreground/25',
          highlighted && 'border-primary bg-accent ring-1 ring-primary',
        )
      "
      :initial="false"
      :animate="{ opacity: dimmed ? 0.6 : 1, y: reduced ? 0 : highlighted && editing ? -4 : 0 }"
      :transition="{ duration: duration(0.2) }"
      @click="$emit('toggle')"
    >
      <div class="flex items-center gap-2.5 font-mono text-[max(14px,0.85cqw)]">
        <span
          :class="cn('rounded-md px-1.5 py-0.5 transition-colors', highlighted ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')"
        >{{ proposition.id }}</span>
        <span v-if="mark === 'retained'" class="inline-flex items-center gap-1 font-sans font-medium text-primary"><Check class="size-[1.1em]" /> {{ m.proposition.retained }}</span>
        <span v-else-if="mark === 'discarded'" class="font-sans text-muted-foreground">{{ m.proposition.discarded }}</span>
        <Check v-else-if="selected" class="size-[1.1em] text-primary" aria-hidden="true" />
      </div>
      <h3 class="mt-[0.7cqw] font-display text-[max(22px,1.6cqw)] leading-tight text-balance">{{ proposition.title }}</h3>
      <div
        v-if="proposition.body || proposition.pros.length > 0 || proposition.cons.length > 0"
        class="mt-[0.7cqw] min-h-0 flex-1 space-y-[0.6cqw] overflow-y-auto pr-1 text-[max(20px,1.12cqw)] leading-snug text-foreground/75"
      >
        <MarkdownText v-if="proposition.body" :source="proposition.body" />
        <dl class="space-y-1">
          <div v-for="(pro, proIndex) in proposition.pros" :key="`pro-${proIndex}`" class="flex gap-2">
            <dt class="shrink-0 font-semibold text-status-accepted" :aria-label="m.proposition.pro">+</dt>
            <dd>{{ pro }}</dd>
          </div>
          <div v-for="(con, conIndex) in proposition.cons" :key="`con-${conIndex}`" class="flex gap-2">
            <dt class="shrink-0 font-semibold text-status-rejected" :aria-label="m.proposition.con">−</dt>
            <dd>{{ con }}</dd>
          </div>
        </dl>
      </div>
    </motion.button>
  </motion.div>
</template>
