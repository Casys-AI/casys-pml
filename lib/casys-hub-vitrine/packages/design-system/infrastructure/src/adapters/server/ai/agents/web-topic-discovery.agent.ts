import { Tool } from '@langchain/core/tools';
import { TavilySearch } from '@langchain/tavily';

import { mapLanguageToCountryName } from '@casys/core';
import type { AITextModelPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';
import { QualifiedWebSearchResponseSchema } from '../schemas/agent-responses.schema';

/**
 * Résultat brut de recherche web avant transformation
 */
export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate?: string | null; // AI peut retourner null
  source?: string | null;
  score?: number;
}

/**
 * Options de configuration pour l'agent web
 */
export interface WebTopicDiscoveryOptions {
  tavilyApiKey?: string;
  maxResults?: number;
  minScore?: number;
}

/**
 * Agent IA pour découverte intelligente de topics via recherche web
 * Utilise Tavily pour la recherche et l'IA pour qualifier les résultats
 */
export class WebTopicDiscoveryAgent extends Tool {
  name = 'web_topic_discovery';
  description = 'Découvre des topics pertinents via recherche web intelligente. Input: {keywords, language}. Output: topics qualifiés.';

  private readonly logger = createLogger(WebTopicDiscoveryAgent.name);
  private aiTextModel: AITextModelPort;
  private webSearchTool?: TavilySearch;
  private options: WebTopicDiscoveryOptions;

  constructor(
    aiTextModel: AITextModelPort,
    options: WebTopicDiscoveryOptions = {}
  ) {
    super();
    this.aiTextModel = aiTextModel;
    this.options = {
      maxResults: 20,
      minScore: 0.6,
      ...options
    };

    // Initialiser Tavily si clé API disponible
    if (this.options.tavilyApiKey) {
      this.webSearchTool = new TavilySearch({
        maxResults: this.options.maxResults,
        tavilyApiKey: this.options.tavilyApiKey,
      });
      this.logger.debug('WebTopicDiscoveryAgent: Tavily Search activé');
    } else {
      this.logger.warn('WebTopicDiscoveryAgent: Aucune clé Tavily - fonctionnement en mode offline');
    }
  }

