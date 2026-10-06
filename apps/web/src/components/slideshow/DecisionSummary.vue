<script setup lang="ts">
import type { Adr } from '@adr/format';
import { Pencil } from '@lucide/vue';
import AdrLink from '@/components/AdrLink.vue';
import { formatDate, useI18n } from '@/i18n';
import { decisionLabel, STATUS_STYLES } from '@/lib/status';

defineProps<{ adr: Adr }>();
defineEmits<{ modify: []; go: [id: string] }>();
const { m } = useI18n();
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-[1.6cqw] gap-y-2 text-[max(18px,1.05cqw)]">
    <p class="font-medium" :class="STATUS_STYLES[adr.status].text">{{ decisionLabel(adr.status, adr.decision?.date ?? null) }}</p>
    <p v-if="adr.decision && adr.decision.retained.length > 0" class="text-muted-foreground">{{ adr.decision.retained.join(', ') }}</p>
    <p v-if="adr.decision?.nextReview" class="text-muted-foreground">{{ m.slide.nextReviewOn(formatDate(adr.decision.nextReview)) }}</p>
    <p v-if="adr.decision?.replacedBy" class="flex min-w-0 items-center gap-1.5 text-muted-foreground">
      {{ m.slide.supersededBy }} <AdrLink :id="adr.decision.replacedBy" show-title @go="(id) => $emit('go', id)" />
      <span class="text-[0.8em] text-muted-foreground/70">{{ m.slide.followKey }}</span>
    </p>
    <p v-if="adr.decision?.comment" class="min-w-0 flex-1 truncate text-foreground/70">« {{ adr.decision.comment }} »</p>
    <span v-else class="flex-1" />
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[max(16px,0.9cqw)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2"
      :aria-label="m.slide.modifyLabel"
      @click="$emit('modify')"
    >
      <Pencil class="size-[1em]" /> {{ m.slide.modify }}
    </button>
  </div>
</template>
