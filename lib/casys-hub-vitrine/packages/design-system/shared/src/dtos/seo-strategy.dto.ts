// DTOs pour la stratégie SEO décomposée en objets métier
// Exposés via @casys/shared

import type { KeywordTagDTO } from './keyword-plan.dto';
import type { ContentRecommendationsDTO } from './seo-analysis.dto';

/**
 * TopicCluster = Structure pilier → satellites
 * Fait partie de ContentStrategyDTO (v3 architecture)
 */
export interface TopicClusterDTO {
  pillarTag: KeywordTagDTO;        // Tag pilier avec metrics
  satelliteTags: KeywordTagDTO[];  // Tags satellites avec metrics
}

/**
 * ContentGap = Opportunité de contenu détectée
 * Fait partie de CompetitiveAnalysisDTO (v3 architecture)
 */
export interface ContentGapDTO {
  keyword: KeywordTagDTO; // Keyword avec metrics SEO (pour calculer opportunityScore)
  gap: string; // Description du gap (angle manquant, question non traitée, format absent)

  // Legacy format (optionnel)
  reason?: 'no_content' | 'low_quality' | 'low_performance' | 'competitor_gap';
  details?: string;

  // Blog strategy v2 format (optionnel)
  type?: 'pillar' | 'cluster' | 'angle'; // pillar=nouveau centre thématique, cluster=complément, angle=perspective différente
  opportunityScore?: number; // 1-10, volume × (1-difficulty) × blog-fit
}

/**
 * BlogRecommendations = Recommandations HOW to write
 * Fait partie de ContentStrategyDTO (v3 architecture)
 */
export interface BlogRecommendationsDTO {
  seo?: string[]; // SEO technique: meta, schema, internal linking, topical authority
  editorial?: string[]; // Éditorial: ton, exemples concrets, visuels, CTA, structure narrative
  technical?: string[]; // Technique: longueur cible, H2/H3 structure, markdown tables/lists, featured snippet opportunities
}

/**
 * INTENT de recherche pur
 * Décrit l'intention utilisateur et le type de contenu attendu
 */
export interface SearchIntentDTO {
  intent: 'informational' | 'commercial' | 'navigational' | 'transactional';
  confidence: number; // 0..1
  supportingQueries?: string[]; // Questions PAA (People Also Ask)
  contentRecommendations?: ContentRecommendationsDTO; // WHAT to write
}

/**
 * STRATÉGIE éditoriale
 * Organisation et approche d'écriture
 */
export interface ContentStrategyDTO {
  topicClusters?: TopicClusterDTO[]; // Structure piliers → satellites
  recommendations?: BlogRecommendationsDTO; // HOW to write: seo/editorial/technical
}

/**
 * Concurrent SERP détecté
 * Données extraites des résultats de recherche
 */
export interface CompetitorDataDTO {
  title?: string;       // Titre de la page concurrente
  description?: string; // Meta description
  url?: string;         // URL de la page
  keywords?: string[];  // Keywords identifiés dans le contenu
}

/**
 * ANALYSE concurrentielle
 * Opportunités et landscape SERP
 */
export interface CompetitiveAnalysisDTO {
  contentGaps?: ContentGapDTO[];      // Opportunités détectées dans la SERP
  competitors?: CompetitorDataDTO[];  // Concurrents majeurs avec leurs métadonnées
}

/**
 * BRIEF SEO complet = composition des 3 objets métier
 *
 * Architecture:
 * - keywordTags: Base de keywords enrichis (tags, pas strings!)
 * - searchIntent: Intention utilisateur + type de contenu (WHAT)
 * - contentStrategy: Organisation éditoriale + approche (HOW)
 * - competitiveAnalysis: Opportunités SERP
 *
 * Les champs deprecated (userQuestions, seoRecommendations, etc.)
 * sont maintenus pour backward compatibility mais devraient être
 * accédés via les objets métier.
 */
export interface SeoBriefDataDTO {
  // Base: KeywordTags enrichis (source de vérité)
  keywordTags: KeywordTagDTO[];

  // Composition des 3 objets métier (v3 architecture)
  searchIntent: SearchIntentDTO;
  contentStrategy: ContentStrategyDTO;
  competitiveAnalysis: CompetitiveAnalysisDTO;
}

/**
 * Version legacy/flat pour backward compatibility
 * À utiliser dans les interfaces qui n'ont pas encore migré
 */
