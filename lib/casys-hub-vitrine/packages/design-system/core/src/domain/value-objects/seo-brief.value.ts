import type {
  BlogRecommendations,
  KeywordPlan,
  SearchIntentData,
  SeoBriefData,
  SeoBriefDataV3,
} from '../types/seo.types';
import type { ContentGap } from './content-gap.value';

// New enriched SEO analysis format only — VO-only API (no exported Props)

export class SeoBrief {
  private constructor(
    private readonly _keywordPlan: KeywordPlan,
    private readonly _search: SearchIntentData
  ) {}

  static create(props: { keywordPlan: KeywordPlan; searchIntent: SearchIntentData }): SeoBrief;
  static create(keywordPlan: KeywordPlan, searchIntent: SearchIntentData): SeoBrief;
  static create(
    arg1: KeywordPlan | { keywordPlan: KeywordPlan; searchIntent: SearchIntentData },
    arg2?: SearchIntentData
  ): SeoBrief {
    let keywordPlan: KeywordPlan;
    let searchIntent: SearchIntentData;
    if (arg2) {
      keywordPlan = arg1 as KeywordPlan;
      searchIntent = arg2;
    } else {
      const props = arg1 as { keywordPlan: KeywordPlan; searchIntent: SearchIntentData };
      keywordPlan = props.keywordPlan;
      searchIntent = props.searchIntent;
    }
    const sanitize = (arr?: unknown): string[] => {
      if (!Array.isArray(arr)) return [];
      const out = Array.from(
        new Set(
          arr
            .filter((v): v is string => typeof v === 'string')
            .map(v => v.trim())
            .filter(v => v.length > 0)
        )
      );
      return out;
    };

    // Extract data from SEO analysis format (derive for validation only)
    const kw = keywordPlan.tags.map(tag => String(tag.label).trim()).filter(Boolean);
    const sr: string[] = [];
    const cg: string[] = [];
    const uq = sanitize(searchIntent.supportingQueries);
    const cr = sanitize(searchIntent.contentRecommendations);

    // Au moins un des champs principaux doit contenir un élément (fail-fast)
    if (kw.length + uq.length + cg.length + sr.length + cr.length === 0) {
      throw new Error('SeoBrief: at least one non-empty field is required');
    }

    // Store references only (no duplication); derived fields are exposed via getters
    return new SeoBrief(keywordPlan, searchIntent);
  }

  // Aligned accessor with SeoBriefData
  get keywordTags() {
    return Array.isArray(this._keywordPlan?.tags) ? this._keywordPlan.tags : [];
  }
  get userQuestions(): string[] {
    const arr = this._search?.supportingQueries ?? [];
    return Array.from(new Set(arr.map(v => String(v ?? '').trim()).filter(v => v.length > 0)));
  }
  get contentGaps(): ContentGap[] {
    // V2 MIGRATION: return ContentGap[] directly instead of legacy format
    return this._search?.contentGaps ?? [];
  }
  get seoRecommendations(): string[] {
    const arr = this._search?.seoRecommendations ?? [];
    return Array.from(new Set(arr.map(v => String(v ?? '').trim()).filter(v => v.length > 0)));
  }
  get searchIntent(): 'informational' | 'commercial' | 'navigational' | 'transactional' {
    return this._search?.intent ?? 'informational';
  }
  get searchConfidence(): number {
    const c = typeof this._search?.confidence === 'number' ? this._search.confidence : 0;
    return Math.max(0, Math.min(1, c));
  }
  get contentRecommendations(): string[] | BlogRecommendations {
    // Support both legacy array and structured format
    const recs = this._search?.contentRecommendations;
    if (!recs) return [];
    // If it's already an array (legacy), normalize it
    if (Array.isArray(recs)) {
      return Array.from(new Set(recs.map(v => String(v ?? '').trim()).filter(v => v.length > 0)));
    }
    // If it's structured, cast to BlogRecommendations (legacy compatibility)
    return recs as BlogRecommendations;
  }

  /**
   * V3: Retourne SeoBriefDataV3 avec structure objets métier
   */
  toObject(): SeoBriefDataV3 {
    return {
      keywordTags: (this._keywordPlan?.tags ?? []).map(t => ({
        label: String(t?.label ?? '').trim(),
        slug: t?.slug,
        source: t?.source,
        weight: t?.weight,
        searchVolume: t?.searchVolume,
        difficulty: t?.difficulty,
        cpc: t?.cpc,
        competition: t?.competition,
        lowTopOfPageBid: t?.lowTopOfPageBid,
        highTopOfPageBid: t?.highTopOfPageBid,
        monthlySearches: t?.monthlySearches,
        aiEnrichment: t?.aiEnrichment,
        priority: t?.priority,
        clusterType: t?.clusterType,
        createdAt: t?.createdAt,
        updatedAt: t?.updatedAt,
      })),

      // SearchIntent: WHAT to write (intent + questions + content angles)
      searchIntent: {
        intent: this._search?.intent ?? 'informational',
        confidence: typeof this._search?.confidence === 'number' ? this._search.confidence : 0,
        supportingQueries: this._search?.supportingQueries ?? [],
        contentRecommendations: this._search?.contentRecommendations,
      },

      // ContentStrategy: HOW to write (clusters + recommendations)
      contentStrategy: {
        topicClusters: this._search?.topicClusters ?? [],
        recommendations: this._search?.recommendations ?? {
          seo: this._search?.seoRecommendations ?? [],
          editorial: [],
          technical: [],
        },
      },

      // CompetitiveAnalysis: Opportunities (gaps + competitors)
      competitiveAnalysis: {
        contentGaps: this._search?.contentGaps ?? [],
        competitorTitles: [],
      },
    };
  }

  /**
   * V2 legacy: pour compatibilité avec code existant
   * @deprecated Use toObject() (now returns V3) and convert with toV2SeoBriefData() if needed
   */
  toData(): SeoBriefData {
    const { toV2SeoBriefData } = require('../types/seo.types');
    return toV2SeoBriefData(this.toObject());
  }

  // Factory depuis SeoBriefData (alignement fort avec le type de domaine)
  static fromData(data: SeoBriefData): SeoBrief {
    const keywordPlan = { tags: Array.isArray(data.keywordTags) ? data.keywordTags : [] };
    const searchIntent = {
      intent: data.searchIntent,
      confidence: data.searchConfidence,
      supportingQueries: data.userQuestions,
      contentGaps: data.contentGaps,
      // Migration v2→v3: utiliser recommendations.seo avec fallback vers seoRecommendations deprecated
      seoRecommendations: data.recommendations?.seo ?? data.seoRecommendations ?? [],
      // Migration v2→v3: utiliser recommendations avec fallback vers contentRecommendations deprecated
      contentRecommendations: data.recommendations ?? data.contentRecommendations ?? [],
      // Blog strategy v2: nouveaux champs
      topicClusters: data.topicClusters,
      recommendations: data.recommendations,
    } as SearchIntentData;
    return SeoBrief.create(keywordPlan, searchIntent);
  }
}
