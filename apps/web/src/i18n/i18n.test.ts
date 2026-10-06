import { afterEach, describe, expect, it } from 'vitest';
import { makeIssue } from '@adr/format';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { cycleLanguage, detectLocale, formatDate, formatIssue, setLanguage, t, useI18n } from './index';

afterEach(() => setLanguage('auto'));

/** Every leaf of a catalog, as `path` → kind, to compare catalog shapes. */
function shape(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [`${path}:function`];
  if (typeof value === 'string') return [`${path}:string`];
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([key, child]) => shape(child, `${path}.${key}`));
  return [`${path}:${typeof value}`];
}

describe('i18n', () => {
  it('detects the first supported browser language', () => {
    expect(detectLocale(['fr-CA', 'en'])).toBe('fr');
    expect(detectLocale(['de-DE', 'es-MX', 'fr'])).toBe('es');
    expect(detectLocale(['de-DE'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('has the same keys in every catalog', () => {
    expect(shape(fr)).toEqual(shape(en));
    expect(shape(es)).toEqual(shape(en));
  });

  it('switches language and cycles through automatic, English, French and Spanish', () => {
    const { choice, locale } = useI18n();
    setLanguage('es');
    expect(locale.value).toBe('es');
    expect(t().decision.accept).toBe('Aceptar');
    expect(document.documentElement.lang).toBe('es');
    setLanguage('auto');
    cycleLanguage();
    expect(choice.value).toBe('en');
    cycleLanguage();
    cycleLanguage();
    expect(choice.value).toBe('es');
    cycleLanguage();
    expect(choice.value).toBe('auto');
  });

  it('formats dates and format issues in the current language', () => {
    setLanguage('fr');
    expect(formatDate('2026-10-05')).toBe('5 oct. 2026');
    expect(formatIssue(makeIssue(1, 'error', 'missingTitle'))).toBe('Titre « # … » introuvable.');
    setLanguage('en');
    expect(formatDate('2026-10-05', 'long')).toBe('5 October 2026');
    expect(formatIssue(makeIssue(1, 'error', 'missingTitle'))).toBe('Missing "# …" title.');
    setLanguage('es');
    expect(formatIssue(makeIssue(1, 'error', 'missingTitle'))).toBe('Falta el título «# …».');
  });
});
