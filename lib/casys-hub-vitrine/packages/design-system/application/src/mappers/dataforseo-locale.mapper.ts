// DataForSEO-specific bridge from generic SearchLocale to provider params

import type { SearchLocale } from './search-locale.mapper';

export interface DataForSEOParams {
  location_code: number;
  language_code: string;
};

export function mapSearchLocaleToDataForSEOParams(locale: SearchLocale): DataForSEOParams {
  if (!locale) throw new Error('mapSearchLocaleToDataForSEOParams: missing locale');
  return {
    location_code: locale.locationCode,
    language_code: locale.languageCode,
  };
}
