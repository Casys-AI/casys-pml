// Language/Region mapping utils - no logger to keep this module pure

/**
 * Mapping des codes de langue vers les codes de région
 * Utilisé pour Google Trends, Google Search, News APIs, etc.
 */
const LANGUAGE_TO_REGION_MAP: Record<string, string> = {
  'fr': 'FR',
  'en': 'US', 
  'es': 'ES',
  'de': 'DE',
  'it': 'IT',
  'pt': 'BR',
  'ru': 'RU',
  'ja': 'JP',
  'ko': 'KR',
  'zh': 'CN',
  'ar': 'SA',
  'nl': 'NL',
  'sv': 'SE',
  'da': 'DK',
  'no': 'NO',
  'fi': 'FI',
  'pl': 'PL',
  'tr': 'TR',
  'uk': 'UA',
  'cs': 'CZ',
  'hu': 'HU',
  'ro': 'RO',
  'bg': 'BG',
  'hr': 'HR',
  'sk': 'SK',
  'sl': 'SI',
  'et': 'EE',
  'lv': 'LV',
  'lt': 'LT',
};

/**
 * Mapping des codes de langue vers les codes de région pour les APIs news
 * Certaines APIs utilisent des codes différents
 */
const LANGUAGE_TO_NEWS_REGION_MAP: Record<string, string> = {
  'fr': 'fr',
  'en': 'us', 
  'es': 'es',
  'de': 'de',
  'it': 'it',
  'pt': 'br',
  'ru': 'ru',
  'ja': 'jp',
  'ko': 'kr',
  'zh': 'cn',
  'ar': 'sa',
  'nl': 'nl',
  'sv': 'se',
  'da': 'dk',
  'no': 'no',
  'fi': 'fi',
  'pl': 'pl',
  'tr': 'tr',
  'uk': 'ua',
  'cs': 'cz',
  'hu': 'hu',
  'ro': 'ro',
  'bg': 'bg',
  'hr': 'hr',
  'sk': 'sk',
  'sl': 'si',
  'et': 'ee',
  'lv': 'lv',
  'lt': 'lt',
};

/**
 * Mapping des codes de langue vers les noms complets de pays (pour Tavily Search API)
 * Format requis: nom complet en minuscules (ex: "france", "united states")
 */
const LANGUAGE_TO_COUNTRY_NAME_MAP: Record<string, string> = {
  'fr': 'france',
  'en': 'united states',
  'es': 'spain',
  'de': 'germany',
  'it': 'italy',
  'pt': 'brazil',
  'ru': 'russia',
  'ja': 'japan',
  'ko': 'south korea',
  'zh': 'china',
  'ar': 'saudi arabia',
  'nl': 'netherlands',
  'sv': 'sweden',
  'da': 'denmark',
  'no': 'norway',
  'fi': 'finland',
  'pl': 'poland',
  'tr': 'turkey',
  'uk': 'ukraine',
  'cs': 'czech republic',
  'hu': 'hungary',
  'ro': 'romania',
  'bg': 'bulgaria',
  'hr': 'croatia',
  'sk': 'slovakia',
  'sl': 'slovenia',
  'et': 'estonia',
  'lv': 'latvia',
  'lt': 'lithuania',
};

/**
 * Mappe une langue vers une région pour les APIs Google (Trends, Search)
 * @param language Code de langue ISO 639-1 (ex: 'fr', 'en', 'es')
 * @returns Code de région (ex: 'FR', 'US', 'ES')
 * @throws Error si la langue n'est pas supportée (fail-fast XP)
 */
export function mapLanguageToRegion(language: string): string {
  // Fail-fast validation
  if (!language?.trim()) {
    throw new Error('Language code cannot be empty - should come from config');
  }

  const region = LANGUAGE_TO_REGION_MAP[language.toLowerCase()];
  if (!region) {
    throw new Error(`Unsupported language: ${language} - check supported languages: ${getSupportedLanguages().join(', ')}`);
  }

  return region;
}

/**
 * Mappe une langue vers un code langue ISO 639-1 (lower-case) pour les APIs news
 * Exemple d'usage: World News API (paramètre `language`)
 * @param language Code de langue ISO 639-1 (ex: 'fr', 'en')
 * @returns Code langue en minuscules (ex: 'fr', 'en')
 * @throws Error si la langue n'est pas supportée (fail-fast XP)
 */
