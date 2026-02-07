import type { AITextModelPort, KeywordDiscoveryPort, PageContent } from '@casys/application';
import type { Domain } from '@casys/core';
import type { KeywordTagDTO } from '@casys/shared';

import { slugifyKeyword } from '@casys/core';
import { createLogger } from '../../../../utils/logger';

/**
 * Agent de découverte de keywords SEO (Infrastructure layer)
 * Responsabilité: Appeler l'AI et retourner KeywordTagDTO[] AI-only
 * L'enrichissement DataForSEO et le streaming se font dans Application layer
 */
export class KeywordDiscoveryAgent implements KeywordDiscoveryPort {
  private readonly logger = createLogger('KeywordDiscoveryAgent');

  constructor(private readonly aiModel: AITextModelPort) {}

  /**
   * Découvre keywords depuis le contenu (AI-only, sans enrichissement DataForSEO)
   * @returns 20-30 keywords avec enrichissement AI (category, intent, description)
   */
  async discoverKeywords(
    domain: Domain,
    input: {
      pages: PageContent[];
      rankedKeywords: { keyword: string; position: number; searchVolume: number }[];
      businessContext: {
        industry?: string;
        targetAudience?: string;
        contentType?: string;
        businessDescription?: string;
      };
    },
    language: string
  ): Promise<KeywordTagDTO[]> {
    this.logger.debug('[discoverKeywords] Starting keyword discovery', {
      domain: domain.value,
      pagesCount: input.pages.length,
      rankedKeywordsCount: input.rankedKeywords.length,
      language,
    });

    // Préparer le contenu pour l'AI
    const contentSummary = this.buildContentSummary(input.pages);
    const rankedKeywordsList = input.rankedKeywords
      .map((kw) => `- ${kw.keyword} (vol: ${kw.searchVolume}, pos: ${kw.position})`)
      .join('\n');

    const businessContextText = this.buildBusinessContextText(input.businessContext);

    // Prompt POML structuré pour extraction enrichie
    const prompt = `<poml version="1.0">
<context>
Tu es un expert SEO. Analyse le contenu du site "${domain.value}" et extrais les keywords les plus pertinents avec leur catégorisation sémantique détaillée.
Réponds dans la langue détectée: ${language === 'fr' ? 'FRANÇAIS' : language === 'en' ? 'ENGLISH' : language.toUpperCase()}.
</context>

<input>
<domain>${domain.xmlSafe}</domain>

<site_content>
${contentSummary}
</site_content>

<ranked_keywords>
Les keywords sur lesquels le site est déjà positionné :
${rankedKeywordsList || 'Aucun keyword ranké détecté'}
</ranked_keywords>

<business_context>
${businessContextText}
</business_context>
</input>

<stepwise>
IMPORTANT: STREAM chaque keyword immédiatement pendant l'analyse (format JSONL - ligne par ligne).

Étape 1: LIS le contenu Markdown de la homepage
Étape 2: EXTRAIS 20-30 keywords pertinents
Étape 3: Pour CHAQUE keyword:
   - Catégorise: service|feature|benefit|audience|topic|product
   - Description: 1 phrase courte (max 15 mots)
   - Intent: informational|transactional|navigational
   - RelatedKeywords: liste des slugs de keywords liés (max 5)
   - Relevance: score 1-10
   - Priority: score 1-10 (basé sur business fit + search volume match)
Étape 4: STREAM le JSON immédiatement (JSONL - pas d'array englobant)
Étape 5: PRIORITÉ: Stream les 6 keywords à priority la plus élevée en premier
</stepwise>

<output_format>
Format JSONL strict (un objet JSON par ligne, PAS d'array, PAS de virgules entre lignes):

{"keyword":"marketing automation","category":"service","description":"Automated marketing campaigns and workflows","intent":"transactional","relatedKeywords":["email-marketing","crm","lead-nurturing"],"relevance":9,"priority":8}
{"keyword":"email campaigns","category":"feature","description":"Send targeted email sequences","intent":"transactional","relatedKeywords":["marketing-automation","newsletters"],"relevance":8,"priority":7}
{"keyword":"marketing ROI","category":"benefit","description":"Measure return on investment","intent":"informational","relatedKeywords":["analytics","reporting"],"relevance":7,"priority":6}

Catégories disponibles:
- service: Services principaux offerts par le business
- feature: Fonctionnalités spécifiques d'un produit/service
- benefit: Bénéfices utilisateur / valeur ajoutée
- audience: Audiences cibles / personas
- topic: Sujets/thématiques générales
- product: Produits spécifiques

Intents disponibles:
- informational: Recherche d'information / apprentissage
- transactional: Intention d'achat / action
- navigational: Navigation vers marque/site spécifique
</output_format>

<constraints>
1. Langue: ${language} (tous les labels, descriptions et keywords dans cette langue)
2. Total: 20-30 keywords
3. Stream les 6 top priority d'abord
4. Format: JSONL strict (un JSON par ligne, pas d'array)
5. RelatedKeywords: liste de keywords liés (format naturel, normalisation faite côté code)
6. Description: max 15 mots, factuelle, pas de marketing fluff
7. Match avec ranked_keywords pour calculer priority boost
8. Categories: choisir la plus précise (éviter "topic" si possible)
9. ⚡ LONGUEUR KEYWORDS: 1-3 mots maximum (exceptionnellement 4 pour expressions essentielles)
10. ⚡ RÉALISME SEO: Privilégier les termes que les gens tapent réellement dans Google
11. ⚡ ÉVITER: Longues queues ultra-spécifiques (ex: "secrétaire du bâtiment clermont-ferrand" ❌)
12. ⚡ PRÉFÉRER: Termes courts génériques + variantes locales séparées (ex: "secrétaire bâtiment" ✅, "secrétariat Clermont-Ferrand" ✅)
13. ⚡ GÉOLOCALISATION: Si locale nécessaire, la séparer en keyword distinct (pas combiner métier+ville en 1 keyword)
</constraints>
</poml>`;

    this.logger.debug('[discoverKeywords] Prompt built', {
      promptLength: prompt.length,
      promptPreview: prompt.slice(0, 500),
    });

    // Appel AI avec error handling
    let response: string;
    try {
      response = await this.aiModel.generateText(prompt);
      this.logger.debug('[discoverKeywords] AI response received', {
        responseLength: response.length,
        responsePreview: response.slice(0, 200),
      });
    } catch (error) {
      this.logger.error('[discoverKeywords] AI call failed', {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        domain: domain.value,
        pagesCount: input.pages.length,
        promptPreview: prompt.slice(0, 300),
      });
      throw new Error(
        `Keyword discovery AI call failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Parse JSON et construire KeywordTagDTO[] AI-only
    const extracted = this.parseKeywordsJSON(response);
    this.logger.debug('[discoverKeywords] Extracted keywords', {
      count: extracted.length,
    });

    // Construire les KeywordTagDTO (AI-only, sans DataForSEO metrics)
    const keywordsAIOnly = this.buildKeywordDTOs(extracted);

    this.logger.debug('[discoverKeywords] Built AI-only KeywordTagDTOs', {
      count: keywordsAIOnly.length,
      withCategory: keywordsAIOnly.filter((k) => k.aiEnrichment?.category).length,
      withDescription: keywordsAIOnly.filter((k) => k.aiEnrichment?.description).length,
    });

    return keywordsAIOnly;
  }

  /**
   * Construit un résumé du contenu pour l'AI
   * Jina retourne déjà du Markdown LLM-friendly, on utilise 5000 chars par page
   */
  private buildContentSummary(pages: PageContent[]): string {
    this.logger.debug('[buildContentSummary] Building summary', {
      pagesCount: pages.length,
    });

    const summaries = pages.map((page, index) => {
      const title = page.title ?? page.url;
      const content = page.content.slice(0, 5000); // 10x plus de contexte (Jina Markdown)
      const contentLength = page.content.length;

      this.logger.debug('[buildContentSummary] Page processed', {
        index,
        title,
        contentLength,
        slicedLength: content.length,
      });

      return `Page: ${title}\nURL: ${page.url}\nDescription: ${page.description ?? 'N/A'}\n\nContent:\n${content}`;
    });

    return summaries.join('\n\n---\n\n'); // Toutes les pages (actuellement 1 homepage)
  }

  /**
   * Construit le texte business context pour l'AI
   */
  private buildBusinessContextText(context: {
    industry?: string;
    targetAudience?: string;
    contentType?: string;
    businessDescription?: string;
  }): string {
    const parts: string[] = [];
    if (context.industry) parts.push(`Industry: ${context.industry}`);
    if (context.targetAudience) parts.push(`Target Audience: ${context.targetAudience}`);
    if (context.contentType) parts.push(`Content Type: ${context.contentType}`);
    if (context.businessDescription) parts.push(`Description: ${context.businessDescription}`);
    return parts.join('\n') || 'No business context available';
  }

  /**
   * Parse la réponse JSONL de l'AI (ligne par ligne)
   */
  private parseKeywordsJSON(content: string): {
    keyword: string;
    category?: string;
    description?: string;
    intent?: string;
    relatedKeywords?: string[];
    relevance: number;
    priority: number;
  }[] {
    try {
      // Nettoyer le contenu (retirer markdown si présent)
      const cleaned = content
        .replace(/```jsonl?\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Split par lignes et parser chaque ligne JSONL
      const lines = cleaned.split('\n').filter((line) => line.trim().startsWith('{'));

      this.logger.debug('[parseKeywordsJSON] Parsing JSONL', {
        totalLines: lines.length,
      });

      const parsed = lines
        .map((line, index) => {
          try {
            const obj = JSON.parse(line.trim());

            // Valider champs requis
            if (!obj.keyword || typeof obj.keyword !== 'string' || obj.keyword.length === 0) {
              this.logger.warn('[parseKeywordsJSON] Invalid keyword at line', { index, line: line.slice(0, 100) });
              return null;
            }

            const result = {
              keyword: obj.keyword,
              category: typeof obj.category === 'string' ? obj.category : undefined,
              description: typeof obj.description === 'string' ? obj.description : undefined,
              intent: typeof obj.intent === 'string' ? obj.intent : undefined,
              relatedKeywords: Array.isArray(obj.relatedKeywords) ? obj.relatedKeywords : undefined,
              relevance: typeof obj.relevance === 'number' ? obj.relevance : 5,
              priority: typeof obj.priority === 'number' ? obj.priority : 5,
            };

            this.logger.debug('[parseKeywordsJSON] Parsed keyword', {
              index,
              keyword: result.keyword,
              category: result.category,
              hasDescription: !!result.description,
              relatedCount: result.relatedKeywords?.length ?? 0,
            });

            return result;
          } catch (lineErr) {
            this.logger.warn('[parseKeywordsJSON] Failed to parse line', {
              index,
              error: lineErr instanceof Error ? lineErr.message : String(lineErr),
              line: line.slice(0, 100),
            });
            return null;
          }
        })
        .filter((kw): kw is NonNullable<typeof kw> => kw !== null);

      this.logger.debug('[parseKeywordsJSON] Parsing complete', {
        totalParsed: parsed.length,
        withCategory: parsed.filter((k) => k.category).length,
        withDescription: parsed.filter((k) => k.description).length,
      });

      return parsed;
    } catch (err) {
      this.logger.error('[parseKeywordsJSON] Failed to parse JSONL', {
        error: err instanceof Error ? err.message : String(err),
        content: content.slice(0, 200),
      });
      return [];
    }
  }

  /**
   * Construit les KeywordTagDTO AI-only depuis les keywords extraits
   * (sans enrichissement DataForSEO - juste les données de l'AI)
   */
  private buildKeywordDTOs(
    extracted: {
      keyword: string;
      category?: string;
      description?: string;
      intent?: string;
      relatedKeywords?: string[];
      relevance: number;
      priority: number;
    }[]
  ): KeywordTagDTO[] {
    return extracted.map((kw) => {
      const slug = slugifyKeyword(kw.keyword);

      // Construire l'enrichissement AI avec structure nested
      const aiEnrichment: KeywordTagDTO['aiEnrichment'] =
        kw.category || kw.description || kw.intent || kw.relatedKeywords
          ? {
              category: kw.category ? { type: kw.category as any } : undefined,
              description: kw.description ? { text: kw.description } : undefined,
              intent: kw.intent ? { type: kw.intent as any } : undefined,
              relatedKeywords: kw.relatedKeywords?.map((relSlug) => ({
                slug: relSlug,
              })),
            }
          : undefined;

      const dto: KeywordTagDTO = {
        label: kw.keyword,
        slug,
        source: 'ai', // AI-only (pas encore enrichi avec DataForSEO)
        sources: ['ai'],
        weight: kw.relevance / 10, // Normaliser 1-10 → 0.1-1.0
        priority: kw.priority,
        createdAt: new Date().toISOString(),
        aiEnrichment,
      };

      return dto;
    });
  }
}
