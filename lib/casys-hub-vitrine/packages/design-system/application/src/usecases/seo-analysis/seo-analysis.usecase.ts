import {
  type KeywordMetricsDTO,
  type KeywordPlanDTO,
  type KeywordTagDTO,
  type ProjectConfig,
  type SeoAnalysisAgentOutputDTO,
  type SeoAnalysisCommandDTO,
  type SeoAnalysisResultDTO,
  type TrendDataDTO,
} from '@casys/shared';
import {
  mapLanguageToRegion,
  normalizeKeyword,
  type ProjectSeoSettings,
  type SeoAnalysisCommand,
  type SeoAnalysisPort,
  type SeoAnalysisResult,
  type SeoBriefDataV3,
  slugifyKeyword,
  type TopicCluster,
} from '@casys/core';

import { buildBusinessContextV3 } from '../../mappers/business-context.mapper';
import { mapCommandToSeoAnalysisPromptDTO } from '../../mappers/seo-analysis.mapper';
import { buildSeoBriefDataV3, toSeoBriefDataDTO } from '../../mappers/seo-brief-data.mapper';
import {
  mapCompetitorDTOToCore,
  mapKeywordTagDTOToCore,
  mapSearchIntentDTOToCore,
  mapTrendDTOToCore,
} from '../../mappers/seo-core.mapper';
import {
  type AITextModelPort,
  type DomainAnalysisPort,
  type GoogleScrapingPort,
  type GoogleTrendsPort,
  type KeywordEnrichmentPort,
  type KeywordPlanRepositoryPort,
  type ProjectSeoSettingsPort,
  type PromptTemplatePort,
  type SeoAnalysisAgentPort,
  type SeoBriefStorePort,
  type TagRepositoryPort,
  type TopicClusterStorePort,
  type UserProjectConfigPort,
} from '../../ports/out';
import { buildSeoAnalysisPoml } from '../../prompts/seo-analysis.prompt';
import { SeoDataEnrichmentService } from '../../services/seo/seo-data-enrichment.service';
import { SeoBriefOrchestrator } from '../../services/seo/seobrief-orchestrator.service';
import { TrendScoreService } from '../../services/seo/trend-score.service';
import { createLogger } from '../../utils/logger';
import { ManageTopicClustersUseCase } from '../manage-topic-clusters.usecase';
import { PersistKeywordPlanUseCase } from '../persist-keyword-plan.usecase';

const logger = createLogger('SeoAnalysisUseCase');

// Utiliser TopicSelectorSeoSummaryDTO étendu pour la réponse d'enrichissement IA

// Constantes de configuration (config-driven à terme)
const RELATED_KEYWORDS_DEPTH = 2; // Profondeur de recherche DataForSEO
const SERP_TOPK = 5; // Nombre de concurrents SERP à analyser

/**
 * Dépendances du SeoAnalysisUseCase (complète comme GenerateArticleLinearUseCaseDeps)
 */
export interface SeoAnalysisUseCaseDeps {
  // Obligatoires
  aiTextModel: AITextModelPort;
  promptTemplate: PromptTemplatePort;
  googleScraping: GoogleScrapingPort;
  googleTrends: GoogleTrendsPort;
  keywordEnrichment: KeywordEnrichmentPort;
  domainAnalysis: DomainAnalysisPort;

  // Optionnels
  configReader?: UserProjectConfigPort;
  projectSettings?: ProjectSeoSettingsPort;
  seoAnalysisAgent?: SeoAnalysisAgentPort;
  keywordPlanRepo?: KeywordPlanRepositoryPort;
  tagRepository?: TagRepositoryPort;
  seoBriefStore?: SeoBriefStorePort;
  topicClusterStore?: TopicClusterStorePort;

  // Services composés optionnels (instanciés à la volée si non fournis)
  data?: SeoDataEnrichmentService;
  trend?: TrendScoreService;
  brief?: SeoBriefOrchestrator;
}

