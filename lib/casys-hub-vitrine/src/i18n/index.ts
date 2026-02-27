// ============================================================
// Centralized i18n system for Casys Hub Vitrine
// Usage:
//   import { useTranslations } from '../../i18n';
//   const locale = (Astro as any).currentLocale ?? 'en';
//   const t = useTranslations(locale);
// ============================================================

import { en } from './en';
import { fr } from './fr';
import { zh } from './zh';
import { zh_TW } from './zh-TW';

/** The full translation shape, derived from the English source of truth */
export type Translations = typeof en;

const locales: Record<string, Translations> = { en, fr, zh, 'zh-TW': zh_TW };

/**
 * Returns typed translations for the given locale.
 * Falls back to English if the locale is unknown.
 */
export function useTranslations(locale: string): Translations {
  return locales[locale] ?? en;
}

export { en, fr, zh, zh_TW };