export function mapLanguageToNewsLanguage(language: string): string {
  if (!language?.trim()) {
    throw new Error('Language code cannot be empty - should come from config');
  }

  const lang = language.toLowerCase();
  if (!isLanguageSupported(lang)) {
    throw new Error(
      `Unsupported language for news language param: ${language} - check supported languages: ${getSupportedLanguages().join(', ')}`
    );
  }
  return lang;
}

/**
 * Mappe une langue vers une région pour les APIs de news
 * @param language Code de langue ISO 639-1 (ex: 'fr', 'en', 'es')
 * @returns Code de région en minuscules (ex: 'fr', 'us', 'es')
 * @throws Error si la langue n'est pas supportée (fail-fast XP)
 */
export function mapLanguageToNewsRegion(language: string): string {
  // Fail-fast validation
  if (!language?.trim()) {
    throw new Error('Language code cannot be empty - should come from config');
  }

  const region = LANGUAGE_TO_NEWS_REGION_MAP[language.toLowerCase()];
  if (!region) {
    throw new Error(`Unsupported language for news: ${language} - check supported languages: ${getSupportedLanguages().join(', ')}`);
  }

  return region;
}

/**
 * Obtient la liste des langues supportées
 * @returns Array des codes de langue supportés
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(LANGUAGE_TO_REGION_MAP);
}

/**
 * Mappe une langue vers un nom de pays complet (pour Tavily Search API)
 * @param language Code de langue ISO 639-1 (ex: 'fr', 'en', 'es')
 * @returns Nom de pays en minuscules (ex: 'france', 'united states', 'spain')
 * @throws Error si la langue n'est pas supportée (fail-fast XP)
 */
export function mapLanguageToCountryName(language: string): string {
  // Fail-fast validation
  if (!language?.trim()) {
    throw new Error('Language code cannot be empty - should come from config');
  }

  const countryName = LANGUAGE_TO_COUNTRY_NAME_MAP[language.toLowerCase()];
  if (!countryName) {
    throw new Error(`Unsupported language for country name: ${language} - check supported languages: ${getSupportedLanguages().join(', ')}`);
  }

  return countryName;
}

/**
 * Vérifie si une langue est supportée
 * @param language Code de langue à vérifier
 * @returns true si la langue est supportée
 */
export function isLanguageSupported(language: string): boolean {
  if (!language?.trim()) return false;
  return language.toLowerCase() in LANGUAGE_TO_REGION_MAP;
}

/**
 * Mapping des codes de région vers les TLD (Top Level Domain) pour les recherches web
 * Utilisé pour Google Search avec opérateur site:
 */
const REGION_TO_TLD_MAP: Record<string, string> = {
  'FR': '.fr',
  'US': '.com',
  'ES': '.es',
  'DE': '.de',
  'IT': '.it',
  'BR': '.com.br',
  'RU': '.ru',
  'JP': '.jp',
  'KR': '.kr',
  'CN': '.cn',
  'SA': '.sa',
  'NL': '.nl',
  'SE': '.se',
  'DK': '.dk',
  'NO': '.no',
  'FI': '.fi',
  'PL': '.pl',
  'TR': '.tr',
  'UA': '.ua',
  'CZ': '.cz',
  'HU': '.hu',
  'RO': '.ro',
  'BG': '.bg',
  'HR': '.hr',
  'SK': '.sk',
  'SI': '.si',
  'EE': '.ee',
  'LV': '.lv',
  'LT': '.lt',
  'GB': '.co.uk',
  'CA': '.ca',
  'AU': '.com.au',
  'IN': '.in'
};

/**
 * Mappe une langue vers un TLD (Top Level Domain) pour les recherches web
 * Utile pour l'opérateur Google Search `site:.fr`
 * @param language Code de langue ISO 639-1 (ex: 'fr', 'en', 'es')
 * @returns TLD (ex: '.fr', '.com', '.es')
 * @throws Error si la langue n'est pas supportée (fail-fast XP)
 */
