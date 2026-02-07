import { createLogger } from './logger';

const logger = createLogger('DataForSEOLocation');

// Mapping des codes région ISO 3166-1 alpha-2 vers DataForSEO location_code
// Source de référence: https://docs.dataforseo.com/v3/keywords-data-google-trends-locations/
const REGION_TO_DFS_LOCATION_CODE: Record<string, number> = {
  FR: 2250, // France
  US: 2840, // United States
  GB: 2826, // United Kingdom
  DE: 2276, // Germany
  ES: 2724, // Spain
  IT: 2380, // Italy
  CA: 2124, // Canada
  // Ajouter d'autres pays au besoin en se référant à la doc officielle
};

/**
 * Retourne le location_code DataForSEO pour un code région ISO-3166 alpha-2.
 * Fail-fast: lève si région vide.
 * Défaut: FR (2250) si non mappé explicitement.
 */
export function getDataForSEOLocationCode(region: string): number {
  if (!region?.trim()) {
    throw new Error('Region code cannot be empty - must be ISO 3166-1 alpha-2');
  }
  const key = region.toUpperCase();
  const code = REGION_TO_DFS_LOCATION_CODE[key];
  if (typeof code === 'number') return code;
  logger.warn?.(`Unknown region '${region}', defaulting to FR (2250)`);
  return 2250;
}

/**
 * Liste des régions supportées explicitement dans le mapping.
 */
export function getSupportedDataForSEOLocations(): string[] {
  return Object.keys(REGION_TO_DFS_LOCATION_CODE);
}
