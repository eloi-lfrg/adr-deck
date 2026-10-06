<script setup lang="ts">
import type { Status } from '@adr/format';
import { computed } from 'vue';
import { cn } from '@/lib/utils';
import { STATUS_STYLES } from '@/lib/status';
import { useI18n } from '@/i18n';

const props = defineProps<{ status: Status; size?: 'sm' | 'md' | 'lg'; class?: string }>();
const { m } = useI18n();
const style = computed(() => STATUS_STYLES[props.status]);
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        style.pill,
        size === 'lg' ? 'px-3 py-1 text-[0.95rem]' : size === 'sm' ? 'px-2 py-0.5 text-[0.7rem]' : 'px-2.5 py-0.5 text-xs',
        props.class,
      )
    "
  >
    <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
    {{ m.status[status].label }}
  </span>
</template>
