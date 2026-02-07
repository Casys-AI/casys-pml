// Generic search locale mapper (provider-agnostic)
// Converts detection { countryCode, languageCode } into a normalized SearchLocale

import { mapLanguageToRegion } from '@casys/core';
import { getDataForSEOLocationCode } from '@casys/core';

export interface SearchLocale {
  countryCode: string;     // ISO-3166-1 alpha-2
  languageCode: string;    // ISO-639-1 lowercase
  region: string;          // derived from languageCode (Google-like region)
  locationCode: number;    // DataForSEO location_code derived from region
}

export function mapDetectionToSearchLocale(d: { countryCode: string; languageCode: string }): SearchLocale {
  if (!d?.countryCode || !d?.languageCode) {
    throw new Error('mapDetectionToSearchLocale: invalid detection payload');
  }
  // region driven by language (keeps compatibility with existing Google/Trends usage)
  const region = mapLanguageToRegion(d.languageCode);
  const locationCode = getDataForSEOLocationCode(region);
  return {
    countryCode: d.countryCode,
    languageCode: d.languageCode,
    region,
    locationCode,
  };
}
