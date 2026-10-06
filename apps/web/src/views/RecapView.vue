<script setup lang="ts">
import type { Status } from '@adr/format';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { motion } from 'motion-v';
import { toast } from 'vue-sonner';
import { ArrowLeft, FileDown, Loader2 } from '@lucide/vue';
import AnimatedNumber from '@/components/AnimatedNumber.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import FileHeader from '@/components/FileHeader.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useLaunch } from '@/composables/useLaunch';
import { useMotionPreset } from '@/composables/useMotion';
import { isTypingTarget, useShortcuts } from '@/composables/useShortcuts';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { STATUS_STYLES } from '@/lib/status';
import { useReviewStore } from '@/stores/review';

const router = useRouter();
const review = useReviewStore();
const launch = useLaunch();
const { m, locale } = useI18n();
const { duration } = useMotionPreset();
const exporting = ref(false);
const paletteOpen = ref(false);

const SHOWN: Status[] = ['validée', 'refusée', 'reportée'];
const decisions = computed(() => review.sessionDecisions);
const counts = computed(() => Object.fromEntries(SHOWN.map((status) => [status, decisions.value.filter((entry) => entry.status === status).length])) as Record<Status, number>);
const today = computed(() => new Intl.DateTimeFormat(m.value.intlLocale, { dateStyle: 'full', timeZone: 'Europe/Paris' }).format(new Date()));

async function exportDocx(): Promise<void> {
  exporting.value = true;
  try {
    await review.flushNow();
    const fileName = await api.downloadDocx(locale.value);
    toast.success(m.value.export.ready, { description: fileName });
  } catch (error) {
    toast.error(m.value.export.failed, { description: error instanceof Error ? error.message : String(error) });
  } finally {
    exporting.value = false;
  }
}

function backToGrid(): void {
  void router.push({ name: 'grid' });
}

useShortcuts((event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    paletteOpen.value = !paletteOpen.value;
    return true;
  }
  if (paletteOpen.value || isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key === 'g' || event.key === 'G' || event.key === 'Escape') {
    backToGrid();
    return true;
  }
  if (event.key === 'e' || event.key === 'E') {
    void exportDocx();
    return true;
  }
  return false;
});
</script>

<template>
  <div class="min-h-dvh">
    <FileHeader @search="paletteOpen = true" />
    <main class="mx-auto max-w-4xl px-6 pt-16 pb-24 sm:px-10">
      <motion.div :initial="{ opacity: 0, y: 16 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: duration(0.6), ease: [0.16, 1, 0.3, 1] }">
        <p class="text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">{{ m.recap.endOfSession(today) }}</p>
        <h1 class="mt-3 font-display text-5xl font-medium tracking-tight sm:text-6xl">{{ m.recap.title }}</h1>
        <p class="mt-3 text-lg text-muted-foreground">{{ review.title }}</p>
      </motion.div>

      <dl class="mt-12 grid grid-cols-3 gap-4">
        <motion.div
          v-for="(status, index) in SHOWN"
          :key="status"
          class="rounded-2xl border bg-card p-6 shadow-soft"
          :initial="{ opacity: 0, y: 14 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ duration: duration(0.5), delay: 0.1 + index * 0.08 }"
        >
          <dt class="text-sm font-medium" :class="STATUS_STYLES[status].text">{{ m.status[status].plural }}</dt>
          <dd class="mt-2 font-display text-6xl font-medium" :class="STATUS_STYLES[status].text"><AnimatedNumber :value="counts[status]" :duration-ms="800" /></dd>
        </motion.div>
      </dl>

      <section class="mt-14" aria-labelledby="decisions-title">
        <h2 id="decisions-title" class="font-display text-2xl">{{ m.recap.decisions }}</h2>
        <p v-if="decisions.length === 0" class="mt-4 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {{ m.recap.none }}
        </p>
        <ol v-else class="mt-5 divide-y rounded-2xl border bg-card">
          <motion.li
            v-for="(entry, index) in decisions"
            :key="entry.adrId"
            class="flex flex-wrap items-start gap-x-4 gap-y-1 p-5"
            :initial="{ opacity: 0, x: -8 }"
            :animate="{ opacity: 1, x: 0 }"
            :transition="{ duration: duration(0.35), delay: 0.35 + Math.min(index, 10) * 0.05 }"
          >
            <span class="w-20 pt-0.5 font-mono text-xs text-muted-foreground">{{ entry.adrId }}</span>
            <div class="min-w-0 flex-1">
              <p class="font-display text-lg leading-snug">{{ entry.title }}</p>
              <p v-if="entry.retained.length > 0" class="mt-0.5 text-sm text-muted-foreground">{{ m.recap.retained(entry.retained.join(', ')) }}</p>
              <p v-if="entry.comment" class="mt-1 text-[0.95rem] text-foreground/80">« {{ entry.comment }} »</p>
            </div>
            <StatusBadge :status="entry.status" />
          </motion.li>
        </ol>
      </section>

      <div class="mt-12 flex flex-wrap gap-3">
        <Button size="lg" :disabled="exporting" @click="exportDocx">
          <Loader2 v-if="exporting" class="animate-spin" /><FileDown v-else /> {{ m.recap.export }} <Kbd class="bg-primary-foreground/15 text-primary-foreground">E</Kbd>
        </Button>
        <Button size="lg" variant="outline" @click="backToGrid"><ArrowLeft /> {{ m.recap.back }} <Kbd>G</Kbd></Button>
      </div>
    </main>
    <CommandPalette v-model:open="paletteOpen" @select-adr="(id) => launch({ mode: 'all', at: id })" @launch="launch({ mode: 'pending', fullscreen: true })" />
  </div>
</template>
