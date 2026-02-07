import Parser from 'rss-parser';

import { type TopicCandidate, type TopicFetchQuery, type TopicSource } from '@casys/core';
import { type TopicDiscoveryPort, type TrendAnalysisOptions } from '@casys/application';

import { createLogger } from '../../../utils/logger';

// Extension du type Parser.Item pour inclure les champs personnalisés
type CustomFeed = Record<string, unknown>;

interface CustomItem extends Omit<Parser.Item, 'categories'> {
  pubDate?: string;
  'content:encoded'?: string;
  'content:encodedSnippet'?: string;
  'dc:creator'?: string;
  'media:content'?: {
    $?: {
      url?: string;
    };
  };
  // Gestion des catégories qui peuvent être soit un tableau de strings, soit un tableau d'objets avec _
  // Le type original de categories dans Parser.Item est string[]
  // On le surcharge pour gérer les cas où c'est un tableau d'objets
  categories?: (string | { _?: string })[];
  language?: string;
  contentSnippet?: string;
  summary?: string;
  creator?: string;
  link?: string;
  title?: string;
  guid?: string;
}

type CustomRSSParser = Parser<CustomFeed, CustomItem>;

export class RssArticleFetcherAdapter implements TopicDiscoveryPort {
  private readonly logger = createLogger('RssArticleFetcherAdapter');
  private parser: CustomRSSParser;
  private sources: Map<string, TopicSource>;

  constructor(initialSources: TopicSource[] = []) {
    this.parser = new Parser();
    this.sources = new Map();
    initialSources.forEach(source => this.addSource(source));
  }

