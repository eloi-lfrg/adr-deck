import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useColorMode } from '@vueuse/core';
import { readStored, writeStored } from '@/lib/storage';

const KEY = 'adr-decisioner:preferences';

interface StoredPreferences {
  autoAdvance: boolean;
  includeDeferred: boolean;
}

export const usePreferencesStore = defineStore('preferences', () => {
  const stored = readStored<Partial<StoredPreferences>>(KEY, {});
  const autoAdvance = ref(stored.autoAdvance ?? true);
  const includeDeferred = ref(stored.includeDeferred ?? true);
  /** 'auto' follows the system setting. */
  const colorMode = useColorMode({ storageKey: 'adr-decisioner:theme', initialValue: 'dark' });

  watch([autoAdvance, includeDeferred], () => {
    writeStored(KEY, { autoAdvance: autoAdvance.value, includeDeferred: includeDeferred.value } satisfies StoredPreferences);
  });

  function cycleTheme(): void {
    const order = ['auto', 'light', 'dark'] as const;
    const index = order.indexOf(colorMode.store.value as (typeof order)[number]);
    colorMode.store.value = order[(index + 1) % order.length]!;
  }

  return { autoAdvance, includeDeferred, themeChoice: colorMode.store, resolvedTheme: colorMode.state, cycleTheme };
});
