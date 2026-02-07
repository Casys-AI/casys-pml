import assert from 'node:assert';

import type {
  ProjectConfig,
  SeoAnalysisCommandDTO,
  SeoAnalysisPromptDTO,
  SeoAnalysisResultDTO,
} from '@casys/shared';
// Utiliser les entités DDD du core
import { type SeoAnalysisResult, type SeoStrategy } from '@casys/core';

// Helpers internes pour normaliser le passage DTO -> Domaine
function clamp01(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// Nouveau: mapping depuis le type core (pas le DTO shared)
export function mapSeoAnalysisResultCoreToDomain(result: SeoAnalysisResult): SeoStrategy {
  return {
    id: result.id,
    language: result.language,
    createdAt: result.createdAt,
    keywordPlan: result.keywordPlan,
    competitors: result.competitors ?? [],
    trends: result.trends ?? [],
    searchIntent: result.searchIntent,
    competitionScore: result.competitionScore,
    trendScore: result.trendScore,
    contentType: result.contentType,
  };
}

function normalizeContentGaps(
  input: unknown
): {
  keyword: string;
  reason: 'no_content' | 'low_quality' | 'low_performance' | 'competitor_gap';
  details?: string;
}[] {
  const allowed = new Set(['no_content', 'low_quality', 'low_performance', 'competitor_gap']);
  if (!Array.isArray(input)) return [];
  return input
    .map(g => {
      const kw = String(g?.keyword ?? '').trim();
      const r = String(g?.reason ?? '').trim();
      const reason = allowed.has(r) ? (r as any) : 'competitor_gap';
      const detailsVal = g?.details;
      const details = typeof detailsVal === 'string' ? detailsVal.trim() : undefined;
      return kw ? { keyword: kw, reason, details } : undefined;
    })
    .filter(
      (
        x
      ): x is {
        keyword: string;
        reason: 'no_content' | 'low_quality' | 'low_performance' | 'competitor_gap';
        details?: string;
      } => !!x
    );
}

type IntentKind = 'informational' | 'commercial' | 'navigational' | 'transactional';
function coerceIntent(value: unknown): IntentKind {
  const v = typeof value === 'string' ? value.toLowerCase() : String(value ?? '').toLowerCase();
  const allowed: IntentKind[] = ['informational', 'commercial', 'navigational', 'transactional'];
  return (allowed as string[]).includes(v) ? (v as IntentKind) : 'informational';
}

function isTitleObject(x: unknown): x is { title?: unknown } {
  return !!x && typeof x === 'object' && 'title' in (x as Record<string, unknown>);
}

function normalizeRecommendations(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map(item => {
      if (typeof item === 'string') return item.trim();
      if (isTitleObject(item)) {
        const title = item.title;
        return typeof title === 'string' ? title.trim() : undefined;
      }
      return undefined;
    })
    .filter((s): s is string => !!s && s.length > 0);
}

export function mapCommandToSeoAnalysisPromptDTO(
  command: SeoAnalysisCommandDTO,
  projectConfig: ProjectConfig
): SeoAnalysisPromptDTO {
  const seoConfig = projectConfig.generation?.seoAnalysis;
  assert(seoConfig, 'ProjectConfig.generation.seoAnalysis requis');
  assert(seoConfig.businessDescription?.trim(), 'seoAnalysis.businessDescription requis');
  assert(seoConfig.industry?.trim(), 'seoAnalysis.industry requis');
  assert(seoConfig.targetAudience?.trim(), 'seoAnalysis.targetAudience requis');

  const keywords = command.keywords ?? seoConfig.keywords;
  assert(Array.isArray(keywords) && keywords.length > 0, 'seoAnalysis.keywords requis et non vide');
  const language = command.language ?? projectConfig.language;
  assert(language?.trim(), 'language requis (commande ou ProjectConfig.language)');
  const trendPriority = seoConfig.trendPriority ?? 0.5;
  const excludeCategories = seoConfig.excludeCategories ?? [];
  // Le ProjectConfig utilisateur est flat et peut omettre contentType.
  // On lit la valeur si présente, fallback explicite 'article'.
  const contentType = seoConfig.contentType ?? 'article';

  return {
    keywords,
    language,
    projectName: projectConfig.name,
    contentType,
    trendPriority,
    excludeCategories,
    maxKeywords: 15, // Valeur par défaut pour le template POML
    targetAudience: seoConfig.targetAudience,
    businessDescription: seoConfig.businessDescription,
    industry: seoConfig.industry,
  };
}
/**
 */
export function mapSeoAnalysisResultToDomain(resultDTO: SeoAnalysisResultDTO): SeoStrategy {
  // Conversion stricte DTO -> Domaine pur (aplatissement + coercitions)
  const keywordPlan = {
    tags: (resultDTO.keywordPlan?.tags ?? []).map(t => ({
      label: String(t?.label ?? '').trim(),
      slug: typeof t?.slug === 'string' ? t.slug : undefined,
      source: (t as any)?.source,
      weight: typeof t?.weight === 'number' ? t.weight : undefined,
    })),
    contentGaps: normalizeContentGaps(resultDTO.keywordPlan?.contentGaps),
    recommendations: normalizeRecommendations(resultDTO.keywordPlan?.recommendations),
  };

  const searchIntent = {
    intent: coerceIntent(resultDTO.searchIntent?.intent),
    confidence: clamp01(resultDTO.searchIntent?.confidence),
    supportingQueries: resultDTO.searchIntent?.supportingQueries ?? [],
    contentRecommendations: Array.isArray(resultDTO.searchIntent?.contentRecommendations)
      ? (resultDTO.searchIntent?.contentRecommendations ?? []).filter(
          (s): s is string => typeof s === 'string' && s.trim().length > 0
        )
      : [],
  };

  return {
    id: resultDTO.id,
    language: resultDTO.language,
    createdAt: resultDTO.createdAt,
    keywordPlan,
    competitors: resultDTO.competitors ?? [],
    trends: resultDTO.trends ?? [],
    searchIntent,
    competitionScore: resultDTO.competitionScore ?? 0.5,
    trendScore: resultDTO.trendScore,
    contentType: resultDTO.contentType,
  };
}
