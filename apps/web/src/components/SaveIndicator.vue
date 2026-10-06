<script setup lang="ts">
import { computed } from 'vue';
import { AlertCircle, Check, Loader2, RotateCw } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useReviewStore } from '@/stores/review';

const review = useReviewStore();
const { m } = useI18n();

const label = computed(() => {
  switch (review.saveState) {
    case 'saving':
      return m.value.save.saving;
    case 'error':
      return m.value.save.error;
    case 'saved':
      return m.value.save.saved;
    case 'idle':
      return m.value.save.idle;
  }
  return '';
});
</script>

<template>
  <div class="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite" :title="review.saveError ?? undefined">
    <Loader2 v-if="review.saveState === 'saving'" class="size-3.5 animate-spin" aria-hidden="true" />
    <AlertCircle v-else-if="review.saveState === 'error'" class="size-3.5 text-destructive" aria-hidden="true" />
    <Check v-else class="size-3.5 text-status-accepted" aria-hidden="true" />
    <span :class="review.saveState === 'error' && 'text-destructive'">{{ label }}</span>
    <Button v-if="review.saveState === 'error'" variant="ghost" size="xs" class="text-destructive" @click="review.retrySave()">
      <RotateCw /> {{ m.save.retry }}
    </Button>
  </div>
</template>
