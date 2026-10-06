<script setup lang="ts">
import { STATUSES, type Status } from '@adr/format';
import { computed } from 'vue';
import { STATUS_STYLES } from '@/lib/status';
import { useI18n } from '@/i18n';

const props = defineProps<{ counts: Record<Status, number> }>();
const { m } = useI18n();
const total = computed(() => STATUSES.reduce((sum, status) => sum + props.counts[status], 0));
const label = computed(() =>
  STATUSES.filter((status) => props.counts[status] > 0)
    .map((status) => `${props.counts[status]} ${m.value.status[status].label.toLowerCase()}`)
    .join(', '),
);
</script>

<template>
  <div class="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" role="img" :aria-label="label">
    <template v-for="status in STATUSES" :key="status">
      <div
        v-if="counts[status] > 0"
        class="h-full transition-[width] duration-300 ease-out not-last:border-r-2 not-last:border-card"
        :style="{ width: `${(counts[status] / Math.max(total, 1)) * 100}%`, background: STATUS_STYLES[status].color }"
      />
    </template>
  </div>
</template>
