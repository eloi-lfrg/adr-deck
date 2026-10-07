<script setup lang="ts">
import { Eye, Search } from '@lucide/vue';
import BrandMark from '@/components/BrandMark.vue';
import SaveIndicator from '@/components/SaveIndicator.vue';
import LanguageMenu from '@/components/LanguageMenu.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useI18n } from '@/i18n';
import { useReviewStore } from '@/stores/review';

const { m } = useI18n();
const review = useReviewStore();

defineEmits<{ search: [] }>();
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
    <div class="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6 sm:px-10">
      <BrandMark />
      <div class="flex-1" />
      <span v-if="review.readOnly" class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground" :title="m.readOnly.tooltip">
        <Eye class="size-3.5" /> {{ m.readOnly.badge }}
      </span>
      <SaveIndicator v-else />
      <Button variant="outline" size="sm" class="hidden gap-3 text-muted-foreground sm:inline-flex" @click="$emit('search')">
        <Search /> {{ m.header.search }} <Kbd>Ctrl K</Kbd>
      </Button>
      <LanguageMenu />
      <ThemeToggle />
    </div>
  </header>
</template>
