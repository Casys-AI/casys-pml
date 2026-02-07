import {
  type AnalyzeExistingArticlePort,
  type ArticleKeywordsMetricsPort,
  type ArticleStructure,
  createKeywordTag,
  type IndexArticleFromRepoPort,
  type KeywordTag,
  type SeoAnalysisPort,
  type SeoKeywordsMetricsPort,
  type Topic,
  TopicFromUrlsBuilder,
} from '@casys/core';

import type {
  ArticleIndexingUpsertPort,
  ArticleParserPort,
  ArticleReadPort,
  ArticleStructureRepositoryPort,
  EditorialAngleAgentPort,
  EditorialBriefStorePort,
  KeywordPlanRepositoryPort,
  ProjectSeoSettingsPort,
  SeoBriefStorePort,
  TagRepositoryPort,
  TopicDiscoveryPort,
  TopicRelationsPort,
  TopicRepositoryPort,
} from '../../ports/out';
import { ArticleReaderService } from '../../services/article/article-reader.service';
import { TagLinkingService } from '../../services/article/tag-linking.service';
import { applicationLogger as logger } from '../../utils/logger';
import { CreateEditorialBriefUseCase } from '../create-editorial-brief.usecase';
import type { EnsureTenantProjectUseCase } from '../ensure-tenant-project.usecase';
import { detectLanguageFromArticle } from './helpers';
import { LinkInternalReferencesUseCase } from './link-internal-references.usecase';
import { LinkSectionsToTopicsUseCase } from './link-sections-topics.usecase';
import { LinkTopicsToKeywordTagsUseCase } from './link-topics-to-keywordtags.usecase';
import type { SyncArticlesFromGithubUseCase } from './sync-articles-from-github.usecase';
import type { AnalyzeExistingArticleCommand, AnalyzeExistingArticleResult } from './types';

export interface AnalyzeExistingArticleDeps {
  articleStore: ArticleIndexingUpsertPort;
  articleReader: ArticleReadPort;
  githubRepository?: ArticleStructureRepositoryPort;
  projectSettings: ProjectSeoSettingsPort;
  articleParser: ArticleParserPort;
  seoAnalysisUseCase: SeoAnalysisPort;
  seoKeywordsMetricsUseCase?: SeoKeywordsMetricsPort;
  articleKeywordsMetricsUseCase?: ArticleKeywordsMetricsPort;
  keywordPlanRepo: KeywordPlanRepositoryPort;
  tagRepository: TagRepositoryPort;
  topicRepository: TopicRepositoryPort;
  topicRelations: TopicRelationsPort;
  ensureTenantProject: EnsureTenantProjectUseCase;
  seoBriefStore: SeoBriefStorePort;
  topicDiscovery: TopicDiscoveryPort;
  syncArticlesFromGithub?: SyncArticlesFromGithubUseCase;
  editorialAngleAgent?: EditorialAngleAgentPort;
  editorialBriefStore?: EditorialBriefStorePort;
  indexArticleFromRepo: IndexArticleFromRepoPort;
}

export class AnalyzeExistingArticleUseCase implements AnalyzeExistingArticlePort {
  static create(deps: AnalyzeExistingArticleDeps): AnalyzeExistingArticleUseCase {
    return new AnalyzeExistingArticleUseCase(
      deps.articleStore,
      deps.articleReader,
      deps.githubRepository,
      deps.projectSettings,
      deps.articleParser,
      deps.seoAnalysisUseCase,
      deps.seoKeywordsMetricsUseCase,
      deps.articleKeywordsMetricsUseCase,
      deps.keywordPlanRepo,
      deps.tagRepository,
      deps.topicRepository,
      deps.topicRelations,
      deps.ensureTenantProject,
      deps.seoBriefStore,
      deps.topicDiscovery,
      deps.indexArticleFromRepo,
      deps.syncArticlesFromGithub,
      deps.editorialAngleAgent,
      deps.editorialBriefStore
    );
  }

