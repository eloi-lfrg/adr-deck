<script setup lang="ts">
import type { FileIssues } from '@adr/format';
import { computed, ref } from 'vue';
import { AlertTriangle, ChevronDown } from '@lucide/vue';
import { cn } from '@/lib/utils';
import { formatIssue, useI18n } from '@/i18n';

const props = defineProps<{ issues: FileIssues[] }>();
const open = ref(false);
const { m } = useI18n();

const errorFiles = computed(() => props.issues.filter((entry) => entry.issues.some((issue) => issue.severity === 'error')).length);
const summary = computed(() => {
  const parts: string[] = [];
  if (errorFiles.value > 0) parts.push(m.value.issues.ignored(errorFiles.value));
  const warnings = props.issues.length - errorFiles.value;
  if (warnings > 0) parts.push(m.value.issues.warnings(warnings));
  return parts.join(' · ');
});
</script>

<template>
  <section
    :class="cn('rounded-xl border px-4 py-3 text-sm', errorFiles > 0 ? 'border-status-rejected/40 bg-status-rejected-bg' : 'border-status-deferred/40 bg-status-deferred-bg')"
    :aria-label="m.issues.label"
  >
    <button type="button" class="flex w-full items-center gap-2 text-left" :aria-expanded="open" @click="open = !open">
      <AlertTriangle class="size-4 shrink-0" :class="errorFiles > 0 ? 'text-status-rejected' : 'text-status-deferred'" aria-hidden="true" />
      <span class="flex-1">{{ summary }}</span>
      <ChevronDown class="size-4 shrink-0 transition-transform" :class="open && 'rotate-180'" aria-hidden="true" />
    </button>
    <ul v-if="open" class="mt-3 space-y-2">
      <li v-for="entry in issues" :key="entry.file">
        <p class="font-mono text-xs">{{ entry.file }}</p>
        <ul class="mt-1 space-y-0.5 text-muted-foreground">
          <li v-for="(issue, index) in entry.issues" :key="index">
            <span class="font-mono text-xs">{{ m.issues.line(issue.line) }}</span> —
            <span :class="issue.severity === 'error' && 'text-status-rejected'">{{ formatIssue(issue) }}</span>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>