export class SeoAnalysisUseCase implements SeoAnalysisPort {
  private readonly persistKeywordPlanUseCase: PersistKeywordPlanUseCase;
  private readonly manageTopicClustersUseCase?: ManageTopicClustersUseCase;

  // Services composés (instanciés à la volée si non fournis)
  private readonly dataService: SeoDataEnrichmentService;
  private readonly trendService: TrendScoreService;
  private readonly briefOrchestrator?: SeoBriefOrchestrator;

  /**
   * Factory method pour créer une instance avec deps
   */
  static create(deps: SeoAnalysisUseCaseDeps): SeoAnalysisUseCase {
    return new SeoAnalysisUseCase(deps);
  }

  constructor(private readonly deps: SeoAnalysisUseCaseDeps) {
    // Fail-fast : vérifier les deps obligatoires
    if (!deps.aiTextModel || !deps.promptTemplate || !deps.googleScraping) {
      throw new Error(
        '[SeoAnalysisUseCase] deps obligatoires manquantes: aiTextModel, promptTemplate, googleScraping'
      );
    }

    if (!deps.keywordPlanRepo) {
      throw new Error('[SeoAnalysisUseCase] keywordPlanRepo est obligatoire');
    }

    // Instancier les use cases internes
    this.persistKeywordPlanUseCase = new PersistKeywordPlanUseCase(deps.keywordPlanRepo);

    if (deps.topicClusterStore) {
      this.manageTopicClustersUseCase = new ManageTopicClustersUseCase(deps.topicClusterStore);
    }

    // Instancier les services composés (ou utiliser ceux fournis)
    this.dataService =
      deps.data ??
      new SeoDataEnrichmentService(deps.keywordEnrichment, deps.googleTrends, deps.googleScraping);

    this.trendService = deps.trend ?? new TrendScoreService();

    if (deps.seoBriefStore && deps.seoAnalysisAgent) {
      this.briefOrchestrator = deps.brief ?? new SeoBriefOrchestrator(deps.seoBriefStore);
    }
  }

