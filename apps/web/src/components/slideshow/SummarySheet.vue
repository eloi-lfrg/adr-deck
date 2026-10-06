<script setup lang="ts">
import type { Adr } from '@adr/format';
import { nextTick, ref, watch } from 'vue';
import { Kbd } from '@/components/ui/kbd';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { STATUS_STYLES } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

defineProps<{ adrs: Adr[]; currentIndex: number }>();
const emit = defineEmits<{ go: [index: number] }>();
const open = defineModel<boolean>('open', { required: true });
const list = ref<HTMLElement | null>(null);
const { m } = useI18n();

watch(open, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  list.value?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
});

function go(index: number): void {
  emit('go', index);
  open.value = false;
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="right" class="w-[22rem] gap-0 p-0 sm:max-w-[22rem]">
      <SheetHeader class="border-b p-5">
        <SheetTitle class="font-display text-xl font-normal">{{ m.summarySheet.title }}</SheetTitle>
        <SheetDescription>{{ m.summarySheet.description(adrs.length) }} <Kbd>S</Kbd> {{ m.summarySheet.toClose }}</SheetDescription>
      </SheetHeader>
      <ol ref="list" class="flex-1 space-y-2 overflow-y-auto p-4">
        <li v-for="(adr, index) in adrs" :key="adr.id">
          <button
            type="button"
            :aria-current="index === currentIndex"
            :class="
              cn(
                'flex w-full gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-2',
                index === currentIndex && 'border-primary ring-1 ring-primary/40',
              )
            "
            @click="go(index)"
          >
            <span class="w-6 shrink-0 pt-0.5 text-right font-mono text-xs text-muted-foreground tabular-nums">{{ index + 1 }}</span>
            <span class="aspect-video w-16 shrink-0 rounded-md border bg-background p-1.5" aria-hidden="true">
              <span class="block h-1 w-3/4 rounded-full bg-foreground/50" />
              <span class="mt-1 block h-0.5 w-full rounded-full bg-foreground/15" />
              <span class="mt-0.5 block h-0.5 w-5/6 rounded-full bg-foreground/15" />
              <span class="mt-1.5 flex gap-0.5">
                <span v-for="p in Math.min(adr.propositions.length, 4)" :key="p" class="h-2 flex-1 rounded-[2px] bg-foreground/10" />
              </span>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-mono text-[0.68rem] text-muted-foreground">{{ adr.id }}</span>
              <span class="line-clamp-2 text-sm leading-snug">{{ adr.title }}</span>
              <span class="mt-1 flex items-center gap-1.5 text-[0.7rem]" :class="STATUS_STYLES[adr.status].text">
                <span class="size-1.5 rounded-full bg-current" />{{ m.status[adr.status].label }}
              </span>
            </span>
          </button>
        </li>
      </ol>
    </SheetContent>
  </Sheet>
</template>
