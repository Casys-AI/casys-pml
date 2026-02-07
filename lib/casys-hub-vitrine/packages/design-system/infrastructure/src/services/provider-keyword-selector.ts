import { NEWS_CONFIG } from '../config/news.config';
import { createLogger } from '../utils/logger';

export type ProviderKey = keyof typeof NEWS_CONFIG.providers;

export interface ProviderQueryResult {
  keywords: string[];
  query: string; // chaîne prête à être utilisée dans la requête provider
}

const logger = createLogger('ProviderKeywordSelector');

/**
 * Service d'infrastructure pour sélectionner les mots-clés à passer aux providers
 * en respectant leurs contraintes (count + budget caractères + séparateur).
 *
 * Hypothèse: rankedKeywords est déjà trié par priorité métier (fail-fast sinon).
 */
export class ProviderKeywordSelector {
  select(provider: ProviderKey, rankedKeywords: string[] | undefined): ProviderQueryResult {
    if (!rankedKeywords || rankedKeywords.length === 0) {
      throw new Error('[ProviderKeywordSelector] rankedKeywords requis (>0)');
    }

    const cfg = NEWS_CONFIG.providers[provider];
    if (!cfg) throw new Error(`[ProviderKeywordSelector] Provider inconnu: ${provider}`);

    const sep = cfg.separator;
    const maxKw = Math.max(1, Math.min(NEWS_CONFIG.fetchMaxKeywords, cfg.maxKeywords));
    const acc: string[] = [];

    for (const kw of rankedKeywords) {
      if (acc.length >= maxKw) break;
      const proposal = [...acc, kw];
      const joined = proposal.join(sep);
      if (joined.length <= cfg.maxChars) {
        acc.push(kw);
      } else {
        // tenter une version tronquée du kw actuel si rien n'a encore été retenu
        if (acc.length === 0) {
          const room = Math.max(1, cfg.maxChars);
          // garder au moins 1 char utile
          const trimmed = kw.slice(0, room);
          if (trimmed.length > 0) acc.push(trimmed);
        }
        break;
      }
    }

    if (acc.length === 0) {
      // fallback ultra conservatif (fail-soft) pour ne pas casser l'appel provider
      const first = rankedKeywords[0] ?? '';
      const trimmed = first.slice(0, Math.max(1, cfg.maxChars));
      if (trimmed.length === 0) {
        throw new Error('[ProviderKeywordSelector] Impossible de construire une requête non vide');
      }
      acc.push(trimmed);
    }

    // Pour NewsData et NewsAPI: appliquer une stratégie robuste
    // - Sanitiser les tokens (retirer les numériques et tokens courts)
    // - Protéger les multi-mots avec guillemets
    // - Parenthéser chaque bloc et joindre avec OR
    // - Respecter maxChars avec réduction progressive et troncature interne
    let query: string;
    const buildProtectedOrQuery = (list: string[], maxChars: number) => {
      const sanitizeTerm = (term: string): string => {
        const tokens = term
          .split(/\s+/)
          .map(t => t.trim())
          .filter(Boolean);
        // Conserver acronymes MAJUSCULES (2-6) et mots significatifs (>=4), retirer tokens avec chiffres
        const isAcronym = (t: string) => /^[A-Z]{2,6}$/.test(t);
        const filtered = tokens
          .filter(t => !/[0-9]/.test(t))
          .filter(t => t.length >= 4 || isAcronym(t));
        const kept = (filtered.length ? filtered : tokens.filter(t => t.length >= 3)).slice(0, 3);
        return kept.join(' ');
      };

      const protectedBlocks: string[] = list
        .map(k => sanitizeTerm(k.trim()))
        .filter(s => s.length > 0)
        .map(s => (s.includes(' ') ? `("${s}")` : `(${s})`));

      let joined = protectedBlocks.join(' OR ');
      while (joined.length > maxChars && protectedBlocks.length > 1) {
        protectedBlocks.pop();
        joined = protectedBlocks.join(' OR ');
      }
      if (joined.length > maxChars && protectedBlocks.length === 1) {
        const block = protectedBlocks[0];
        const isQuoted = block.startsWith('("');
        const wrapper = isQuoted ? ['("', '")'] : ['(', ')'];
        const overhead = wrapper[0].length + wrapper[1].length;
        const budget = Math.max(1, maxChars - overhead);
        const inner = block.slice(wrapper[0].length, block.length - wrapper[1].length);
        const trimmedInner = inner.slice(0, budget);
        return `${wrapper[0]}${trimmedInner}${wrapper[1]}`;
      }
      if (protectedBlocks.length === 0) {
        // Fallback ultra conservatif
        const first = (list[0] ?? '').trim();
        const base = first.includes(' ') ? `("${first}")` : `(${first})`;
        return base.slice(0, Math.max(2, maxChars));
      }
      return joined;
    };

    if (provider === 'newsdata' || provider === 'newsapi') {
      query = buildProtectedOrQuery(acc, cfg.maxChars);
    } else {
      // Providers sans exigences particulières: logique existante
      query = acc.join(sep);
    }
    try {
      logger.debug('Selection', { provider, acc, query, cfg, fetchMax: NEWS_CONFIG.fetchMaxKeywords });
    } catch (_e) {
      // noop
    }
    return { keywords: acc, query };
  }
}
