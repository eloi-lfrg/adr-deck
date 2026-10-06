import { onBeforeUnmount, onMounted } from 'vue';

export type ShortcutHandler = (event: KeyboardEvent) => boolean | void;

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Registers a window keydown handler in the capture phase, so that it sees the state of overlays
 * (sheet, dialogs) before they react to the same key. Returning true prevents the default action.
 */
export function useShortcuts(handler: ShortcutHandler): void {
  const listener = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing) return;
    if (handler(event) === true) event.preventDefault();
  };
  onMounted(() => window.addEventListener('keydown', listener, { capture: true }));
  onBeforeUnmount(() => window.removeEventListener('keydown', listener, { capture: true }));
}
