import type {
  EditorialBriefGapDTO,
  EditorialBriefPromptResult,
  KeywordTagDTO,
} from '@casys/shared';
import type { BlogRecommendations, ContentGap, KeywordTag, TagSource } from '@casys/core';
import {
  type AITextModelPort,
  buildEditorialBriefPoml,
  type EditorialBriefAgentParams,
  type EditorialBriefAgentPort,
  type EditorialBriefData,
  mapParamsToEditorialBriefPromptDTO,  type PromptTemplatePort} from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * EditorialBriefAgent - Synthèse active de l'angle + SEO + corpus
 *
 * Utilisé UNIQUEMENT pour les nouveaux articles (génération complète avec SeoBrief)
 *
 * Responsabilités:
 * - Filtrer questions PAA pertinentes pour l'angle et contentType
 * - Prioriser top 3 content gaps à couvrir
 * - Adapter recommendations au persona et contentType
 * - Sélectionner keywords essentiels (cluster + secondaires pertinents)
 * - Synthétiser le corpus en 2-3 phrases
 * - Extraire angles concurrents des titres
 *
 * Pattern LangChain:
 * - Mapper: mapParamsToEditorialBriefPromptDTO
 * - Builder: buildEditorialBriefPoml
 * - Template: config/blueprints/prompts/editorial-brief.poml
 */
export class EditorialBriefAgent implements EditorialBriefAgentPort {
  private readonly logger = createLogger('EditorialBriefAgent');

  constructor(
    private readonly aiTextModel: AITextModelPort,
    private readonly templateReader: PromptTemplatePort
  ) {}

  async generateBrief(params: EditorialBriefAgentParams): Promise<EditorialBriefData> {
    this.logger.debug('[generateBrief] Starting editorial brief synthesis', {
      angle: params.angle.slice(0, 60),
      contentType: params.contentType,
      selectionMode: params.selectionMode,
      clusterPillar: params.chosenCluster.pillarTag.label,
      topicsCount: params.selectedTopics.length,
      articlesCount: params.sourceArticles.length,
    });

    // 1. Mapper les paramètres vers le DTO de prompt
    const promptParams = mapParamsToEditorialBriefPromptDTO(params);

    this.logger.debug('[generateBrief] Prompt params mapped', {
      hasPersona: promptParams.hasPersona,
      questionsCount: promptParams.questionsCount,
      gapsCount: promptParams.gapsCount,
      hasCompetitorTitles: promptParams.hasCompetitorTitles,
    });

    // 2. Construire le prompt POML
    const templatePath = 'prompts/editorial-brief.poml';
    const poml = await buildEditorialBriefPoml(
      this.templateReader,
      templatePath,
      promptParams
    );

    // 3. Appel LLM
    const raw = await this.aiTextModel.generateText(poml);

    if (!raw || typeof raw !== 'string') {
      throw new Error('[EditorialBriefAgent] empty model response');
    }

    // 4. Parser le JSON de la réponse
    const briefData = this.parseModelResponse(raw);

    this.logger.debug('[generateBrief] Editorial brief generated', {
      keywordsCount: briefData.keywordTags.length,
      questionsCount: briefData.relevantQuestions.length,
      gapsCount: briefData.priorityGaps.length,
      corpusSummaryLength: briefData.corpusSummary.length,
      competitorAnglesCount: briefData.competitorAngles?.length ?? 0,
    });

    return briefData;
  }

  /**
   * Parse la réponse du modèle et valide la structure
   */
  private parseModelResponse(raw: string): EditorialBriefData {
    // Extraire le JSON (peut être enveloppé dans du markdown)
    const jsonMatch = /\{[\s\S]*\}/.exec(raw);
    if (!jsonMatch) {
      this.logger.error('[EditorialBriefAgent] No JSON found in model response', {
        rawPreview: raw.slice(0, 200),
      });
      throw new Error('[EditorialBriefAgent] No JSON found in model response');
    }

    let parsed: EditorialBriefPromptResult;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      this.logger.error('[EditorialBriefAgent] JSON parse error', {
        raw: raw.slice(0, 200),
        error: e instanceof Error ? e.message : String(e),
      });
      throw new Error('[EditorialBriefAgent] Invalid JSON in model response');
    }

    // Mapper les DTOs vers le domain
    const keywordTags: KeywordTag[] = (parsed.keywordTags ?? [])
      .slice(0, 10)
      .map((kw: KeywordTagDTO) => ({
        label: String(kw.label ?? '').trim(),
        slug: String(kw.slug ?? '').trim().toLowerCase(),
        source: (kw.source as TagSource) ?? 'opportunity',
        searchVolume: kw.searchVolume ?? 0,
        difficulty: kw.difficulty ?? 0,
        priority: kw.priority ?? 0,
      }));

    const relevantQuestions: string[] = (parsed.relevantQuestions ?? [])
      .slice(0, 5)
      .map((q: string) => String(q).trim())
      .filter(Boolean);

    const priorityGaps: ContentGap[] = (parsed.priorityGaps ?? [])
      .slice(0, 3)
      .map((g: EditorialBriefGapDTO) => ({
        keyword: String(g.keyword ?? '').trim(),
        gap: String(g.gap ?? '').trim(),
        priority: Number(g.priority ?? 5),
      }));

    const guidingRecommendations: BlogRecommendations = {
      seo: (parsed.guidingRecommendations?.seo ?? [])
        .map((r: string) => String(r).trim())
        .filter(Boolean),
      editorial: (parsed.guidingRecommendations?.editorial ?? [])
        .map((r: string) => String(r).trim())
        .filter(Boolean),
      technical: (parsed.guidingRecommendations?.technical ?? [])
        .map((r: string) => String(r).trim())
        .filter(Boolean),
    };

    const corpusSummary = String(parsed.corpusSummary ?? '').trim();
    if (!corpusSummary) {
      throw new Error('[EditorialBriefAgent] corpusSummary is required');
    }

    const competitorAngles: string[] = (parsed.competitorAngles ?? [])
      .slice(0, 5)
      .map((a: string) => String(a).trim())
      .filter(Boolean);

    // Validation minimale
    if (keywordTags.length === 0) {
      throw new Error('[EditorialBriefAgent] keywordTags cannot be empty');
    }

    return {
      keywordTags,
      relevantQuestions,
      priorityGaps,
      guidingRecommendations,
      corpusSummary,
      competitorAngles,
    };
  }
}

/**
 * Factory function
 */
export function createEditorialBriefAgent(
  aiTextModel: AITextModelPort,
  templateReader: PromptTemplatePort
): EditorialBriefAgent {
  return new EditorialBriefAgent(aiTextModel, templateReader);
}