  async execute(input: SeoAnalysisCommand): Promise<SeoAnalysisResult> {
    const { tenantId, projectId, language, forceRegenerateKeywordPlans = false } = input;

    if (!tenantId?.trim() || !projectId?.trim()) {
      throw new Error('tenantId et projectId requis');
    }

    if (!language?.trim()) {
      throw new Error('language requis dans la commande');
    }

    if (!this.deps.configReader) {
      throw new Error('[SeoAnalysisUseCase] configReader requis');
    }
    const projectConfig: ProjectConfig = await this.deps.configReader.getProjectConfig(
      tenantId,
      projectId
    );
    if (!projectConfig) {
      throw new Error('ProjectConfig introuvable');
    }
    if (!projectConfig.generation?.seoAnalysis?.template?.trim()) {
      throw new Error('Template SEO non configuré dans ProjectConfig');
    }
    const templatePath = projectConfig.generation.seoAnalysis.template;

    try {
      // Lire le contexte SEO depuis le VO domaine (source unique)
      if (!this.deps.projectSettings) {
        throw new Error('[SeoAnalysisUseCase] projectSettings requis');
      }
      const settings: ProjectSeoSettings = await this.deps.projectSettings.getSeoProjectSettings(
        tenantId,
        projectId
      );
      const seoKeywords: string[] = Array.from(
        new Set((settings.seedKeywords ?? []).map((s: string) => String(s).trim()).filter(Boolean))
      );
      if (seoKeywords.length === 0) {
        throw new Error('seedKeywords requis dans la configuration projet');
      }

      // Déterminer la région depuis la langue du projet (fail-fast si non supportée)
      const region = mapLanguageToRegion(String(language ?? '').trim());
      const _industry = String(settings.industry ?? '');
      const _targetAudience = String(settings.targetAudience ?? '');
      const contentType = String(settings.contentType ?? 'article');
      const businessDescription = String(settings.businessDescription ?? '');

      // 1. ENRICHISSEMENT DATA4SEO D'ABORD (données réelles)
      logger.debug('Étape 1: Enrichissement DataForSEO (données réelles)');

      // 1a. Keywords metrics (volume, difficulté, CPC)
      const keywordMetrics = await this.dataService.getKeywordMetrics(seoKeywords, region);
      logger.debug('Keywords enrichis', { count: keywordMetrics.length });

      // 1b. Centraliser la persistance des seeds au niveau projet (KeywordTag {source:'seed'})
      try {
        if (this.deps.tagRepository && seoKeywords.length > 0) {
          await this.deps.tagRepository.upsertProjectSeedTags({
            tenantId,
            projectId,
            seeds: seoKeywords.map(k => ({ label: k, slug: normalizeKeyword(k), source: 'seed' })),
          });
        }
      } catch (e) {
        logger.warn('upsertProjectSeedTags a échoué (non bloquant)', e);
      }

      // 1c. KeywordPlans: Découvrir et persister les related keywords par seed
      logger.debug('Création des KeywordPlans par seed...');
      const allRelatedKeywords: KeywordMetricsDTO[] = [];
      const allExistingPlanIds: string[] = [];

      for (const seed of seoKeywords) {
        const seedNormalized = normalizeKeyword(seed);

        // Vérifier si un KeywordPlan existe déjà pour ce seed
        const existingPlan = await this.deps.keywordPlanRepo!.getKeywordPlanBySeed({
          tenantId,
          projectId,
          seedNormalized,
        });

        if (existingPlan && !forceRegenerateKeywordPlans) {
          logger.debug(`KeywordPlan existe déjà pour seed="${seed}", skip`, {
            planId: existingPlan.planId,
          });
          allExistingPlanIds.push(existingPlan.planId);
          continue;
        }

        logger.debug(`Discovering related keywords pour seed="${seed}"`, {
          mode: forceRegenerateKeywordPlans ? 'FORCE' : 'NEW',
        });

        // Découvrir les related keywords pour CE seed uniquement (pas de limite)
        const relatedForThisSeed = await this.dataService.getRelatedKeywords([seed], region, {
          depth: RELATED_KEYWORDS_DEPTH,
        });

        logger.debug(`Related keywords discovered pour seed="${seed}"`, {
          count: relatedForThisSeed.length,
        });

        // Accumuler pour l'IA plus tard
        allRelatedKeywords.push(...relatedForThisSeed);

        // Transformer en KeywordTags (source: 'related_keywords')
        const now = new Date().toISOString();
        const keywordTags: KeywordTagDTO[] = relatedForThisSeed.map(kw => ({
          label: kw.keyword,
          slug: slugifyKeyword(kw.keyword), // ✅ VO centralisé
          source: 'related_keywords' as const,
          sources: ['related_keywords' as const], // Historique des sources
          createdAt: now,
          updatedAt: now,
          searchVolume: kw.searchVolume,
          difficulty: kw.difficulty,
          cpc: kw.cpc,
          competition: kw.competition,
          lowTopOfPageBid: kw.lowTopOfPageBid,
          highTopOfPageBid: kw.highTopOfPageBid,
          monthlySearches: kw.monthlySearches,
        }));

        // Persister le KeywordPlan pour ce seed
        const planHash = `seo-${seedNormalized}-${Date.now()}`;
        try {
          const persistResult = await this.persistKeywordPlanUseCase.execute({
            tenantId,
            projectId,
            plan: { tags: keywordTags },
            planHash,
            seedNormalized,
          });
          logger.log(`KeywordPlan créé pour seed="${seed}"`, {
            planId: persistResult.planId,
            tagsCount: persistResult.tagsCount,
          });
        } catch (persistError) {
          logger.error(`Échec création KeywordPlan pour seed="${seed}"`, persistError);
        }
      }

      // Charger les tags de TOUS les plans existants (pas seulement ceux créés maintenant)
      const allPlanTags: KeywordTagDTO[] = [];
      for (const planId of allExistingPlanIds) {
        try {
          const plan = await this.deps.keywordPlanRepo!.getKeywordPlanById({
            planId,
            tenantId,
            projectId,
          });
          if (plan?.tags) {
            // Filtrer les tags avec slug défini pour correspondre à KeywordTagDTO
            const validTags = plan.tags.filter((t): t is KeywordTagDTO => !!t.slug);
            allPlanTags.push(...validTags);
          }
        } catch (e) {
          logger.warn(`Échec chargement plan ${planId} (non bloquant)`, e);
        }
      }

      logger.log('KeywordPlans créés/vérifiés', {
        seedsCount: seoKeywords.length,
        newRelatedKeywords: allRelatedKeywords.length,
        existingPlansLoaded: allExistingPlanIds.length,
        existingPlanTagsCount: allPlanTags.length,
      });

      // 1d. SERP analysis (top concurrents sur les keywords)
      // 2. SERP SCRAPING (concurrents)
      logger.debug('Étape 2: SERP scraping (concurrents)');
      const competitors = await this.dataService.scrapeTopCompetitors(
        seoKeywords,
        region,
        SERP_TOPK
      );

      // 3. GOOGLE TRENDS (tendances)
      logger.debug('Étape 3: Google Trends (tendances)');
      const trends = await this.dataService.getTrends(seoKeywords, region);
      if (!trends?.length) {
        throw new Error('TrendData manquant');
      }

      // 1f. Liste complète pour l'IA: seeds + TOUS les related keywords (nouveaux + existants)
      // Filtrer pour ne garder que les keywords avec métriques valides (searchVolume, difficulty, cpc)
      const discoveredKeywords = allRelatedKeywords
        .filter(k => k.searchVolume > 0 && k.difficulty >= 0 && (k.cpc ?? 0) > 0)
        .map(k => k.keyword);

      const existingPlanKeywords = allPlanTags
        .filter(t => (t.searchVolume ?? 0) > 0 && (t.difficulty ?? -1) >= 0 && (t.cpc ?? 0) > 0)
        .map(t => t.label);

      const fullKeywordList = Array.from(
        new Set([...(seoKeywords ?? []), ...discoveredKeywords, ...existingPlanKeywords])
      );

      logger.log('📊 Keywords totaux pour IA', {
        count: fullKeywordList.length,
        seeds: seoKeywords.length,
        newRelatedTotal: allRelatedKeywords.length,
        newRelatedWithMetrics: discoveredKeywords.length,
        existingPlanTagsTotal: allPlanTags.length,
        existingPlanTagsWithMetrics: existingPlanKeywords.length,
      });

      // 2. IA SYNTHÉTISE LES DONNÉES RÉELLES (brief)
      logger.debug('Étape 2: IA génère le brief à partir des données réelles');

      const enrichmentResult = await this.enrichWithAI(
        {
          keywords: fullKeywordList,
          language: language,
          businessDescription,
          keywordMetrics, // ← Données réelles
          competitorTitles: competitors.map(c => c.title ?? ''),
          trendData: trends,
          contentGaps: [],
        },
        projectConfig,
        templatePath,
        tenantId,
        projectId
      );

      // 3. MERGER LES MÉTRIQUES RÉELLES AVEC LES TAGS IA
      logger.debug('Étape 3: Merger métriques réelles avec tags IA');

      // Créer une map des métriques pour lookup rapide (seeds + related keywords)
      const metricsMap = new Map(keywordMetrics.map(m => [m.keyword.toLowerCase(), m]));
      // Ajouter les métriques des related keywords découverts
      for (const relatedKw of allRelatedKeywords) {
        if (!metricsMap.has(relatedKw.keyword.toLowerCase())) {
          metricsMap.set(relatedKw.keyword.toLowerCase(), relatedKw);
        }
      }

      // Enrichir les tags avec les métriques réelles de DataForSEO
      logger.debug('🎯 IA a retourné des keywords', {
        count: enrichmentResult.keywordPlan.tags.length,
      });

      // Compléter les métriques pour les mots-clés renvoyés par l'IA qui n'étaient ni seeds ni related
      try {
        const aiKeywordLabels = Array.from(
          new Set(
            (enrichmentResult.keywordPlan.tags || [])
              .map(t => String(t.label || '').trim())
              .filter(Boolean)
          )
        );
        const missingForMetrics = aiKeywordLabels.filter(kw => !metricsMap.has(kw.toLowerCase()));
        if (missingForMetrics.length > 0) {
          const metrics = await this.dataService.getKeywordMetrics(missingForMetrics, region);
          for (const m of metrics) {
            const key = String(m.keyword || '').toLowerCase();
            if (!key) continue;
            if (!metricsMap.has(key)) metricsMap.set(key, m);
          }
          logger.debug('Métriques complétées pour keywords IA manquants', {
            requested: missingForMetrics.length,
            received: metrics.length,
          });
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        const errorStack = e instanceof Error ? e.stack : undefined;
        logger.error('Complétion des métriques IA a échoué', {
          error: errorMsg,
          stack: errorStack,
          aiKeywordsCount: enrichmentResult.keywordPlan.tags.length,
        });
      }

      const briefCreatedAt = new Date().toISOString();

      // DEBUG: Voir pourquoi le matching échoue
      logger.debug('🔍 Matching métriques', {
        metricsMapKeys: Array.from(metricsMap.keys()).slice(0, 5),
        aiLabels: enrichmentResult.keywordPlan.tags.slice(0, 5).map(t => t.label.toLowerCase()),
      });

      const enrichedTags = enrichmentResult.keywordPlan.tags.map(tag => {
        const realMetrics = metricsMap.get(tag.label.toLowerCase());

        // Sources: IA a sélectionné (opportunity) + métriques de DataForSEO (related_keywords)
        const tagSources: ('opportunity' | 'related_keywords')[] = ['opportunity' as const];
        if (realMetrics) {
          tagSources.push('related_keywords' as const);
        }

        // Créer un tag enrichi avec les métriques réelles DataForSEO
        const enrichedTag: KeywordTagDTO = {
          label: tag.label,
          slug: tag.slug ?? slugifyKeyword(tag.label),
          source: tag.source ?? ('opportunity' as const),
          sources: tagSources, // Historique des sources
          weight: tag.weight,
          createdAt: briefCreatedAt,
          updatedAt: briefCreatedAt,
          // Métriques SEO réelles depuis DataForSEO
          searchVolume: realMetrics?.searchVolume,
          difficulty: realMetrics?.difficulty,
          cpc: realMetrics?.cpc,
          competition: realMetrics?.competition,
          lowTopOfPageBid: realMetrics?.lowTopOfPageBid,
          highTopOfPageBid: realMetrics?.highTopOfPageBid,
          monthlySearches: realMetrics?.monthlySearches,
        };

        return enrichedTag;
      });

      logger.debug('💎 Tags enrichis avec métriques', {
        enrichedCount: enrichedTags.length,
      });

      const enrichedKeywordPlan: KeywordPlanDTO = {
        tags: enrichedTags,
        // KeywordPlan is just tags - SEO insights go to SeoBrief via searchIntent
      };

      // IMPORTANT: Créer le SeoBrief AVANT les KeywordPlans pour pouvoir les lier
      let seoBriefId: string | undefined;
      const briefDataV3: SeoBriefDataV3 = buildSeoBriefDataV3(enrichmentResult, enrichedTags);
      if (this.deps.seoBriefStore) {
        try {
          logger.debug('📦 briefDataV3 construit', {
            keywordTagsCount: briefDataV3.keywordTags.length,
            hasTopicClusters: !!briefDataV3.contentStrategy.topicClusters,
          });

          // ✅ v3 native: Pas de conversion, passage direct du v3
          const seobrief = this.deps?.brief ?? new SeoBriefOrchestrator(this.deps.seoBriefStore);
          const result = await seobrief.persistProjectBrief({
            tenantId,
            projectId,
            seoBriefData: briefDataV3, // ← Directement v3, plus de conversion!
          });
          seoBriefId = result.seoBriefId;
          logger.log('✅ SeoBrief créé et persisté', { seoBriefId });

          // NOUVEAU: Enrichir et sauvegarder les TopicClusters générés par l'IA (avec métriques)
          logger.debug('🔍 Diagnostic TopicClusters', {
            hasManageUseCase: !!this.manageTopicClustersUseCase,
            hasClusters: !!briefDataV3.contentStrategy.topicClusters,
            clustersCount: briefDataV3.contentStrategy.topicClusters?.length ?? 0,
          });
          if (this.manageTopicClustersUseCase && briefDataV3.contentStrategy.topicClusters) {
            try {
              const clustersIn: TopicCluster[] = briefDataV3.contentStrategy.topicClusters ?? [];

              // 1) Collecte des labels (piliers + satellites)
              const labelsSet = new Set<string>();
              for (const c of clustersIn) {
                const pillarLabel = c.pillarTag?.label;
                if (pillarLabel) labelsSet.add(pillarLabel);
                const satelliteLabels = (c.satelliteTags ?? []).map(t => t.label).filter(Boolean);
                satelliteLabels.forEach(l => labelsSet.add(l));
              }

              // 2) Enrichissement des métriques en batch (DataForSEO)
              const regionForClusters = mapLanguageToRegion(String(language));
              const allLabels = Array.from(labelsSet);
              const metricsArr =
                allLabels.length > 0
                  ? await this.dataService.getKeywordMetrics(allLabels, regionForClusters)
                  : [];
              const metricsMap = new Map(
                metricsArr.map((m: KeywordMetricsDTO) => [normalizeKeyword(String(m.keyword)), m])
              );

              const enrichTag = (label: string, source: 'pillar' | 'satellite') => {
                // TOUJOURS régénérer le slug pour garantir cohérence (ne pas faire confiance à l'IA)
                const slug = slugifyKeyword(label);
                const m = metricsMap.get(normalizeKeyword(label));
                return {
                  label,
                  slug,
                  source,
                  // metrics SEO si disponibles
                  searchVolume: m?.searchVolume,
                  difficulty: m?.difficulty,
                  cpc: m?.cpc,
                  competition: m?.competition,
                  lowTopOfPageBid: m?.lowTopOfPageBid,
                  highTopOfPageBid: m?.highTopOfPageBid,
                  monthlySearches: m?.monthlySearches,
                  updatedAt: new Date().toISOString(),
                };
              };

              // 3) Reconstruire les clusters enrichis (V3 strict, legacy dérivé depuis V3)
              const enrichedClusters = clustersIn.map(c => {
                const pillarLabel = c.pillarTag?.label ?? '';
                const pillarTag = pillarLabel ? enrichTag(pillarLabel, 'pillar') : undefined;

                const satelliteLabels = (c.satelliteTags ?? []).map(t => t.label).filter(Boolean);
                const satelliteTags = satelliteLabels.map(l => enrichTag(l, 'satellite'));

                return {
                  // legacy (dérivé depuis V3 pour compat éventuelle)
                  pillarKeyword: pillarTag?.label,
                  clusterKeywords: satelliteLabels,
                  // v3 enrichi
                  pillarTag,
                  satelliteTags,
                };
              });

              // DEBUG: Voir quels clusters sont envoyés à la persistance
              logger.debug('🔍 Clusters à persister', {
                clustersCount: enrichedClusters.length,
              });

              // 4) Persistance avec métriques
              const clusterIds = await this.manageTopicClustersUseCase.saveTopicClusters({
                tenantId,
                projectId,
                clusters: enrichedClusters,
                seoBriefId,
              });

              logger.log('✅ TopicClusters créés et liés au SeoBrief', {
                seoBriefId,
                clusterIds,
                clustersCount: enrichedClusters.length,
              });
            } catch (e) {
              const errorMsg = e instanceof Error ? e.message : String(e);
              const errorStack = e instanceof Error ? e.stack : undefined;
              logger.warn('Échec création TopicClusters (non bloquant)', {
                error: errorMsg,
                stack: errorStack,
                hasClusters: !!briefDataV3.contentStrategy.topicClusters,
              });
            }
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          const errorStack = e instanceof Error ? e.stack : undefined;
          logger.error('❌ Échec création SeoBrief', {
            error: errorMsg,
            stack: errorStack,
            enrichedTagsCount: enrichedTags.length,
            hasSeoBriefStore: !!this.deps.seoBriefStore,
          });
        }
      }

      // Note: Les KeywordPlans ont déjà été créés plus haut (section 1c)
      // TopicClusters sont sauvegardés avec relations vers KeywordTags (réutilisation des metrics SEO)

      // 4. CONSTRUCTION DU DTO FINAL
      logger.debug('Étape 4: Construction SeoAnalysisResultDTO final');

      const now = new Date().toISOString();

      // Calculer trendScore basé sur les tendances
      const trendScore = this.trendService.compute(trends);

      // Filtrer les competitors avec title défini
      const validCompetitors = competitors.map(c => ({
        ...c,
        title: c.title ?? 'Untitled',
      }));

      const completeSeoAnalysisResultDTO: SeoAnalysisResultDTO = {
        id: `seo-${Date.now()}`,
        language: language,
        createdAt: now,
        keywordPlan: enrichedKeywordPlan,
        seoBriefData: toSeoBriefDataDTO(briefDataV3),
        competitors: validCompetitors,
        trends: trends,
        competitionScore: 0.5, // TODO: calculer depuis concurrent analysis
        trendScore,
        contentType: contentType,
        analysisDate: now,
        dataSource: 'ai_plus_dataforseo',
      };

      logger.log('✅ Analyse SEO terminée', {
        keywordsCount: completeSeoAnalysisResultDTO.keywordPlan.tags.length,
        intent: enrichmentResult.searchIntent?.intent,
        competitorCount: completeSeoAnalysisResultDTO.competitors.length,
        trendsCount: completeSeoAnalysisResultDTO.trends.length,
      });

      // Lier le SeoBrief au BusinessContext V3 enrichi et au Projet
      if (seoBriefId && this.deps.seoBriefStore) {
        try {
          const seobrief = this.deps?.brief ?? new SeoBriefOrchestrator(this.deps.seoBriefStore);

          // V3: BusinessContext enrichi (mapper centralisé)
          const businessContextV3 = buildBusinessContextV3(projectConfig, settings);

          await seobrief.linkToBusinessContext({
            tenantId,
            projectId,
            seoBriefId,
            businessContext: businessContextV3,
          });
          await seobrief.linkToProject({ tenantId, projectId, seoBriefId });
        } catch (e) {
          logger.warn('[SeoAnalysisUseCase] Persistance du SeoBrief échouée (non bloquant)', e);
        }
      }

      // Mapper le DTO interne vers le type core SeoAnalysisResult
      const resultCore: SeoAnalysisResult = {
        id: completeSeoAnalysisResultDTO.id,
        language: completeSeoAnalysisResultDTO.language,
        createdAt: completeSeoAnalysisResultDTO.createdAt,
        keywordPlan: {
          tags: completeSeoAnalysisResultDTO.keywordPlan.tags.map(mapKeywordTagDTOToCore),
          // SEO insights are in searchIntent, not in keywordPlan
        },
        searchIntent: mapSearchIntentDTOToCore(enrichmentResult.searchIntent),
        competitors: completeSeoAnalysisResultDTO.competitors.map(mapCompetitorDTOToCore),
        trends: completeSeoAnalysisResultDTO.trends.map(mapTrendDTOToCore),
        competitionScore: completeSeoAnalysisResultDTO.competitionScore ?? 0.5,
        trendScore: completeSeoAnalysisResultDTO.trendScore ?? 0,
        contentType: completeSeoAnalysisResultDTO.contentType ?? 'article',
        analysisDate: completeSeoAnalysisResultDTO.analysisDate,
        dataSource: completeSeoAnalysisResultDTO.dataSource,
      };

      return resultCore;
    } catch (error) {
      logger.error("[SeoAnalysisUseCase] Erreur lors de l'analyse SEO", error);
      throw error;
    }
  }

  private async enrichWithAI(
    input: {
      keywords: string[];
      language: string;
      businessDescription: string;
      keywordMetrics?: KeywordMetricsDTO[];
      competitorTitles: string[];
      trendData: TrendDataDTO[];
      contentGaps: string[];
    },
    projectConfig: ProjectConfig,
    templatePath: string,
    tenantId: string,
    projectId: string
  ): Promise<SeoAnalysisAgentOutputDTO> {
    // 1. Configuration SEO - FAIL-FAST si manquante
    if (!projectConfig.generation?.seoAnalysis) {
      throw new Error('[SeoAnalysisUseCase] Configuration SEO manquante dans ProjectConfig');
    }
    if (!projectConfig.generation.seoAnalysis.industry?.trim()) {
      throw new Error('[SeoAnalysisUseCase] Industry manquant dans configuration SEO');
    }
    if (!projectConfig.generation.seoAnalysis.targetAudience?.trim()) {
      throw new Error('[SeoAnalysisUseCase] TargetAudience manquant dans configuration SEO');
    }

    const projectContext = {
      industry: projectConfig.generation.seoAnalysis.industry,
      targetAudience: projectConfig.generation.seoAnalysis.targetAudience,
      contentType: projectConfig.generation.seoAnalysis.contentType ?? 'article',
    };

    // 2. Enrichissement des paramètres avec mapping XML
    const enrichedInput = {
      ...input,
      projectContext,
      maxKeywords: 15,
      targetAudience: projectContext.targetAudience,
    };

    // Mapper vers les paramètres POML (inclure les données initiales collectées)
    const commandForPrompt: SeoAnalysisCommandDTO = {
      tenantId,
      projectId,
      language: enrichedInput.language,
      keywords: enrichedInput.keywords,
    };
    const promptParams = mapCommandToSeoAnalysisPromptDTO(commandForPrompt, projectConfig);

    // Enrichir avec les données DataForSEO pour le prompt
    const enrichedPromptParams = {
      ...promptParams,
      keywordMetrics: input.keywordMetrics,
      competitorTitles: input.competitorTitles,
      trendData: input.trendData,
    };

    // 3. Construction du prompt POML avec données data-driven
    const poml = await buildSeoAnalysisPoml(
      this.deps.promptTemplate,
      templatePath,
      enrichedPromptParams
    );
    if (!poml?.trim()) {
      throw new Error('[SeoAnalysisUseCase] Échec génération du prompt POML');
    }

    // 4. Appel agent SEO avec POML (parsing et validation inclus)
    logger.debug('SeoAnalysisUseCase: appel SeoAnalysisAgent');

    if (!this.deps.seoAnalysisAgent!.analyze) {
      throw new Error('[SeoAnalysisUseCase] SeoAnalysisAgent.analyze non disponible');
    }

    const aiResult = (await this.deps.seoAnalysisAgent!.analyze(poml)) as SeoAnalysisAgentOutputDTO;

    // Validation stricte des résultats - FAIL-FAST
    if (!aiResult.keywordPlan?.tags?.length) {
      throw new Error('[SeoAnalysisUseCase] IA a retourné aucun tag dans keywordPlan');
    }
    if (!aiResult.searchIntent?.intent) {
      throw new Error('[SeoAnalysisUseCase] IA a retourné une intention de recherche invalide');
    }

    return aiResult;
  }
}
