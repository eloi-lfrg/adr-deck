<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useI18n } from '@/i18n';

const { m } = useI18n();
</script>

<template>
  <RouterLink to="/" class="group flex items-center gap-2.5 rounded-md" :aria-label="m.brand.home">
    <span class="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground transition-transform duration-300 group-hover:-rotate-6">
      <svg viewBox="0 0 32 32" class="size-5" aria-hidden="true">
        <circle cx="16" cy="16" r="10.5" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="M11.5 16.5l3.2 3.2 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span class="font-display text-lg font-medium tracking-tight">ADR Deck</span>
  </RouterLink>
</template>
