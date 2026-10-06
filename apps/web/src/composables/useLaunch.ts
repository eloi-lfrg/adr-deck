import { nextTick } from 'vue';
import { useRouter, type LocationQueryRaw } from 'vue-router';
import { useFullscreen } from '@vueuse/core';
import { withViewTransition } from '@/lib/viewTransition';

export type ReviewMode = 'pending' | 'decided' | 'all' | 'selection';

export interface LaunchOptions {
  mode: ReviewMode;
  /** Explicit ordered list of ADR IDs (selection mode). */
  ids?: string[];
  /** ADR to start at. */
  at?: string;
  includeDeferred?: boolean;
  fullscreen?: boolean;
  /** Animate with a shared element transition (the element must carry `view-transition-name: adr-stage`). */
  viewTransition?: boolean;
}

/** Modes in display order; their labels are `messages.modes`. */
export const REVIEW_MODES: readonly ReviewMode[] = ['pending', 'decided', 'all', 'selection'];

export function useLaunch(): (options: LaunchOptions) => Promise<void> {
  const router = useRouter();
  const { enter } = useFullscreen();

  return async (options: LaunchOptions) => {
    const query: LocationQueryRaw = { mode: options.mode };
    if (options.ids && options.ids.length > 0) query['ids'] = options.ids.join(',');
    if (options.at) query['at'] = options.at;
    if (options.mode === 'pending') query['reportees'] = options.includeDeferred === false ? '0' : '1';
    const navigate = async (): Promise<void> => {
      await router.push({ name: 'slideshow', query });
      await nextTick();
    };
    if (options.fullscreen) {
      // Must run in the user gesture; a refusal (e.g. iframe policy) simply keeps the window mode.
      await enter().catch(() => undefined);
    }
    if (options.viewTransition) await withViewTransition(navigate);
    else await navigate();
  };
}
