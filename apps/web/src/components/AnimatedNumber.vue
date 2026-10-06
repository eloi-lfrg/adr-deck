<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMotionPreset } from '@/composables/useMotion';

const props = withDefaults(defineProps<{ value: number; durationMs?: number }>(), { durationMs: 800 });
const display = ref(0);
const { reduced } = useMotionPreset();
let frame = 0;

function run(from: number, to: number): void {
  cancelAnimationFrame(frame);
  if (reduced.value) {
    display.value = to;
    return;
  }
  const start = performance.now();
  const step = (now: number): void => {
    const progress = Math.min(1, (now - start) / props.durationMs);
    const eased = 1 - (1 - progress) ** 3;
    display.value = Math.round(from + (to - from) * eased);
    if (progress < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}

onMounted(() => run(0, props.value));
watch(
  () => props.value,
  (to, from) => run(from, to),
);
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
  <span class="tabular-nums">{{ display }}</span>
</template>