  constructor(
    // Store pour CRÉER les relations (Section)-[:REFERENCES]->(Article)
    private readonly articleStore: ArticleIndexingUpsertPort,
    // Port pour LIRE les articles (store/Kuzu)
    private readonly articleReader: ArticleReadPort,
    // Repo GitHub optionnel
    private readonly githubRepository: ArticleStructureRepositoryPort | undefined,
    // Config projet SEO (seedKeywords, businessContext, language)
    private readonly projectSettings: ProjectSeoSettingsPort,
    // Parser pour extraire les liens internes/externes des sections
    private readonly articleParser: ArticleParserPort,
    // Analyse SEO projet (sur seeds)
    private readonly seoAnalysisUseCase: SeoAnalysisPort,
    // Metrics-only use cases (optionnels)
    private readonly seoKeywordsMetricsUseCase: SeoKeywordsMetricsPort | undefined,
    private readonly articleKeywordsMetricsUseCase: ArticleKeywordsMetricsPort | undefined,
    // Repo de KeywordPlan pour relire les tags des plans de cette exécution
    private readonly keywordPlanRepo: KeywordPlanRepositoryPort,
    // Persistance des tags d'article (création des nœuds Tag et lien à l'article)
    private readonly tagRepository: TagRepositoryPort,
    // Topics + relations
    private readonly topicRepository: TopicRepositoryPort,
    private readonly topicRelations: TopicRelationsPort,
    // Création/enrichissement nœuds Tenant/Project depuis config
    private readonly ensureTenantProject: EnsureTenantProjectUseCase,
    // Persistance SeoBriefData pour l'article
    private readonly seoBriefStore: SeoBriefStorePort,
    // Découverte SERP (non utilisée dans le flux link-driven)
    private readonly topicDiscovery: TopicDiscoveryPort,
    private readonly indexArticleFromRepo: IndexArticleFromRepoPort,
    // Optionnel: synchroniser le catalogue GitHub → Kuzu avant l'analyse
    private readonly syncArticlesFromGithub?: SyncArticlesFromGithubUseCase,
    // Angle agent (obligatoire pour créer le brief, pas de fallback)
    private readonly editorialAngleAgent?: EditorialAngleAgentPort,
    // Store du brief éditorial
    private readonly editorialBriefStore?: EditorialBriefStorePort
  ) {}

