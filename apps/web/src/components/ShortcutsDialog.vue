<script setup lang="ts">
import { computed } from 'vue';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useI18n } from '@/i18n';

const open = defineModel<boolean>('open', { required: true });
const props = withDefaults(defineProps<{ variant?: 'slideshow' | 'timeline' }>(), { variant: 'slideshow' });

const { m } = useI18n();

const groups = computed<{ title: string; items: [string[], string][] }[]>(() => {
  const k = m.value.shortcuts;
  if (props.variant === 'timeline') {
    return [
      {
        title: k.timeline,
        items: [
          [['↑', '↓'], k.move],
          [['J', 'K'], k.move],
          [[k.enter], k.read],
          [['A'], k.readAll],
        ],
      },
      {
        title: k.navigation,
        items: [
          [['G'], k.grid],
          [['Ctrl', 'K'], m.value.header.search],
          [[k.escape], k.grid],
        ],
      },
    ];
  }
  return [
    {
      title: k.navigation,
      items: [
        [['←', '→'], k.previousNext],
        [['L'], k.follow],
        [['S'], k.contents],
        [['G'], k.grid],
        [['T'], k.openTimeline],
        [['F'], k.fullscreen],
        [[k.escape], k.close],
      ],
    },
    {
      title: k.decision,
      items: [
        [['1', '…', '9'], k.select],
        [['V'], k.accept],
        [['X'], k.reject],
        [['P'], k.defer],
        [['C'], k.comment],
        [['M'], k.modify],
        [['Ctrl', 'Z'], k.undo],
      ],
    },
  ];
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle class="font-display text-2xl font-normal">{{ m.shortcuts.title }}</DialogTitle>
        <DialogDescription>{{ m.shortcuts.description }} <Kbd>?</Kbd> {{ m.shortcuts.descriptionEnd }}</DialogDescription>
      </DialogHeader>
      <div class="grid gap-8 sm:grid-cols-2">
        <section v-for="group in groups" :key="group.title">
          <h3 class="mb-3 text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">{{ group.title }}</h3>
          <dl class="space-y-2.5 text-sm">
            <div v-for="[keys, label] in group.items" :key="label" class="flex items-center justify-between gap-4">
              <dt class="text-foreground/85">{{ label }}</dt>
              <dd class="flex gap-1"><Kbd v-for="key in keys" :key="key">{{ key }}</Kbd></dd>
            </div>
          </dl>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