  protected async _call(input: string): Promise<string> {
    this.logger.debug('WebTopicDiscoveryAgent appelé pour découverte de topics');

    try {
      // Parser l'input JSON
      const request = JSON.parse(input);
      const { keywords, language = 'en' } = request;

      // Log INPUT
      this.logger.debug('WebTopicDiscoveryAgent INPUT:', {
        keywords: Array.isArray(keywords) ? keywords : [],
        language
      });

      if (!Array.isArray(keywords) || keywords.length === 0) {
        throw new Error('Keywords requis et non-vides');
      }

      // Recherche web avec qualification IA
      const webResults = await this.searchAndQualifyTopics(keywords, language);

      // Log OUTPUT
      this.logger.debug('WebTopicDiscoveryAgent OUTPUT:', {
        success: true,
        resultsCount: webResults.length,
        results: webResults.map(r => ({ title: r.title, url: r.url, score: r.score, publishedDate: r.publishedDate }))
      });

      return JSON.stringify({
        success: true,
        results: webResults,
        count: webResults.length
      });

    } catch (error) {
      this.logger.error('Erreur dans WebTopicDiscoveryAgent:', error);

      // Log ERROR OUTPUT
      this.logger.debug('WebTopicDiscoveryAgent OUTPUT (error):', {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      });

      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        results: []
      });
    }
  }

  /**
   * Recherche et qualifie les topics via web + IA
   */
  async searchAndQualifyTopics(
    keywords: string[],
    language: string
  ): Promise<WebSearchResult[]> {
    if (!this.webSearchTool) {
      this.logger.warn('Pas de recherche web disponible - retour résultats vides');
      return [];
    }

    const qualifiedResults: WebSearchResult[] = [];

    // Recherche pour chaque keyword (fail-fast: pas de try-catch)
    for (const keyword of keywords) {
      const searchResults = await this.performWebSearch(keyword, language);
      const qualified = await this.qualifyResults(searchResults, keyword);
      qualifiedResults.push(...qualified);
    }

    // Déduplication et tri par score
    return this.deduplicateAndSort(qualifiedResults);
  }

  /**
   * Effectue la recherche web généraliste
   */
  private async performWebSearch(
    keyword: string,
    language: string
  ): Promise<unknown[]> {
    if (!this.webSearchTool) return [];

    const searchQueries = this.buildSearchQueries(keyword, language);

    const allResults: unknown[] = [];

    // Recherche généraliste avec focus sur le récent
    for (const query of searchQueries) {
      try {
        this.logger.debug(`Recherche web pour: "${query}" (lang: ${language})`);

        // Mapper la langue vers le pays pour Tavily (nom complet en minuscules)
        let country: string | undefined;
        try {
          country = mapLanguageToCountryName(language);
          this.logger.debug(`Tavily country filter: ${country}`);
        } catch {
          // Si langue non supportée, pas de filtrage pays (fallback anglais)
          this.logger.debug(`Tavily country filter: none (language '${language}' not mapped)`);
        }

        // Tavily options: topic="news" + days pour récence + country pour cibler la langue
        const result = await this.webSearchTool.invoke({
          query,
          topic: "news" as const,  // Focus sur actualités
          days: 30,  // Articles des 30 derniers jours
          ...(country ? { country } : {})  // Cibler le pays (ex: "france")
        });

        // Debug: log le format de retour
        this.logger.debug('Tavily result format:', {
          type: typeof result,
          isArray: Array.isArray(result),
          keys: result && typeof result === 'object' ? Object.keys(result) : null,
          sampleLength: Array.isArray(result) ? result.length : (result && typeof result === 'object' && 'results' in result && Array.isArray(result.results)) ? result.results.length : 'N/A'
        });

        if (Array.isArray(result)) {
          this.logger.debug(`📦 Tavily résultats bruts (array):`, result.slice(0, 2));
          allResults.push(...result);
        } else if (result && typeof result === 'object') {
          // Format LangChain standard: { results: [...] }
          if ('results' in result && Array.isArray(result.results)) {
            this.logger.debug(`Tavily retourné ${result.results.length} résultats via objet.results`);
            this.logger.debug(`📦 Tavily résultats bruts (échantillon):`, result.results.slice(0, 2).map((r: any) => ({
              title: r.title,
              url: r.url,
              content: r.content?.substring(0, 100),
              publishedDate: r.publishedDate || r.published_date || 'N/A',
              score: r.score
            })));
            allResults.push(...result.results);
          } else {
            // Fallback: objet unique
            this.logger.debug(`📦 Tavily résultat brut (objet unique):`, result);
            allResults.push(result);
          }
        } else if (typeof result === 'string') {
          // Tavily peut retourner du JSON stringifié
          try {
            const parsed = JSON.parse(result);
            if (Array.isArray(parsed)) {
              allResults.push(...parsed);
            } else if (parsed && typeof parsed === 'object' && 'results' in parsed) {
              allResults.push(...parsed.results);
            }
          } catch {
            // Ignorer si pas du JSON valide
          }
        }
      } catch (error) {
        this.logger.warn(`Erreur recherche pour query "${query}":`, error);
      }
    }

    return allResults;
  }

  /**
   * Construit les requêtes de recherche généralistes
   * Utilise directement les supportingQueries de l'analyse SEO
   */
  private buildSearchQueries(keyword: string, _language: string): string[] {
    // Utiliser directement le keyword (qui vient des supportingQueries SEO)
    // Note: La langue est gérée indirectement via Tavily (topic="news" + days=30)
    // Les questions sont déjà dans la langue cible (ex: "Quelles sont...")
    return [keyword];
  }

  /**
   * Qualifie les résultats via IA pour pertinence et qualité
   */
  private async qualifyResults(results: any[], keyword: string): Promise<WebSearchResult[]> {
    if (results.length === 0) return [];

    const prompt = `
Analyse ces résultats de recherche web pour le mot-clé "${keyword}".
Qualifie chaque résultat avec un score de pertinence (0-1) et extrais les informations clés.

Critères de qualité:
- Pertinence au mot-clé
- Fraîcheur du contenu
- Autorité de la source
- Richesse informative

Résultats à analyser:
${JSON.stringify(results.slice(0, 10), null, 2)}

Retourne un JSON avec cette structure:
{
  "qualified": [
    {
      "title": "titre extrait",
      "url": "url",
      "content": "résumé du contenu pertinent",
      "publishedDate": "date si disponible",
      "source": "nom de la source",
      "score": 0.85
    }
  ]
}
`;

    // Fail-fast: validation avec Zod, on veut savoir quand l'IA échoue
    const aiResponse = await this.aiTextModel.generateText(prompt);

    // Parse et valide avec Zod (throw si invalide)
    const validatedResponse = QualifiedWebSearchResponseSchema.parse(JSON.parse(aiResponse));

    this.logger.debug(`🤖 IA a qualifié ${validatedResponse.qualified.length} résultats`);
    if (validatedResponse.qualified.length > 0) {
      this.logger.debug('📊 Scores IA:', validatedResponse.qualified.map(r => ({
        title: r.title.substring(0, 50),
        score: r.score
      })));
    }

    // Filtre par score minimum
    const filtered = validatedResponse.qualified.filter(result =>
      result.score >= this.options.minScore!
    );

    this.logger.debug(`✅ Après filtrage (minScore=${this.options.minScore}): ${filtered.length} résultats`);

    return filtered;
  }

  /**
   * Extrait le nom de la source depuis l'URL
   */
  private extractSourceFromUrl(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  /**
   * Déduplique et trie les résultats par score
   */
  private deduplicateAndSort(results: WebSearchResult[]): WebSearchResult[] {
    const urlSet = new Set<string>();
    const unique = results.filter(result => {
      if (urlSet.has(result.url)) {
        return false;
      }
      urlSet.add(result.url);
      return true;
    });

    return unique
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, this.options.maxResults);
  }
}

/**
 * Factory pour créer l'agent web topic discovery
 */
export function createWebTopicDiscoveryAgent(
  aiTextModel: AITextModelPort,
  options?: WebTopicDiscoveryOptions
): WebTopicDiscoveryAgent {
  return new WebTopicDiscoveryAgent(aiTextModel, options);
}
