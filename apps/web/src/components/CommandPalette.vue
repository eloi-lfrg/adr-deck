<script setup lang="ts">
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { FileDown, Languages, LayoutGrid, Palette, Play } from '@lucide/vue';
import StatusBadge from '@/components/StatusBadge.vue';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { cycleLanguage, useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { usePreferencesStore } from '@/stores/preferences';
import { useReviewStore } from '@/stores/review';

const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ selectAdr: [id: string]; launch: [] }>();

const router = useRouter();
const review = useReviewStore();
const preferences = usePreferencesStore();
const { m, locale } = useI18n();

function run(action: () => void): void {
  open.value = false;
  action();
}

async function exportDocx(): Promise<void> {
  try {
    await review.flushNow();
    const fileName = await api.downloadDocx(locale.value);
    toast.success(m.value.export.ready, { description: fileName });
  } catch (error) {
    toast.error(m.value.export.failed, { description: error instanceof Error ? error.message : String(error) });
  }
}
</script>

<template>
  <CommandDialog v-model:open="open" :title="m.palette.title" :description="m.palette.description">
    <CommandInput :placeholder="m.palette.placeholder" />
    <CommandList class="max-h-[60vh]">
      <CommandEmpty>{{ m.palette.empty }}</CommandEmpty>
      <CommandGroup :heading="m.palette.adrs">
        <CommandItem v-for="adr in review.adrs" :key="adr.id" :value="adr.id" class="gap-3" @select="run(() => emit('selectAdr', adr.id))">
          <span class="w-16 shrink-0 font-mono text-xs text-muted-foreground">{{ adr.id }}</span>
          <span class="min-w-0 flex-1 truncate">{{ adr.title }}</span>
          <span class="hidden">{{ adr.tags.join(' ') }} {{ adr.context }}</span>
          <StatusBadge :status="adr.status" size="sm" />
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup :heading="m.palette.actions">
        <CommandItem value="action-launch" @select="run(() => emit('launch'))">
          <Play /> {{ m.palette.launch }} <CommandShortcut>R</CommandShortcut>
        </CommandItem>
        <CommandItem value="action-grid" @select="run(() => router.push({ name: 'grid' }))">
          <LayoutGrid /> {{ m.palette.grid }} <CommandShortcut>G</CommandShortcut>
        </CommandItem>
        <CommandItem value="action-export" @select="run(() => void exportDocx())">
          <FileDown /> {{ m.palette.export }}
        </CommandItem>
        <CommandItem value="action-theme" @select="run(() => preferences.cycleTheme())">
          <Palette /> {{ m.palette.theme }}
        </CommandItem>
        <CommandItem value="action-language" @select="run(() => cycleLanguage())">
          <Languages /> {{ m.palette.language }} <CommandShortcut>{{ m.language.names[locale] }}</CommandShortcut>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
