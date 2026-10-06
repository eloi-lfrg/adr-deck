import { computed, type ComputedRef } from 'vue';
import { usePreferredReducedMotion } from '@vueuse/core';

export interface MotionPreset {
  reduced: ComputedRef<boolean>;
  /** Duration in seconds, replaced by a 150 ms fade when motion is reduced. */
  duration: (seconds: number) => number;
}

export function useMotionPreset(): MotionPreset {
  const preference = usePreferredReducedMotion();
  const reduced = computed(() => preference.value === 'reduce');
  return {
    reduced,
    duration: (seconds: number) => (reduced.value ? 0.15 : seconds),
  };
}
