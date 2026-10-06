<script setup lang="ts">
import { Languages } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isLanguageChoice, LOCALES, setLanguage, useI18n } from '@/i18n';

const { m, locale, choice, detected } = useI18n();

function select(value: unknown): void {
  if (isLanguageChoice(value)) setLanguage(value);
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        class="gap-1.5 px-2 text-muted-foreground"
        :aria-label="`${m.language.label} — ${m.language.names[locale]}`"
        :title="m.language.label"
      >
        <Languages />
        <span class="font-mono text-xs uppercase">{{ locale }}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-44">
      <DropdownMenuLabel>{{ m.language.label }}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup :model-value="choice" @update:model-value="select">
        <DropdownMenuRadioItem value="auto">{{ m.language.auto(m.language.names[detected]) }}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem v-for="code in LOCALES" :key="code" :value="code" :lang="code">{{ m.language.names[code] }}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
