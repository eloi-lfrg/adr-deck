<script setup lang="ts">
import { computed } from 'vue';
import { parseMarkdown } from '@/lib/markdown';

const props = defineProps<{ source: string }>();
const blocks = computed(() => parseMarkdown(props.source));
</script>

<template>
  <div class="space-y-[0.6em]">
    <template v-for="(block, blockIndex) in blocks" :key="blockIndex">
      <p v-if="block.kind === 'paragraph'">
        <template v-for="(inline, index) in block.inlines" :key="index">
          <br v-if="inline.kind === 'break'" />
          <strong v-else-if="inline.kind === 'strong'" class="font-semibold">{{ inline.text }}</strong>
          <em v-else-if="inline.kind === 'em'">{{ inline.text }}</em>
          <code v-else-if="inline.kind === 'code'" class="rounded bg-muted px-1 py-0.5 font-mono text-[0.88em]">{{ inline.text }}</code>
          <a v-else-if="inline.kind === 'link'" :href="inline.href" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-4">{{ inline.text }}</a>
          <template v-else>{{ inline.text }}</template>
        </template>
      </p>
      <component :is="block.ordered ? 'ol' : 'ul'" v-else-if="block.kind === 'list'" :class="block.ordered ? 'list-decimal' : 'list-disc'" class="space-y-1 pl-[1.2em] marker:text-muted-foreground">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
          <template v-for="(inline, index) in item" :key="index">
            <strong v-if="inline.kind === 'strong'" class="font-semibold">{{ inline.text }}</strong>
            <em v-else-if="inline.kind === 'em'">{{ inline.text }}</em>
            <code v-else-if="inline.kind === 'code'" class="rounded bg-muted px-1 py-0.5 font-mono text-[0.88em]">{{ inline.text }}</code>
            <a v-else-if="inline.kind === 'link'" :href="inline.href" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-4">{{ inline.text }}</a>
            <template v-else-if="inline.kind === 'text'">{{ inline.text }}</template>
          </template>
        </li>
      </component>
      <pre v-else-if="block.kind === 'code'" class="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[0.8em]">{{ block.text }}</pre>
    </template>
  </div>
</template>