export interface SeoBriefDataLegacyDTO {
  keywordTags: KeywordTagDTO[];
  userQuestions: string[];
  contentGaps: string[] | ContentGapDTO[];
  searchIntent: 'informational' | 'commercial' | 'navigational' | 'transactional';
  searchConfidence: number;
  topicClusters?: TopicClusterDTO[];
  recommendations: BlogRecommendationsDTO; // ✅ Seul champ pour recommendations (propre)
  competitorTitles?: string[];

  // Legacy deprecated fields (kept for backward compatibility)
  /** @deprecated Use recommendations.seo instead. Will be removed in v4. */
  seoRecommendations?: string[];
  /** @deprecated Misnamed field. Use recommendations instead. Will be removed in v4. */
  contentRecommendations?: string[] | ContentRecommendationsDTO;
}

/**
 * Helper: convertit SeoBriefDataDTO (v3) vers format legacy (v2)
 */
export function toLegacySeoBriefData(brief: SeoBriefDataDTO): SeoBriefDataLegacyDTO {
  // Dans v2, contentRecommendations était BlogRecommendationsDTO (HOW to write)
  // Dans v3, SearchIntent.contentRecommendations = ContentRecommendationsDTO (WHAT to write)
  // On utilise ContentStrategy.recommendations (BlogRecommendations) pour v2
  const legacyContentRecs =
    brief.contentStrategy.recommendations ??
    (Array.isArray(brief.searchIntent.contentRecommendations)
      ? brief.searchIntent.contentRecommendations
      : []);

  return {
    keywordTags: brief.keywordTags,
    userQuestions: brief.searchIntent.supportingQueries ?? [],
    contentGaps: brief.competitiveAnalysis.contentGaps ?? [],
    searchIntent: brief.searchIntent.intent,
    searchConfidence: brief.searchIntent.confidence,
    topicClusters: brief.contentStrategy.topicClusters,
    recommendations: brief.contentStrategy.recommendations ?? {
      seo: [],
      editorial: [],
      technical: [],
    },
    competitorTitles:
      (brief.competitiveAnalysis.competitors ?? [])
        .map(c => c.title)
        .filter((t): t is string => typeof t === 'string'),

    // Legacy deprecated fields (pour compatibilité)
    seoRecommendations: brief.contentStrategy.recommendations?.seo ?? [],
    contentRecommendations: legacyContentRecs as any,
  };
}

/**
 * Helper: convertit format legacy (v2) vers SeoBriefDataDTO (v3)
 */
export function fromLegacySeoBriefData(legacy: SeoBriefDataLegacyDTO): SeoBriefDataDTO {
  // Dans v2, contentRecommendations était BlogRecommendationsDTO (HOW to write)
  // Dans v3, on sépare: SearchIntent = WHAT to write, ContentStrategy = HOW to write
  // Conversion intelligente: v2.contentRecommendations → v3.contentStrategy.recommendations

  return {
    keywordTags: legacy.keywordTags,
    searchIntent: {
      intent: legacy.searchIntent,
      confidence: legacy.searchConfidence,
      supportingQueries: legacy.userQuestions,
      // v3 SearchIntent.contentRecommendations = ContentRecommendations (WHAT to write)
      // v2.contentRecommendations était BlogRecommendations (HOW), donc undefined ici
      contentRecommendations: undefined,
    },
    contentStrategy: {
      topicClusters: legacy.topicClusters,
      // Utiliser v2.recommendations si disponible, sinon v2.contentRecommendations (legacy mapping)
      recommendations:
        legacy.recommendations ??
        (typeof legacy.contentRecommendations === 'object' &&
        !Array.isArray(legacy.contentRecommendations)
          ? (legacy.contentRecommendations as any) // Cast car type mismatch ContentRecommendationsDTO vs BlogRecommendationsDTO
          : undefined),
    },
    competitiveAnalysis: {
      contentGaps: Array.isArray(legacy.contentGaps)
        ? legacy.contentGaps.map(g => {
            if (typeof g === 'string') {
              // Legacy: string gap → construire un ContentGapDTO riche
              const label = g;
              const slug = label.toLowerCase().replace(/\s+/g, '-');
              return {
                keyword: { label, slug, source: 'ai' },
                gap: g,
              } as ContentGapDTO;
            }
            // Legacy: ContentGapDTO avec keyword string → convertir en KeywordTagDTO
            const maybeGap = g as any;
            if (maybeGap && typeof maybeGap.keyword === 'string') {
              const label = maybeGap.keyword as string;
              const slug = label.toLowerCase().replace(/\s+/g, '-');
              return {
                ...maybeGap,
                keyword: { label, slug, source: 'ai' },
              } as ContentGapDTO;
            }
            return g;
          })
        : [],
      competitors: [], // Legacy n'a pas competitors, seulement competitorTitles
    },
  };
}
