import { createLogger } from '../utils/logger';

const logger = createLogger('NewsConfig');

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export interface NewsSourceConfig {
  maxChars: number;
  maxKeywords: number;
  separator: string;
}

export const NEWS_CONFIG: {
  fetchMaxKeywords: number; // nombre de keywords max passés aux fournisseurs
  providers: {
    newsapi: NewsSourceConfig;
    worldnews: NewsSourceConfig;
    newsdata: NewsSourceConfig;
  };
} = {
  fetchMaxKeywords: intFromEnv('NEWS_FETCH_MAX_KEYWORDS', 5),
  providers: {
    newsapi: {
      maxChars: 300,
      maxKeywords: intFromEnv('NEWSAPI_MAX_KEYWORDS', intFromEnv('NEWS_FETCH_MAX_KEYWORDS', 5)),
      separator: ' OR ',
    },
    worldnews: {
      maxChars: 100, // WorldNews: "Text parameter must not be longer than 100 characters"
      maxKeywords: intFromEnv('WORLDNEWS_MAX_KEYWORDS', intFromEnv('NEWS_FETCH_MAX_KEYWORDS', 5)),
      separator: ' OR ',
    },
    newsdata: {
      maxChars: 100, // NewsData: "Query length cannot be greater than 100"
      maxKeywords: intFromEnv('NEWSDATA_MAX_KEYWORDS', 3), // 3 keywords max pour meilleur recall
      separator: ' OR ',
    },
  },
};

try {
  logger.debug('NEWS_CONFIG loaded', NEWS_CONFIG);
} catch (_e) {
  // noop: ne jamais faire échouer l'app si le logger échoue ici
}
