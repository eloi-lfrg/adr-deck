<script setup lang="ts">
import { computed } from 'vue';
import { Monitor, Moon, Sun } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { usePreferencesStore } from '@/stores/preferences';

const preferences = usePreferencesStore();
const mode = computed(() => preferences.themeChoice);
const { m } = useI18n();
const label = computed(() => (mode.value === 'dark' ? m.value.theme.dark : mode.value === 'light' ? m.value.theme.light : m.value.theme.system));
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <Button variant="ghost" size="icon-sm" :aria-label="m.theme.change(label)" @click="preferences.cycleTheme()">
        <Moon v-if="mode === 'dark'" />
        <Sun v-else-if="mode === 'light'" />
        <Monitor v-else />
      </Button>
    </TooltipTrigger>
    <TooltipContent>{{ label }}</TooltipContent>
  </Tooltip>
</template>
