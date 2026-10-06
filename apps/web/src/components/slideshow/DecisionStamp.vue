<script setup lang="ts">
import type { Status } from '@adr/format';
import { computed } from 'vue';
import { motion } from 'motion-v';
import { formatDate, useI18n } from '@/i18n';
import { STATUS_STYLES } from '@/lib/status';
import { useMotionPreset } from '@/composables/useMotion';

const props = defineProps<{ status: Status; date: string | null; animate: boolean }>();
const { reduced } = useMotionPreset();
const { m } = useI18n();

const text = computed(() => [m.value.status[props.status].label, formatDate(props.date)].filter(Boolean).join(' — '));
const transition = computed(() =>
  reduced.value ? { duration: 0.15 } : { type: 'spring' as const, duration: 0.5, bounce: 0.45 },
);
</script>

<template>
  <motion.div
    class="pointer-events-none absolute top-[2.6cqw] right-[3cqw] z-20 select-none"
    :initial="animate ? (reduced ? { opacity: 0, rotate: -6 } : { opacity: 0, scale: 1.9, rotate: -16 }) : false"
    :animate="{ opacity: 1, scale: 1, rotate: -6 }"
    :transition="transition"
    role="img"
    :aria-label="m.slide.stamp(text)"
  >
    <div
      class="rounded-lg border-2 px-[1.2cqw] py-[0.5cqw] text-[max(16px,1.15cqw)] font-semibold tracking-[0.18em] whitespace-nowrap uppercase [mask-image:radial-gradient(circle_at_30%_40%,black_55%,rgb(0_0_0/0.82)_100%)]"
      :style="{ color: STATUS_STYLES[status].color, borderColor: 'currentColor' }"
    >
      {{ text }}
    </div>
  </motion.div>
</template>
