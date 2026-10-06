<script setup lang="ts">
import { MotionConfig } from 'motion-v';
import { RouterView } from 'vue-router';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePreferencesStore } from '@/stores/preferences';
import 'vue-sonner/style.css';

const preferences = usePreferencesStore();
</script>

<template>
  <MotionConfig reduced-motion="user">
    <TooltipProvider :delay-duration="300">
      <RouterView />
      <Toaster
        position="bottom-right"
        :theme="preferences.resolvedTheme === 'dark' ? 'dark' : 'light'"
        rich-colors
        close-button
      />
    </TooltipProvider>
  </MotionConfig>
</template>
