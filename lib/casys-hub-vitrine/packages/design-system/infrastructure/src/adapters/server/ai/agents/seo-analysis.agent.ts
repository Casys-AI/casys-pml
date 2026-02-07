import { Tool } from '@langchain/core/tools';

import type {
  CompetitiveAnalysisDTO,
  ContentStrategyDTO,
  KeywordPlanDTO,
  SearchIntentDataDTO,
  SeoAnalysisAgentOutputDTO,
} from '@casys/shared';
import { slugifyKeyword } from '@casys/core';
import type { AITextModelPort, SeoAnalysisAgentPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * Agent POML pour l'analyse SEO data-driven
 * Reçoit un prompt POML avec les données réelles (DataForSEO) et génère un brief SEO
 */
export class SeoAnalysisAgent extends Tool implements SeoAnalysisAgentPort {
  name = 'seo_analysis';
  description =
    "Génère un brief SEO v3 à partir d'un prompt POML fourni (incluant données réelles DataForSEO). Sortie: JSON avec keywordPlan, searchIntent, contentStrategy et competitiveAnalysis.";

  private readonly logger = createLogger(SeoAnalysisAgent.name);
  private aiTextModel: AITextModelPort;

  constructor(aiTextModel: AITextModelPort) {
    super();
    this.aiTextModel = aiTextModel;
  }

  protected async _call(arg: string): Promise<string> {
    this.logger.debug('SeoAnalysisAgent appelé (POML data-driven)');

    if (!arg || typeof arg !== 'string' || arg.trim().length === 0) {
      throw new Error('SeoAnalysisAgent: prompt POML requis');
    }

    const aiResponse = await this.aiTextModel.generateText(arg);

    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('SeoAnalysisAgent: réponse vide du modèle');
    }

    return aiResponse;
  }

  /**
   * Typed convenience: parse the model response into structured SEO analysis v3.
   * @param pomlPrompt - Prompt POML complet avec données DataForSEO
   * @returns Analyse SEO structurée v3 (keywordPlan + searchIntent + contentStrategy + competitiveAnalysis)
   */
  async analyze(pomlPrompt: string): Promise<SeoAnalysisAgentOutputDTO> {
    if (!pomlPrompt || pomlPrompt.trim().length === 0) {
      throw new Error('SeoAnalysisAgent.analyze: prompt POML requis');
    }

    // Log INPUT (full prompt for debugging)
    this.logger.debug('SeoAnalysisAgent INPUT:', {
      prompt: pomlPrompt,
    });

    const raw = await this.invoke(pomlPrompt);

    if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
      throw new Error('SeoAnalysisAgent.analyze: réponse vide');
    }

    try {
      const parsed = JSON.parse(raw.trim()) as {
        keywordPlan: {
          tags: {
            label: string;
            priority?: number;
            clusterType?: 'pillar' | 'cluster';
          }[];
        };
        searchIntent: {
          intent: string;
          confidence: number;
          supportingQueries?: string[];
          contentRecommendations?: {
            articleTypes?: string[];
            contentAngles?: string[];
          };
          topicClusters?: { pillarTag: any; satelliteTags: any[] }[]; // Legacy location
        };
        contentStrategy?: {
          topicClusters?: { pillarTag: any; satelliteTags: any[] }[];
          recommendations?: {
            seo?: string[];
            editorial?: string[];
            technical?: string[];
          };
        };
        competitiveAnalysis?: {
          contentGaps?: {
            keyword: any;
            gap: string;
            type?: string;
            opportunityScore?: number;
          }[];
          competitors?: any[];
        };
      };

      if (!parsed.keywordPlan || !parsed.searchIntent) {
        throw new Error('Structure JSON invalide: keywordPlan ou searchIntent manquant');
      }

      // V3: Lire topicClusters depuis contentStrategy (ou searchIntent comme fallback legacy)
      const topicClusters =
        parsed.contentStrategy?.topicClusters ?? parsed.searchIntent.topicClusters ?? [];

      // Log des stats v3
      const tagsWithPriority = parsed.keywordPlan.tags.filter(t => t.priority).length;
      const tagsWithClusterType = parsed.keywordPlan.tags.filter(t => t.clusterType).length;
      const gapsWithOpportunityScore =
        parsed.competitiveAnalysis?.contentGaps?.filter(g => g.opportunityScore !== undefined)
          .length ?? 0;

      this.logger.log('✅ Analyse SEO v3 parsée', {
        tagsWithPriority: `${tagsWithPriority}/${parsed.keywordPlan.tags.length}`,
        tagsWithClusterType: `${tagsWithClusterType}/${parsed.keywordPlan.tags.length}`,
        hasTopicClusters: topicClusters.length > 0,
        topicClustersCount: topicClusters.length,
        hasContentStrategy: !!parsed.contentStrategy,
        hasCompetitiveAnalysis: !!parsed.competitiveAnalysis,
        contentGapsCount: parsed.competitiveAnalysis?.contentGaps?.length ?? 0,
        gapsWithOpportunityScore: `${gapsWithOpportunityScore}/${parsed.competitiveAnalysis?.contentGaps?.length ?? 0}`,
      });

      const result: SeoAnalysisAgentOutputDTO = {
        keywordPlan: {
          tags: parsed.keywordPlan.tags.map(tag => ({
            label: tag.label,
            slug: slugifyKeyword(tag.label),
            source: 'opportunity' as const,
            weight: tag.priority ? Math.max(0, Math.min(1, tag.priority / 10)) : undefined,
            priority: tag.priority,
            clusterType: tag.clusterType,
          })),
        },
        searchIntent: {
          intent: this.coerceIntent(parsed.searchIntent.intent),
          confidence: Math.max(0, Math.min(1, parsed.searchIntent.confidence)),
          supportingQueries: parsed.searchIntent.supportingQueries ?? [],
          contentRecommendations: parsed.searchIntent.contentRecommendations,
        },
        contentStrategy: parsed.contentStrategy
          ? {
              topicClusters,
              recommendations: parsed.contentStrategy.recommendations,
            }
          : undefined,
        competitiveAnalysis: parsed.competitiveAnalysis
          ? {
              contentGaps: parsed.competitiveAnalysis.contentGaps?.map(gap => ({
                keyword: gap.keyword,
                gap: gap.gap,
                type: gap.type as 'pillar' | 'cluster' | 'angle' | undefined,
                opportunityScore: gap.opportunityScore,
              })),
              competitorTitles: parsed.competitiveAnalysis.competitors?.map(
                (c: any) => c.title ?? ''
              ),
            }
          : undefined,
      };

      // Log OUTPUT (full data for debugging)
      this.logger.debug('SeoAnalysisAgent OUTPUT v3:', {
        tagsCount: result.keywordPlan.tags.length,
        intent: result.searchIntent.intent,
        confidence: result.searchIntent.confidence,
        supportingQueriesCount: result.searchIntent.supportingQueries?.length ?? 0,
        topicClustersCount: result.contentStrategy?.topicClusters?.length ?? 0,
        contentGapsCount: result.competitiveAnalysis?.contentGaps?.length ?? 0,
      });

      return result;
    } catch (e) {
      this.logger.error('SeoAnalysisAgent.analyze: JSON.parse failed', e);
      throw new Error(
        `SeoAnalysisAgent.analyze: invalid JSON - ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  private coerceIntent(
    value: string
  ): 'informational' | 'commercial' | 'navigational' | 'transactional' {
    const normalized = (value ?? '').toLowerCase();
    if (normalized === 'commercial') return 'commercial';
    if (normalized === 'navigational') return 'navigational';
    if (normalized === 'transactional') return 'transactional';
    return 'informational';
  }
}

/**
 * Factory function to create an instance of the SeoAnalysisAgent tool.
 */
export function createSeoAnalysisAgent(aiTextModel: AITextModelPort): SeoAnalysisAgent {
  return new SeoAnalysisAgent(aiTextModel);
}