export function mapLanguageToTld(language: string): string {
  // Fail-fast validation
  if (!language?.trim()) {
    throw new Error('Language code cannot be empty - should come from config');
  }

  // Get region first, then map to TLD
  const region = mapLanguageToRegion(language);
  const tld = REGION_TO_TLD_MAP[region];

  if (!tld) {
    throw new Error(`No TLD mapping for region: ${region} (from language: ${language})`);
  }

  return tld;
}

/**
 * Mappe un code pays vers une langue (inverse de mapLanguageToRegion)
 * Utilisé comme fallback quand la balise lang HTML n'est pas présente
 * @param countryCode Code pays ISO 3166-1 alpha-2 (ex: 'FR', 'US', 'ES')
 * @returns Code de langue ISO 639-1 (ex: 'fr', 'en', 'es') ou undefined si pas de mapping
 */
export function mapCountryToLanguage(countryCode: string): string | undefined {
  if (!countryCode?.trim()) {
    return undefined;
  }

  // Inverse map: chercher la langue qui correspond à ce pays
  const upperCountry = countryCode.toUpperCase();
  for (const [lang, region] of Object.entries(LANGUAGE_TO_REGION_MAP)) {
    if (region === upperCountry) {
      return lang;
    }
  }

  // Fallback commun pour les pays sans mapping direct
  const commonFallbacks: Record<string, string> = {
    'BE': 'fr',  // Belgique → français (priorité)
    'CH': 'fr',  // Suisse → français (priorité)
    'CA': 'en',  // Canada → anglais (priorité)
    'LU': 'fr',  // Luxembourg → français
    'IE': 'en',  // Irlande → anglais
  };

  return commonFallbacks[upperCountry];
}

/**
 * Mapping TLD → Code pays ISO 3166-1 alpha-2
 * Utilisé pour détecter la langue d'un site via son extension de domaine
 */
const TLD_TO_COUNTRY_MAP: Record<string, string> = {
  'fr': 'FR',
  'es': 'ES',
  'de': 'DE',
  'it': 'IT',
  'pt': 'PT',
  'br': 'BR',
  'ru': 'RU',
  'jp': 'JP',
  'kr': 'KR',
  'cn': 'CN',
  'nl': 'NL',
  'se': 'SE',
  'dk': 'DK',
  'no': 'NO',
  'fi': 'FI',
  'pl': 'PL',
  'tr': 'TR',
  'ua': 'UA',
  'cz': 'CZ',
  'hu': 'HU',
  'ro': 'RO',
  'bg': 'BG',
  'hr': 'HR',
  'sk': 'SK',
  'si': 'SI',
  'ee': 'EE',
  'lv': 'LV',
  'lt': 'LT',
  'uk': 'GB',
  'co.uk': 'GB',
  'ca': 'CA',
  'au': 'AU',
  'com.au': 'AU',
  'in': 'IN',
  'mx': 'MX',
  'ar': 'AR',
  'cl': 'CL',
  'co': 'CO',
  'be': 'BE',
  'ch': 'CH',
  'at': 'AT',
  'lu': 'LU',
  'ie': 'IE',
};

/**
 * Extrait le TLD d'un domaine et le mappe vers un code pays
 * @param domain Nom de domaine (ex: 'example.fr', 'www.example.co.uk')
 * @returns Code pays ISO 3166-1 alpha-2 (ex: 'FR', 'GB') ou undefined si TLD générique/non mappé
 */
export function mapTldToCountry(domain: string): string | undefined {
  if (!domain?.trim()) {
    return undefined;
  }

  // Nettoyer le domaine (enlever protocol, www, path)
  const clean = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .toLowerCase();

  // Extraire TLD (supporter multi-level TLDs comme .co.uk)
  const parts = clean.split('.');
  if (parts.length < 2) {
    return undefined;
  }

  // Tester d'abord multi-level TLD (ex: .co.uk)
  if (parts.length >= 3) {
    const multiTld = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    const country = TLD_TO_COUNTRY_MAP[multiTld];
    if (country) {
      return country;
    }
  }

  // Puis TLD simple
  const tld = parts[parts.length - 1];
  return TLD_TO_COUNTRY_MAP[tld];
}
