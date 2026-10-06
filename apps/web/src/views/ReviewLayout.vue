<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { RouterView } from 'vue-router';
import { Loader2 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useReviewStore } from '@/stores/review';

const review = useReviewStore();
const { m } = useI18n();
void review.load();

function beforeUnload(event: BeforeUnloadEvent): void {
  if (!review.hasPendingChanges) return;
  void review.flushNow();
  event.preventDefault();
}

onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload);
  void review.flushNow();
});
</script>

<template>
  <RouterView v-if="review.loaded" />
  <div v-else-if="review.loadError === null" class="grid min-h-dvh place-items-center text-muted-foreground">
    <Loader2 class="size-6 animate-spin" aria-hidden="true" />
  </div>
  <div v-else class="mx-auto max-w-2xl px-6 py-20">
    <h1 class="font-display text-3xl">{{ m.layout.loadFailed }}</h1>
    <p class="mt-3 text-muted-foreground">{{ review.loadError }}</p>
    <Button variant="outline" class="mt-8" @click="review.load()">{{ m.layout.retry }}</Button>
  </div>
</template>
