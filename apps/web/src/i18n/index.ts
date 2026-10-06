import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { issueMessage, type ParseIssue } from '@adr/format';
import { readStored, writeStored } from '@/lib/storage';
import { en, type Messages } from './en';
import { es } from './es';
import { fr } from './fr';

export const LOCALES = ['en', 'fr', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
/** `auto` follows the browser language. */
export type LanguageChoice = Locale | 'auto';

export type { Messages };

const CATALOGS: Record<Locale, Messages> = { en, fr, es };
const STORAGE_KEY = 'adr-deck:language';
const FALLBACK: Locale = 'en';

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function isLanguageChoice(value: unknown): value is LanguageChoice {
  return typeof value === 'string' && (value === 'auto' || isLocale(value));
}

/** First supported language among the browser preferences (`fr-CA` → `fr`), English otherwise. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0] ?? '';
    if (isLocale(base)) return base;
  }
  return FALLBACK;
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

const storedChoice = readStored<unknown>(STORAGE_KEY, 'auto');
const choice = ref<LanguageChoice>(isLanguageChoice(storedChoice) ? storedChoice : 'auto');
const detected = ref<Locale>(detectLocale(browserLanguages()));

if (typeof window !== 'undefined') {
  // The browser language can change while the app is open.
  window.addEventListener('languagechange', () => {
    detected.value = detectLocale(browserLanguages());
  });
}

const locale = computed<Locale>(() => (choice.value === 'auto' ? detected.value : choice.value));
const messages = computed<Messages>(() => CATALOGS[locale.value]);

watch(choice, (value) => writeStored(STORAGE_KEY, value));
watch(
  locale,
  (value) => {
    if (typeof document !== 'undefined') document.documentElement.lang = value;
  },
  { immediate: true, flush: 'sync' },
);

/** Current messages, usable outside components (stores, API client). */
export function t(): Messages {
  return messages.value;
}

export function setLanguage(value: LanguageChoice): void {
  choice.value = value;
}

/** Cycles automatic → English → French → Spanish. */
export function cycleLanguage(): void {
  const order: LanguageChoice[] = ['auto', ...LOCALES];
  choice.value = order[(order.indexOf(choice.value) + 1) % order.length]!;
}

/** Message of a format issue in the current language. */
export function formatIssue(issue: ParseIssue): string {
  return issueMessage(issue, locale.value);
}

/** Formats a `YYYY-MM-DD` date in the current language (« 5 oct. 2026 », “5 Oct 2026”). */
export function formatDate(date: string | null, style: 'short' | 'long' = 'short'): string {
  if (date === null) return '';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(messages.value.intlLocale, { day: 'numeric', month: style, year: 'numeric', timeZone: 'UTC' }).format(parsed);
}

export interface I18n {
  m: ComputedRef<Messages>;
  locale: ComputedRef<Locale>;
  choice: Ref<LanguageChoice>;
  detected: Ref<Locale>;
}

export function useI18n(): I18n {
  return { m: messages, locale, choice, detected };
}
