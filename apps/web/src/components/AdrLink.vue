<script setup lang="ts">
import { computed } from 'vue';
import { ArrowUpRight } from '@lucide/vue';
import { useI18n } from '@/i18n';
import { useReviewStore } from '@/stores/review';

/** Link to another ADR of the directory, shown with its title; plain text when the ADR is missing. */
const props = defineProps<{ id: string; showTitle?: boolean }>();
defineEmits<{ go: [id: string] }>();

const review = useReviewStore();
const { m } = useI18n();
const target = computed(() => review.adrById(props.id));
</script>

<template>
  <button
    v-if="target"
    type="button"
    class="inline-flex max-w-full min-w-0 items-center gap-1 rounded text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
    :aria-label="m.link.goTo(target.id, target.title)"
    :title="`${target.id} · ${target.title}`"
    @click.stop="$emit('go', target.id)"
  >
    <span class="shrink-0 font-mono">{{ target.id }}</span>
    <span v-if="showTitle" class="truncate">· {{ target.title }}</span>
    <ArrowUpRight class="size-[1em] shrink-0" aria-hidden="true" />
  </button>
  <span v-else class="font-mono" :title="m.link.missing">{{ id }} {{ m.link.missingSuffix }}</span>
</template>