  private extractCategories(item: CustomItem): string[] {
    const raw = item.categories ?? [];
    const names = raw
      .map(c => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object') return (c as { _?: string })._ ?? '';
        return '';
      })
      .filter(Boolean)
      .map(s => s.trim())
      .filter(Boolean);
    // dédupliquer en gardant l'ordre
    return Array.from(new Set(names));
  }

  // Gestion des sources
  addSource(source: TopicSource): void {
    if (!source.id) {
      source.id = `rss-${Date.now()}`;
    }
    if (!source.type) {
      source.type = 'rss';
    }
    this.sources.set(source.id, { ...source, enabled: source.enabled ?? true });
  }

  removeSource(sourceId: string): void {
    this.sources.delete(sourceId);
  }

  updateSource(sourceId: string, updates: Partial<TopicSource>): void {
    const source = this.sources.get(sourceId);
    if (source) {
      this.sources.set(sourceId, { ...source, ...updates });
    }
  }

  listSources(): TopicSource[] {
    return Array.from(this.sources.values());
  }

  getSource(sourceId: string): TopicSource | undefined {
    return this.sources.get(sourceId);
  }

  // Récupération des articles
  async discoverCandidates(
    query: TopicFetchQuery,
    _options?: Partial<TrendAnalysisOptions>
  ): Promise<TopicCandidate[]> {
    // Logs compacts (XP): pas de dump JSON massif
    const sources = this.getFilteredSources(query.sources);
    // Instrumentation compacte pour tracer les mots-clés et les sources actives côté RSS
    try {
      const kws = Array.isArray(query.seoKeywords) ? query.seoKeywords : [];
      this.logger.debug('[RSS] seoKeywords reçus', {
        count: kws.length,
        sample: kws.slice(0, 10),
      });
      this.logger.debug('[RSS] sources actives', {
        count: sources.length,
        ids: sources.map(s => s.id),
      });
    } catch {
      // noop logging safeguard
    }

    const results: TopicCandidate[] = [];

    for (const source of sources) {
      if (source.type !== 'rss' || !source.url) {
        continue;
      }

      try {
        const feed = await this.parser.parseURL(source.url);
        if (feed.items) {
          // Filtrer les articles selon les critères de la requête
          const filteredItems = feed.items
            .slice(0, 50)
            .filter(item => this.filterItem(item, query));

          // Convertir les items filtrés en articles
          const articles = filteredItems
            .map(item => this.parseFeedItem(item, source, query))
            .filter((article): article is TopicCandidate => article !== null);

          results.push(...articles);
        }
      } catch (error) {
        this.logger.error(
          `Error fetching RSS feed ${source.url}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Ne pas logger chaque article, mais seulement le total
    this.logger.log(`${results.length} articles RSS récupérés au total.`);

    const sortedAndLimited = this.sortAndLimit(results, query);
    this.logger.debug(`Returning ${sortedAndLimited.length} candidates`);
    return sortedAndLimited;
  }

  // Méthodes utilitaires
  private getFilteredSources(sourceIds?: string[]): TopicSource[] {
    const sources = Array.from(this.sources.values());
    const active = sources.filter(s => s.enabled !== false);
    // Sémantique: undefined ou tableau vide => toutes les sources activées
    if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
      this.logger.debug(`RSS: ${active.length} source(s) activée(s)`);
      return active;
    }
    // Sinon: filtrer par les IDs explicitement fournis, avec alerte si inconnus
    const availableIds = active.map(s => s.id);
    const unknown = sourceIds.filter(id => !availableIds.includes(id));
    if (unknown.length > 0) {
      this.logger.warn(`RSS: ID(s) inconnus ignorés: ${unknown.join(', ')}`);
    }
    const selected = active.filter(s => sourceIds.includes(s.id));
    this.logger.debug(`RSS: ${selected.length}/${active.length} source(s) sélectionnée(s)`);
    return selected;
  }

  private parseDate(dateStr: string | undefined): Date | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }

  private filterItem(item: CustomItem, query: TopicFetchQuery): boolean {
    // Logs réduits: pas de logs par article/source

    // Filtrer par date
    if (query.since && item.pubDate) {
      const pubDate = this.parseDate(item.pubDate);
      if (pubDate && pubDate < query.since) {
        return false;
      }
    }
    if (query.until && item.pubDate) {
      const pubDate = this.parseDate(item.pubDate);
      if (pubDate && pubDate > query.until) {
        return false;
      }
    }

    // Filtrer par langue si spécifiée
    if (query.language && item.language && item.language !== query.language) {
      return false;
    }

    // Filtrage par keywords SEO enrichis - VERSION ASSOUPLIE
    if (query.seoKeywords && query.seoKeywords.length > 0) {
      const categoriesText = this.extractCategories(item).join(' ');
      const content = `${item.title ?? ''} ${item.contentSnippet ?? ''} ${item.summary ?? ''} ${categoriesText}`;
      const normalizedContent = this.normalizeForSearch(content);

      const matchedKeywords = query.seoKeywords.filter((keyword: string) => {
        const normalizedKeyword = this.normalizeForSearch(keyword);
        const isMatch = this.flexibleKeywordMatch(normalizedContent, normalizedKeyword);
        return isMatch;
      });

      if (matchedKeywords.length === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Normalise le texte pour la recherche : lowercase, supprime accents et ponctuation
   */
  private normalizeForSearch(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
      .replace(/[^a-z0-9\s]/g, ' ') // Remplace ponctuation par espaces
      .replace(/\s+/g, ' ') // Normalise les espaces
      .trim();
  }

  /**
   * Recherche flexible multilingue de mots-clés
   */
  private flexibleKeywordMatch(content: string, keyword: string): boolean {
    // 1. Match exact
    if (content.includes(keyword)) {
      return true;
    }

    // 2. Match par mots individuels avec techniques universelles
    const keywordWords = keyword.split(' ').filter(w => w.length > 2);
    const contentWords = content.split(' ');

    return keywordWords.some(kw => {
      return contentWords.some(cw => {
        // Match exact de mot
        if (cw === kw) return true;

        // Approches universelles (toutes langues)
        return this.universalWordMatch(cw, kw);
      });
    });
  }

  /**
   * Match universel de mots (FR/EN/toutes langues)
   */
  private universalWordMatch(contentWord: string, keyword: string): boolean {
    // Ignorer mots trop courts
    if (contentWord.length < 3 || keyword.length < 3) return false;

    // 1. Préfixe commun (min 4 chars) - "construct" match "construction"
    if (contentWord.length >= 4 && keyword.length >= 4) {
      const minLen = Math.min(contentWord.length, keyword.length);
      const prefixLen = Math.floor(minLen * 0.75); // 75% du mot le plus court

      if (prefixLen >= 4 && contentWord.slice(0, prefixLen) === keyword.slice(0, prefixLen)) {
        return true;
      }
    }

    // 2. Inclusion bidirectionnelle - "ai" dans "artificial" ou "artificial" dans "ai-powered"
    if (
      (contentWord.length >= 5 && contentWord.includes(keyword)) ||
      (keyword.length >= 5 && keyword.includes(contentWord))
    ) {
      return true;
    }

    // 3. Distance de Levenshtein pour typos et variantes proches
    const distance = this.levenshteinDistance(contentWord, keyword);
    const maxLen = Math.max(contentWord.length, keyword.length);
    const threshold = Math.floor(maxLen * 0.25); // 25% de différence autorisée

    return distance <= Math.max(1, threshold);
  }

  /**
   * Calcule la distance de Levenshtein (insertion/suppression/substitution)
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
      Array<number>(b.length + 1).fill(0)
    );

    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // suppression
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[a.length][b.length];
  }

  private parseFeedItem(
    item: CustomItem,
    source: TopicSource,
    query: TopicFetchQuery
  ): TopicCandidate | null {
    try {
      // Vérifier les champs obligatoires
      if (!item.link) {
        throw new Error(`Article ignoré: champ 'link' manquant`);
      }

      if (!item.title) {
        throw new Error(`Article ignoré: champ 'title' manquant`);
      }

      const publishedAt = this.parseDate(item.pubDate);
      if (!publishedAt) {
        throw new Error(
          `Article '${item.title}' ignoré: impossible de déterminer la date de publication`
        );
      }

      // Construire l'objet article avec les champs requis
      const img = this.extractImageUrl(item);
      const categories = this.extractCategories(item);
      return {
        id: item.guid ?? `rss-${item.link}`,
        title: item.title,
        description: item.summary ?? item.contentSnippet ?? '',
        sourceUrl: item.link,
        sourceTitle: source.name ?? 'Source inconnue',
        publishedAt: publishedAt,
        author: item['dc:creator'] ?? item.creator ?? source.name,
        imageUrls: img ? [img] : [],
        language: query.language, // Pas de fallback - fail-fast
        categories: categories,
        metadata: {
          sourceType: 'rss',
          sourceId: source.id ?? 'unknown',
          originalSource: source.url ?? item.link,
          content: item['content:encoded'] ?? item.contentSnippet ?? item.summary ?? '',
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erreur inconnue lors du parsing de l'article";
      this.logger.warn(`[RSS] ${errorMessage}`);
      return null;
    }
  }

  private extractImageUrl(item: CustomItem): string | undefined {
    if (item['media:content']?.$?.url) {
      return item['media:content'].$.url;
    }

    // Essayer d'extraire une image du contenu HTML
    const content = item['content:encoded'] ?? item.contentSnippet ?? '';
    const imgMatch = /<img[^>]+src="([^">]+)"/.exec(content);
    return imgMatch ? imgMatch[1] : undefined;
  }

  private sortAndLimit(articles: TopicCandidate[], query: TopicFetchQuery): TopicCandidate[] {
    // Trier par date de publication (du plus récent au plus ancien)
    const sorted = [...articles].sort((a, b) => {
      const dateA = new Date(a.publishedAt).getTime();
      const dateB = new Date(b.publishedAt).getTime();
      return dateB - dateA;
    });

    // Limiter le nombre de résultats si nécessaire
    return query.limit ? sorted.slice(0, query.limit) : sorted;
  }
}