  /**
   * Exécution principale (fail-fast). Voir le header pour le workflow détaillé.
   */
  async execute(command: AnalyzeExistingArticleCommand): Promise<AnalyzeExistingArticleResult> {
    const start = Date.now();
    const { articleId, tenantId, projectId, dryRun = false } = command;

    if (!articleId?.trim() || !tenantId?.trim() || !projectId?.trim()) {
      throw new Error('[AnalyzeExistingArticle] articleId, tenantId et projectId sont requis');
    }

    // (Angle + Brief) moved later after seoBriefData persistence

    // 0) Créer/enrichir les nœuds Tenant et Project depuis la config
    await this.ensureTenantProject.execute({ tenantId, projectId });

    // 0bis) Synchroniser les articles GitHub → Graph DB pour garantir un index à jour (optionnel)
    try {
      const doSync = command.syncBefore === true; // défaut: false (opt-in uniquement)
      if (doSync && this.syncArticlesFromGithub) {
        await this.syncArticlesFromGithub.execute(tenantId, projectId);
        logger.debug?.('[AnalyzeExistingArticle] Sync GitHub → Neo4j exécutée (syncBefore=true)');
      }
    } catch (e) {
      logger.warn?.('[AnalyzeExistingArticle] Sync GitHub → Neo4j: échec (non bloquant)', e);
    }

    // 1) Lire l'article (Article + Sections) via service lecteur (config/CLI-driven)
    const readerSvc = new ArticleReaderService(this.articleReader, this.githubRepository);
    const article: ArticleStructure = await readerSvc.execute({
      articleId,
      tenantId,
      projectId,
      skipGithubRead: command.skipGithubRead,
    });
    if (!dryRun) {
      await this.indexArticleFromRepo.execute({
        kind: 'parsed',
        tenantId,
        projectId,
        article,
        dryRun: false,
      });
    }

    // 1bis) Préparer les tags parsés (frontmatter/contenu) — création différée après SEO
    const parserRawTags: string[] = Array.isArray(article.article?.keywords)
      ? article.article.keywords.map(t => String(t).trim()).filter(Boolean)
      : [];

    // 2) Récupérer ProjectSeoSettings (source de vérité pour keywords stratégiques)
    const settings = await this.projectSettings.getSeoProjectSettings(tenantId, projectId);
    const seedKeywords = Array.from(
      new Set((settings.seedKeywords ?? []).map(s => String(s).trim()).filter(Boolean))
    );

    if (seedKeywords.length === 0) {
      throw new Error(
        '[AnalyzeExistingArticle] seedKeywords requis dans ProjectSeoSettings. ' +
          "Exécuter LeadAnalysisUseCase ou configurer manuellement avant d'analyser des articles."
      );
    }

    // 3) Détecter la langue depuis l'article (validation vs config)
    const detectedLang = detectLanguageFromArticle(article);
    const configLang = settings.language?.toLowerCase() || 'en';
    if (detectedLang !== configLang) {
      logger.warn?.(
        `[AnalyzeExistingArticle] Langue article (${detectedLang}) différente de la config (${configLang})`
      );
    }

    // 3bis) Metrics-only: enrichir/persister KeywordPlans (seeds + related) sans IA/SeoBrief
    let planIdsFromRun: string[] = [];
    if (this.seoKeywordsMetricsUseCase) {
      try {
        const mres = await this.seoKeywordsMetricsUseCase.execute({
          tenantId,
          projectId,
          language: configLang,
          seedsOverride: seedKeywords,
          depth: 2,
          forceRegenerate: false,
          dryRun,
        });
        planIdsFromRun = mres.planIds ?? [];
      } catch (e) {
        logger.warn?.(
          '[AnalyzeExistingArticle] SeoKeywordsMetricsUseCase a échoué (non bloquant)',
          e
        );
      }
    }

    // 3ter) Upsert unique des tags parsés APRES le SEO (shortlist)

    if (!dryRun && parserRawTags.length > 0) {
      logger.log('[AnalyzeExistingArticle] Upserting article tags from frontmatter', {
        articleId,
        tagsCount: parserRawTags.length,
        tags: parserRawTags,
      });
      const tagLinking = new TagLinkingService(this.tagRepository);
      const keywordTags = parserRawTags.map(l => createKeywordTag(l, { source: 'article' }));
      await tagLinking.upsertAndLinkKeywordTags({
        tenantId,
        projectId,
        articleId,
        tags: keywordTags,
      });
      // Enrichir les keywords d'article avec métriques DataForSEO (metrics-only)
      if (this.articleKeywordsMetricsUseCase) {
        try {
          await this.articleKeywordsMetricsUseCase.execute({
            tenantId,
            projectId,
            language: configLang,
            labels: parserRawTags,
            articleId,
            dryRun,
          });
        } catch (e) {
          logger.warn?.(
            '[AnalyzeExistingArticle] ArticleKeywordsMetricsUseCase a échoué (non bloquant)',
            e
          );
        }
      }
      logger.log('[AnalyzeExistingArticle] Article tags upserted successfully');
    } else if (parserRawTags.length === 0) {
      logger.warn('[AnalyzeExistingArticle] No tags found in article frontmatter!');
    }

    // 5) Reconstruction des Topics via liens externes (parser) — pas de fallback SERP
    // Récupérer les URLs depuis les sections + sources frontmatter
    const linkSummaries = this.articleParser.extractLinksForArticle(article);
    const urlsFromSections = Array.from(
      new Set(
        linkSummaries
          .flatMap(s => s.external)
          .map(u => String(u).trim())
          .filter(Boolean)
      )
    );
    const urlsFromFrontmatter = Array.from(
      new Set((article.article?.sources ?? []).map(u => String(u).trim()).filter(Boolean))
    );
    const allUrls = Array.from(new Set([...urlsFromSections, ...urlsFromFrontmatter]));

    // Construire des Topics minimaux à partir des URLs (builder dédié)
    const topics: Topic[] = new TopicFromUrlsBuilder().build(allUrls, detectedLang);

    // Upsert des topics (idempotent)
    if (!dryRun && topics.length > 0) {
      await this.topicRepository.upsertTopics({ tenantId, projectId, topics });
    }

    // 6) Lier heuristiquement Sections -> Topics via use case dédié
    let sectionTopicLinks = 0;
    if (!dryRun && topics.length > 0) {
      const linkSections = new LinkSectionsToTopicsUseCase(this.topicRelations);
      const linkRes = await linkSections.execute({
        tenantId,
        projectId,
        articleId,
        sections: (article.sections ?? []).map(s => ({ id: s.id, content: s.content })),
        topics: topics.map(t => ({ id: t.id, sourceUrl: t.sourceUrl })),
        dryRun,
      });
      sectionTopicLinks = linkRes.linksCreated;
    }

    // 6bis) Lier Topics -> KeywordTags (fuzzy) via use case dédié
    // Important: on restreint à un set déterministe: ici les seedKeywords du projet
    if (!dryRun && topics.length > 0) {
      const linkTopics = new LinkTopicsToKeywordTagsUseCase(this.topicRelations);
      await linkTopics.execute({
        tenantId,
        projectId,
        topics: topics.map(t => ({ id: t.id, title: t.title })),
        keywordTags: seedKeywords.map(k => createKeywordTag(k)),
        dryRun,
      });
    }

    // (Liens internes déplacés en fin de flux pour garantir indexation complète)
    let sectionInternalRefs = 0;

    logger.debug?.('[AnalyzeExistingArticle] done', {
      tookMs: Date.now() - start,
      projectSeeds: seedKeywords.length,
      planKeywords: seedKeywords.length,
      parserTags: parserRawTags.length,
      topics: topics.length,
      sectionTopicLinks,
      sectionInternalRefs,
    });

    // Pour articles existants: skip SeoBrief (analyse SEO déjà faite)
    // Les KeywordTags enrichis servent uniquement aux liens Neo4j (déjà gérés via TagLinkingService)

    // 8) Construire un EditorialBrief rétroactif avec ANGLE via agent (pas de fallback)
    // Check si EditorialBrief déjà créé (idempotence)

    let skipBriefCreation = false;
    if (this.editorialBriefStore) {
      try {
        const alreadyHasBrief = await this.editorialBriefStore.hasBriefForArticle({
          tenantId,
          articleId,
        });
        skipBriefCreation = alreadyHasBrief === true;
      } catch (e) {
        logger.warn?.('[AnalyzeExistingArticle] hasBriefForArticle check failed (non bloquant)', e);
      }
    } else {
      logger.warn?.(
        '[AnalyzeExistingArticle] editorialBriefStore is UNDEFINED, skipping brief creation'
      );
    }

    if (!skipBriefCreation) {
      if (!this.editorialAngleAgent) {
        throw new Error('[AnalyzeExistingArticle] EditorialAngleAgent manquant');
      }
      if (!this.editorialBriefStore) {
        throw new Error('[AnalyzeExistingArticle] EditorialBriefStore manquant');
      }

      const businessContext = {
        targetAudience: String(settings.targetAudience ?? ''),
        industry: String(settings.industry ?? ''),
        businessDescription: String(settings.businessDescription ?? ''),
        contentType: String(settings.contentType ?? 'article'),
      } as const;

      const externalDomains = (() => {
        const domains: string[] = [];
        for (const u of allUrls) {
          try {
            const { hostname } = new URL(u);
            if (hostname && !domains.includes(hostname)) domains.push(hostname);
          } catch {
            // ignore invalid URL
          }
        }
        return domains;
      })();

      const articleContext = {
        title: article.article.title ?? article.article.id,
        sectionTitles: (article.sections ?? []).map(s => s.title).filter(Boolean),
        internalLinksCount: sectionInternalRefs,
        externalDomains,
      };

      // Construire keywordTags pour le contexte de l'angle agent uniquement
      // (pas pour l'EditorialBrief qui sera lié directement aux KeywordPlans)
      const keywordTagsForAngleAgent = await (async () => {
        const tags: KeywordTag[] = [];
        for (const pid of planIdsFromRun) {
          const plan = await this.keywordPlanRepo.getKeywordPlanById({
            tenantId,
            projectId,
            planId: pid,
          });
          if (plan?.tags?.length) tags.push(...plan.tags);
        }
        const seen = new Set<string>();
        return tags.filter(t => {
          const slug = t.slug ?? t.label.toLowerCase();
          if (seen.has(slug)) return false;
          seen.add(slug);
          return true;
        });
      })();

      if (keywordTagsForAngleAgent.length === 0) {
        throw new Error(
          '[AnalyzeExistingArticle] Aucun keywordTag issu des plans de cette exécution'
        );
      }

      logger.log?.('[AnalyzeExistingArticle] Generating editorial angle...', { articleId });

      const { angle } = await this.editorialAngleAgent.generateAngle({
        businessContext,
        articleContext,
        language: configLang,
        maxLen: 260,
        seoBrief: {
          keywordTags: keywordTagsForAngleAgent,
          userQuestions: [],
          contentGaps: [],
          searchIntent: 'informational',
          searchConfidence: 0.5,
          recommendations: { seo: [], editorial: [], technical: [] },
          competitorTitles: [],
          topicClusters: undefined,
          // Legacy deprecated fields
          seoRecommendations: [],
          contentRecommendations: [],
        },
      });

      logger.log?.('[AnalyzeExistingArticle] Editorial angle:', String(angle).slice(0, 120));

      const createBrief = new CreateEditorialBriefUseCase();
      const brief = await createBrief.execute({
        tenantId,
        projectId,
        language: configLang,
        angle,
        businessContext,
        corpusTopicIds: topics.map(t => t.id),
        // ✨ V3: Pas de seoSummary embarqué - EditorialBrief lié directement aux KeywordPlans
        // Les keywordTags vivent dans les plans (source unique de vérité)
        // EditorialBriefAgent enrichira les données à la génération d'article
      });
      if (!dryRun) {
        // Persister l'EditorialBrief (sans seoBrief embarqué)
        await this.editorialBriefStore.saveEditorialBrief(brief);
        // ✅ Lien direct EditorialBrief → KeywordPlans (source de vérité pour les tags enrichis)
        await this.editorialBriefStore.linkBriefToKeywordPlans(brief.id, planIdsFromRun, tenantId);
        await this.editorialBriefStore.linkBriefToArticle(brief.id, articleId, tenantId);
        logger.log?.('[AnalyzeExistingArticle] EditorialBrief created', {
          briefId: brief.id,
          keywordPlans: planIdsFromRun.length,
          topics: topics.length,
        });
      }
    }

    // 9) Recréer liens internes via use case dédié (FIN)
    try {
      const linkInternal = new LinkInternalReferencesUseCase(this.articleReader, this.articleStore);
      const linkRes = await linkInternal.execute({
        articleId,
        tenantId,
        projectId,
        sections: (article.sections ?? []).map(s => ({ id: s.id, content: s.content ?? '' })),
        dryRun,
      });
      sectionInternalRefs = linkRes.linksCreated;
    } catch (e) {
      logger.warn?.('[AnalyzeExistingArticle] Linking internes par slug: échec partiel', e);
    }

    // 10) Construire enrichedKeywords depuis les plans créés (scopé session)
    interface EnrichedKeyword {
      keyword: string;
      searchVolume?: number;
      difficulty?: number;
      cpc?: number;
      competition?: 'low' | 'medium' | 'high';
      lowTopOfPageBid?: number;
      highTopOfPageBid?: number;
      monthlySearches?: { year: number; month: number; searchVolume: number }[] | undefined;
      source?: string;
    }
    let enrichedKeywordsFromPlans: EnrichedKeyword[] = [];
    if (planIdsFromRun.length > 0) {
      try {
        const allTags: KeywordTag[] = [];
        for (const pid of planIdsFromRun) {
          const plan = await this.keywordPlanRepo.getKeywordPlanById({
            tenantId,
            projectId,
            planId: pid,
          });
          if (plan?.tags?.length) {
            allTags.push(...plan.tags);
          }
        }
        const seen = new Set<string>();
        enrichedKeywordsFromPlans = allTags
          .filter(t => {
            const slug = t.slug ?? t.label.toLowerCase();
            if (seen.has(slug)) return false;
            seen.add(slug);
            return (
              t.searchVolume != null ||
              t.difficulty != null ||
              t.cpc != null ||
              t.competition != null ||
              (Array.isArray(t.monthlySearches) && t.monthlySearches.length > 0)
            );
          })
          .map<EnrichedKeyword>(t => ({
            keyword: t.label,
            searchVolume: t.searchVolume,
            difficulty: t.difficulty,
            cpc: t.cpc,
            competition: t.competition,
            lowTopOfPageBid: t.lowTopOfPageBid,
            highTopOfPageBid: t.highTopOfPageBid,
            monthlySearches: t.monthlySearches,
            source: t.source,
          }));
      } catch (e) {
        logger.warn?.(
          '[AnalyzeExistingArticle] Impossible de relire les plans pour enrichedKeywords',
          e
        );
      }
    }

    return {
      success: true,
      articleId,
      analysis: {
        keywordSeeds: seedKeywords,
        enrichedKeywords: enrichedKeywordsFromPlans,
        createdTopics: topics.map(t => ({ id: t.id, title: t.title, url: t.sourceUrl ?? '' })),
        sectionsAnalyzed: article.sections?.length ?? 0,
      },
      created: {
        keywordPlansUpserted: seedKeywords.length,
        topicsUpserted: topics.length,
        sectionTopicLinks,
        sectionInternalLinks: sectionInternalRefs,
      },
      errors: [],
    } satisfies AnalyzeExistingArticleResult;
  }
}
