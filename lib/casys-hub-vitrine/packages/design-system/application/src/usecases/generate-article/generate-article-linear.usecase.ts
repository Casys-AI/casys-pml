import { randomUUID } from 'node:crypto';

import {
  type ArticleNode,
  type ArticleStructure,
  type BusinessContext,
  type EditorialBriefData,
  type GenerateArticleCommand,
  type GenerateArticlePort,
  type KeywordTag,
  type OutlineWriterPort,
  type PersonaProfile,
  type SectionNode,
  type SeoAnalysisPort,
  type SeoBriefDataV3,
  type SeoStrategy,
  slugifyKeyword,
  type Topic,
  type TopicCandidate,
} from '@casys/core';

import { buildBusinessContextV3 } from '../../mappers/business-context.mapper';
import { mapSeoAnalysisResultCoreToDomain } from '../../mappers/seo-analysis.mapper';
// Plus besoin des mappers DTO ici: on passe des types domaine au SelectTopicUseCase
import type {
  ArticleContentFetcherPort,
  ArticlePublicationPublishPort,
  CoverImageGenerateForArticlePort,
  EditorialBriefAgentPort,
  EditorialBriefStorePort,
  ProjectSeoSettingsPort,
  SelectTopicExecutePort,
  SeoBriefStorePort,
  TopicDiscoveryPort,
  TopicRelationsPort,
  UserProjectConfigPort,
} from '../../ports/out';
import type { ArticleGenerationWorkflowPort } from '../../ports/out/article-generation.workflow.port';
import { FetchArticlesService } from '../../services/article/fetch-articles.service';
import { SelectedCandidatesService } from '../../services/article/selected-candidates.service';
import { PrepareContextService } from '../../services/generate/prepare-context.service';
import { CoverImageOrchestrator } from '../../services/image/cover-image.orchestrator';
import { SeoStrategyService } from '../../services/seo/seo-strategy.service';
import { SeoBriefOrchestrator } from '../../services/seo/seobrief-orchestrator.service';
import { SelectionValidator } from '../../services/validation/selection.validator';
import { createLogger, type Logger } from '../../utils/logger';
import { type BuildTopicsFromFetchResultsUseCase } from '../build-topics-from-fetch-results.usecase';
import { CreateEditorialBriefUseCase } from '../create-editorial-brief.usecase';
import { DiscoverTopicsUseCase } from '../discover-topics.usecase';
import { type EnsureTenantProjectUseCase } from '../ensure-tenant-project.usecase';
import { type IndexArticleProgressivelyUseCase } from '../index-article-progressively.usecase';
import { LinkSelectedTopicsUseCase } from '../link-selected-topics.usecase';
import { PublishArticleUseCase } from '../publish-article.usecase';
import type { GenerateAngleUseCase } from '../seo-analysis/generate-angle.usecase';
import { type UpsertArticleTagsUseCase } from '../upsert-article-tags.usecase';
import type { GenerateArticleOptions } from './generate-article.options';
/**
 * Dépendances du GenerateArticleLinearUseCase
 */
export interface GenerateArticleLinearUseCaseDeps {
  // Obligatoires
  topicDiscovery: TopicDiscoveryPort;
  selectTopicUseCase: SelectTopicExecutePort;
  seoAnalysisUseCase: SeoAnalysisPort;
  contentFetcher: ArticleContentFetcherPort;
  configReader: UserProjectConfigPort;
  projectSettings: ProjectSeoSettingsPort;
  // V3: Génération d'angle éditorial (requis)
  generateAngleUseCase: GenerateAngleUseCase;
  // Workflow d'Article Generation (fail-fast si absent)
  articleWorkflow?: ArticleGenerationWorkflowPort;
  // Optionnels
  publicationService?: ArticlePublicationPublishPort;
  coverImageUseCase?: CoverImageGenerateForArticlePort;
  // Indexation progressive pour l'outline
  indexArticleUseCase: IndexArticleProgressivelyUseCase;

  upsertArticleTagsUseCase?: UpsertArticleTagsUseCase;
  topicRelations?: TopicRelationsPort;
  buildTopicsFromFetchResultsUseCase?: BuildTopicsFromFetchResultsUseCase;
  editorialBriefStore?: EditorialBriefStorePort;
  seoBriefStore?: SeoBriefStorePort;
  outlineWriterUseCase?: OutlineWriterPort;
  discoverTopicsUseCase?: DiscoverTopicsUseCase;
  ensureTenantProjectUseCase?: EnsureTenantProjectUseCase;
  editorialBriefAgent?: EditorialBriefAgentPort;
  // Logger injectable (optionnel, fallback vers logger local)
  logger?: Logger;
  // Services optionnels (si non fournis, ils seront instanciés à la volée)
  prepareContextService?: PrepareContextService;
  fetchArticlesService?: FetchArticlesService;
  linkSelectedTopicsUseCase?: LinkSelectedTopicsUseCase;
  // Use cases et orchestrateurs (DI complète)
  createEditorialBriefUseCase?: CreateEditorialBriefUseCase;
  coverImageOrchestrator?: CoverImageOrchestrator;
  seoBriefOrchestrator?: SeoBriefOrchestrator;
}

export class GenerateArticleLinearUseCase implements GenerateArticlePort {
  private readonly logger: Logger;

  // Constantes de configuration
  private readonly MAX_ENRICHED_KEYWORDS = 10;
  private readonly MAX_PROPOSED_SEEDS = 20;
  private readonly MAX_SERP_RESULTS = 8;
  private readonly MAX_SUPPORTING_QUERIES = 3;

  static create(deps: GenerateArticleLinearUseCaseDeps): GenerateArticleLinearUseCase {
    return new GenerateArticleLinearUseCase(deps);
  }

  constructor(private readonly deps: GenerateArticleLinearUseCaseDeps) {
    this.logger = deps.logger ?? createLogger('GenerateArticleLinearUseCase');
  }

  async execute(
    command: GenerateArticleCommand,
    options?: GenerateArticleOptions
  ): Promise<ArticleStructure> {
    const { keywords, tenantId, projectId } = command;
    // Validations d'entrée (fail-fast avant toute dépendance)
    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('keywords is required and must be a non-empty array');
    }
    if (!tenantId?.trim() || !projectId?.trim()) {
      throw new Error('tenantId et projectId requis');
    }

    // 1. Préparer le contexte (validation + settings)
    const prepSvc =
      this.deps.prepareContextService ??
      new PrepareContextService(this.deps.configReader, this.deps.projectSettings);
    const { tId, pId, settings, language } = await prepSvc.execute({
      keywords,
      tenantId,
      projectId,
    });

    // Idempotent: garantir existence des nœuds Tenant/Project
    try {
      await this.deps.ensureTenantProjectUseCase?.execute({ tenantId: tId, projectId: pId });
    } catch (e) {
      this.logger.warn(
        '[GenerateArticleLinearUseCase] EnsureTenantProjectUseCase échoué (non bloquant)',
        e
      );
    }

    // 2. Analyse SEO (idempotente): réutiliser un SeoBrief projet s'il existe
    // Stratégie SEO finale (type domaine)
    let seoStrategy: SeoStrategy | undefined;
    let existingSeoBriefId: string | undefined; // Track l'ID si SeoBrief existe déjà
    try {
      if (this.deps.seoBriefStore) {
        const existing = await this.deps.seoBriefStore.getSeoBriefForProject({
          tenantId: tId,
          projectId: pId,
        });
        if (existing && Array.isArray(existing.keywordTags) && existing.keywordTags.length > 0) {
          const strategy = new SeoStrategyService().fromExistingBrief(existing);
          seoStrategy = strategy;
          // ✅ Récupérer l'ID pour les liens sans re-persister
          existingSeoBriefId = `seobrief_${tId}_${pId}`; // ID standard projet
          this.logger.log('♻️ SeoBrief projet existant réutilisé, skip SeoAnalysisUseCase', {
            tags: strategy.keywordPlan.tags.length,
            intent: strategy.searchIntent.intent,
            seoBriefId: existingSeoBriefId,
          });
        }
      }
    } catch (e) {
      this.logger.warn('Réutilisation SeoBrief projet échouée (non bloquant), fallback analyse', e);
    }
    // Assurer une stratégie SEO définie (fallback analyse)
    const finalSeoStrategy: SeoStrategy =
      seoStrategy ?? (await this.analyzeSeo(keywords, tId, pId, language));

    // Construire SeoBrief complet depuis la stratégie (core V3)
    const seoBriefData: SeoBriefDataV3 | undefined =
      new SeoStrategyService().buildSeoBriefFromStrategy(finalSeoStrategy);

    // 3. Découverte de topics candidats (use case atomique)
    const topicCandidates = await (
      this.deps.discoverTopicsUseCase ?? new DiscoverTopicsUseCase(this.deps.topicDiscovery)
    ).execute({
      seoStrategy: finalSeoStrategy,
      tenantId: tId,
      projectId: pId,
      language,
    });

    // Proposer l'ensemble des tags recommandés du KeywordPlan au sélecteur
    // Tags domaine issus du KeywordPlan (source unique)
    const proposedDomainTags = finalSeoStrategy.keywordPlan.tags ?? [];

    // V3: Étape 1 - Générer l'angle éditorial via GenerateAngleUseCase
    if (!this.deps.generateAngleUseCase) {
      throw new Error('[GenerateArticle] generateAngleUseCase requis (dépendance manquante)');
    }
    this.logger.log('[GenerateArticle] 🔍 Étape 3: Génération angle (Graph RAG)', {
      articlesCount: topicCandidates.length,
      seoBriefId: existingSeoBriefId ?? 'none',
      graphRAGEnabled: !!existingSeoBriefId,
    });
    const angleResult = await this.deps.generateAngleUseCase.execute({
      tenantId: tId,
      projectId: pId,
      language,
      articles: topicCandidates,
      seoBriefData: seoBriefData,
      seoBriefId: existingSeoBriefId, // V3: Graph RAG relation-based si SeoBrief existe
    });
    const selectedAngle: string = angleResult.selectedAngle;

    // V3: Étape 2 - Filtrer les topics avec l'angle généré via SelectTopicUseCase
    this.logger.log('[GenerateArticle] Filtrage des topics avec angle', {
      angle: selectedAngle,
      articlesCount: topicCandidates.length,
    });
    const selection = await this.deps.selectTopicUseCase.execute({
      tenantId: tId,
      projectId: pId,
      language,
      articles: topicCandidates,
      tags: proposedDomainTags,
      seoBriefData,
      // V3: Fournir l'angle et métadonnées de sélection
      angle: selectedAngle,
      chosenCluster: angleResult.chosenCluster,
      contentType: angleResult.contentType,
      selectionMode: angleResult.selectionMode,
      targetPersona: angleResult.targetPersona,
    });
    const topics: Topic[] = selection.topics;

    // V3: Validation basique (SelectionValidator ne valide que topics et angle)
    SelectionValidator.validate(topics, seoBriefData, selectedAngle);

    // Fail-fast: un angle éditorial est requis
    if (!selectedAngle?.trim()) {
      try {
        this.logger.error('[GenerateArticle] Fail-fast angle — diagnostic', {
          angleValue: selectedAngle ?? null,
          topicsCount: topics.length,
        });
      } catch {
        // ignorer les erreurs de logging
      }
      throw new Error('[GenerateArticle] angle éditorial requis (fail-fast)');
    }

    // Charger ProjectConfig et construire BusinessContext V3 via mapper centralisé
    const projectConfig = await this.deps.configReader.getProjectConfig(tId, pId);
    const businessContext: BusinessContext = buildBusinessContextV3(projectConfig, settings);

    // Déclarer briefId et editorialBriefData (seront assignés après le fetch)
    let briefId: string | undefined;
    let editorialBriefData: EditorialBriefData | undefined;

    // 4) Récupération contenu complet des articles SHORTLISTÉS (après sélection TopicSelector)
    // Construire la liste des candidats sélectionnés pour le fetching en
    // mappant les topics retenus par l'agent vers les candidats d'origine (id/sourceUrl)
    // FAIL-FAST: aucun fallback. Si un topic n'est pas retrouvé parmi les candidats initiaux
    // ou si l'URL source est absente, on lève une erreur explicite.
    const selectedCandidatesForFetch: TopicCandidate[] =
      SelectedCandidatesService.mapSelectedToCandidates(topics, topicCandidates);

    this.logger.log('[GenerateArticle] Récupération du contenu des articles sélectionnés', {
      count: selectedCandidatesForFetch.length,
    });

    const linkSvc =
      this.deps.linkSelectedTopicsUseCase ??
      new LinkSelectedTopicsUseCase(this.deps.buildTopicsFromFetchResultsUseCase);
    await linkSvc.execute({
      tenantId: tId,
      projectId: pId,
      candidates: selectedCandidatesForFetch,
      keywordTags: finalSeoStrategy.keywordPlan.tags ?? [],
    });

    const fetchSvc =
      this.deps.fetchArticlesService ?? new FetchArticlesService(this.deps.contentFetcher);
    const enrichedArticles = await fetchSvc.execute(selectedCandidatesForFetch);

    // Créer/persister l'EditorialBrief (aggregate) avec données enrichies
    this.logger.log('[GenerateArticle] 📝 Étape 6: Création EditorialBrief', {
      angle: selectedAngle,
      corpusTopicsCount: topics.length,
      hasAgent: !!this.deps.editorialBriefAgent,
      selectedTopicsCount: topics.length,
      sourceArticlesCount: enrichedArticles.length,
    });

    try {
      const createBrief =
        this.deps.createEditorialBriefUseCase ??
        new CreateEditorialBriefUseCase(this.deps.editorialBriefAgent);

      // Guard: pillarTag requis pour génération complète
      if (!selection.chosenCluster?.pillarTag) {
        throw new Error(
          '[GenerateArticle] chosenCluster.pillarTag requis pour EditorialBriefAgent'
        );
      }

      const brief = await createBrief.execute({
        tenantId: tId,
        projectId: pId,
        language,
        angle: selectedAngle,
        businessContext,
        corpusTopicIds: topics.map(t => t.id),
        chosenCluster: {
          pillarTag: selection.chosenCluster.pillarTag,
          satelliteTags: selection.chosenCluster.satelliteTags ?? [],
        },
        contentType: selection.contentType ?? 'guide',
        targetPersona: selection.targetPersona as PersonaProfile | undefined,
        selectionMode: selection.selectionMode ?? 'pillar',
        seoBriefData,
        selectedTopics: topics.map(t => ({
          id: t.id,
          title: t.title,
          sourceUrl: t.sourceUrl,
          createdAt: t.createdAt,
          language: t.language,
        })),
        sourceArticles: enrichedArticles.map(a => ({
          title: a.title ?? '',
          sourceUrl: a.sourceUrl ?? '',
          content: a.content ?? '',
          summary: a.summary,
        })),
      });
      briefId = brief.id; // 📝 Stocker l'ID pour le lien Brief->Article plus tard

      // Reconstruire EditorialBriefData depuis le brief enrichi
      if (brief.keywordTags) {
        editorialBriefData = {
          keywordTags: brief.keywordTags,
          relevantQuestions: brief.relevantQuestions ?? [],
          priorityGaps: brief.priorityGaps ?? [],
          guidingRecommendations: brief.guidingRecommendations ?? {
            seo: [],
            editorial: [],
            technical: [],
          },
          corpusSummary: brief.corpusSummary ?? '',
          competitorAngles: brief.competitorAngles ?? [],
        };
      }

      this.logger.log('📝 EditorialBrief créé', {
        briefId,
        angle: brief.angle.value,
        corpusSize: brief.corpusTopicIds.length,
        targetAudience: businessContext.targetAudience,
        enriched: !!editorialBriefData,
        keywordsCount: editorialBriefData?.keywordTags.length ?? 0,
      });

      if (this.deps.editorialBriefStore) {
        await this.deps.editorialBriefStore.saveEditorialBrief(brief);
        this.logger.debug('📝 EditorialBrief persisté', { briefId });

        // ✨ Lier le brief aux clusters choisis (directement depuis selection.chosenCluster)
        try {
          const { chosenCluster } = selection;

          if (
            chosenCluster &&
            (chosenCluster.pillarTag || chosenCluster.satelliteTags.length > 0)
          ) {
            this.logger.debug('🔍 Cluster choisi pour EditorialBrief', {
              hasPillar: !!chosenCluster.pillarTag,
              pillarLabel: chosenCluster.pillarTag?.label,
              satellitesCount: chosenCluster.satelliteTags.length,
              satelliteLabels: chosenCluster.satelliteTags
                .map((s: { label: string }) => s.label)
                .slice(0, 3),
            });

            await this.deps.editorialBriefStore.linkBriefToTopicClusters({
              briefId: brief.id,
              tenantId: tId,
              projectId: pId,
              pillarTag: chosenCluster.pillarTag
                ? {
                    label: String(chosenCluster.pillarTag.label).trim(),
                    slug:
                      chosenCluster.pillarTag.slug?.trim() ??
                      slugifyKeyword(String(chosenCluster.pillarTag.label).trim()),
                    source: chosenCluster.pillarTag.source ?? 'pillar',
                  }
                : undefined,
              satelliteTags: chosenCluster.satelliteTags.map(
                (s: { label: string; slug?: string; source?: string }) => ({
                  label: String(s.label).trim(),
                  slug: s.slug?.trim() ?? slugifyKeyword(String(s.label).trim()),
                  source: s.source ?? 'satellite',
                })
              ),
            });

            this.logger.debug('🔗 EditorialBrief lié aux clusters', {
              briefId,
              hasPillar: !!chosenCluster.pillarTag,
              satellitesCount: chosenCluster.satelliteTags.length,
            });
          } else {
            this.logger.debug('⚠️ Aucun cluster choisi, lien skipped', { briefId });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn('Lien EditorialBrief->Clusters échoué (non bloquant)', msg);
        }
      }

      // Persister et lier le SeoBrief projet au brief éditorial via l'orchestrateur dédié
      if (this.deps.seoBriefStore) {
        const orchestrator =
          this.deps.seoBriefOrchestrator ??
          new SeoBriefOrchestrator(this.deps.seoBriefStore);
        let seoBriefId: string;

        try {
          if (existingSeoBriefId) {
            // ✅ SeoBrief existe déjà (détecté au début du flow): utiliser son ID sans re-persister
            seoBriefId = existingSeoBriefId;
            this.logger.debug('♻️ Utilisation SeoBrief existant pour liens', { seoBriefId });
          } else if (seoBriefData) {
            // 🔍 Avant de créer, vérifier si un SeoBrief projet existe déjà (idempotence stricte)
            // Peut arriver si analyse SEO refaite mais SeoBrief déjà créé lors d'un article précédent
            const result = await orchestrator.persistProjectBrief({
              tenantId: tId,
              projectId: pId,
              seoBriefData,
            });
            seoBriefId = result.seoBriefId;
            if (result.created) {
              this.logger.debug('🆕 SeoBrief créé', { seoBriefId });
            } else {
              this.logger.debug('♻️ SeoBrief projet réutilisé', { seoBriefId });
            }
          } else {
            throw new Error('Ni SeoBrief existant ni nouvelles données disponibles');
          }

          // Créer les liens (toujours nécessaires)
          try {
            await orchestrator.linkToBusinessContext({
              tenantId: tId,
              projectId: pId,
              seoBriefId,
              businessContext, // V3: BusinessContext enrichi avec siteType et personas
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.warn('Lien SeoBrief->BusinessContext échoué (non bloquant)', msg);
          }
          await orchestrator.linkToProject({ tenantId: tId, projectId: pId, seoBriefId });
          await orchestrator.linkToEditorialBrief({
            tenantId: tId,
            projectId: pId,
            seoBriefId,
            briefId: brief.id,
          });
          this.logger.log('[GenerateArticle] 🔗 Relation SeoBrief→EditorialBrief créée', {
            seoBriefId,
            briefId: brief.id,
            relation: '[:INFORMS]',
            note: 'Cette relation sera réutilisée pour Graph RAG anti-doublons',
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn('Lien/persistance SeoBrief échoué (non bloquant)', msg);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn('Création/persistance EditorialBrief échouée (non bloquant)', msg);
    }

    // V3 Fail-fast: EditorialBriefData enrichi est requis pour piloter l'outline
    if (!editorialBriefData) {
      this.logger.error('[GenerateArticle] Fail-fast editorialBriefData — diagnostic', {
        hasAgent: !!this.deps.editorialBriefAgent,
        hasChosenCluster: !!selection.chosenCluster,
        hasSeoBriefData: !!seoBriefData,
        hasBriefId: !!briefId,
      });
      throw new Error(
        '[GenerateArticle] EditorialBriefData requis (fail-fast): CreateEditorialBriefUseCase doit fournir un brief enrichi via EditorialBriefAgent'
      );
    }

    // 5) Generate outline avec articles multiples (OutlineWriterUseCase obligatoire)
    const articleId = randomUUID();
    this.logger.log('[GenerateArticle] Génération du plan (outline)', {
      articleId,
      topicsCount: topics.length,
      sourceArticlesCount: enrichedArticles.length,
      keywordTagsCount: (finalSeoStrategy?.keywordPlan.tags ?? []).length,
      angle: selectedAngle ?? null,
    });
    if (!this.deps.outlineWriterUseCase) {
      throw new Error('OutlineWriterUseCase requis (pas de fallback)');
    }
    const outline = await this.deps.outlineWriterUseCase.execute({
      tenantId: tId,
      projectId: pId,
      language,
      articleId,
      topics: topics.map(t => ({
        id: t.id,
        title: t.title,
        sourceUrl: t.sourceUrl,
        createdAt: t.createdAt,
        language: t.language,
        // V3: Keywords filtrés depuis EditorialBriefData enrichi
        keywords: editorialBriefData.keywordTags.map(kt => String(kt.label).trim()).filter(Boolean),
      })),
      angle: selectedAngle,
      editorialBriefData,
      sourceArticles: enrichedArticles,
      businessContext,
    });
    // Outline OK — fail-fast checks et indexation
    this.logger.log('🧠 Outline validated (use case)', {
      articleId,
      sectionsCount: outline.sections.length,
      hasTitle: outline.title.trim().length > 0,
    });

    // Validate levels 1..6 and unique ids
    if (!Array.isArray(outline.sections) || outline.sections.length === 0) {
      throw new Error('Outline must contain at least one section');
    }
    const ids = new Set<string>();
    outline.sections.forEach((s: SectionNode) => {
      if (s.level < 1 || s.level > 6)
        throw new Error(`Invalid section level ${s.level} for id ${s.id}`);
      if (ids.has(s.id)) throw new Error(`Duplicate section id detected: ${s.id}`);
      ids.add(s.id);
    });

    // 4) Indexer immédiatement l'outline (titre + description) pour navigation/context
    const outlineArticle: ArticleNode = {
      id: articleId,
      title: outline.title,
      slug: outline.slug, // Slug SEO généré par OutlineWriter AI
      description: outline.summary,
      language,
      createdAt: new Date().toISOString(),
      keywords: outline.keywordTags?.map(kt => kt.label) ?? [],
      sources: [],
      agents: ['OutlineWriterAgent'],
      tenantId: tId,
      projectId: pId,
      content: '',
    };
    // Indexation de l'outline (fail-fast)
    await this.deps.indexArticleUseCase.indexOutline({
      article: outlineArticle,
      sections: outline.sections as unknown as SectionNode[],
      tenantId: tId,
    });

    // 5) Déléguer la génération/validation des sections au Workflow (fail-fast)
    // Lire templatePath pour SectionWriter depuis ProjectConfig (déjà chargé plus haut)
    const templatePath = projectConfig?.generation?.sectionWriter?.template;
    if (!templatePath?.trim()) {
      throw new Error('[GenerateArticle] Template SectionWriter non configuré (workflow)');
    }
    // Fail-fast: exiger le workflow d'article (pas de fallback)
    if (!this.deps.articleWorkflow) {
      throw new Error('[GenerateArticle] ArticleGenerationWorkflow requis (absent)');
    }
    const wfResult = await this.deps.articleWorkflow.execute(
      {
        tenantId: tId,
        projectId: pId,
        language,
        outline: {
          article: {
            id: articleId,
            title: outline.title,
          },
          sections: outline.sections.map((s: SectionNode, idx: number) => ({
            ...s, // ✅ Préserve TOUS les champs DDD (relatedArticles, suggestedTopics, etc.)
            id: s.id ?? `${articleId}::${idx}`,
            articleId, // ✅ Ajoute articleId si manquant
          })),
        },
      },
      { templatePath, contentFormat: 'mdx', maxAttempts: 1 }
    );
    const sections: SectionNode[] = wfResult.sections;

    // 6) Assemble ArticleStructure (simple, non-persistent identifiers)
    const article: ArticleStructure['article'] = {
      id: articleId,
      title: outline.title,
      slug: outline.slug, // Réutilise le slug SEO généré par OutlineWriter AI
      description: outline.summary,
      language,
      createdAt: new Date().toISOString(),
      keywords: outline.keywordTags?.map(kt => kt.label) ?? [],
      sources: [],
      agents: ['OutlineWriterAgent', 'SectionWriterAgent'],
      tenantId: tenantId ?? '',
      projectId: projectId ?? '',
      content: sections.map(s => {
        const heading = '#'.repeat(s.level) + ' ' + s.title;
        return heading + '\n\n' + s.content;
      }).join('\n\n'),
    };

    // 7) Génération/attachement de la cover via orchestrateur dédié
    const coverOrchestrator =
      this.deps.coverImageOrchestrator ?? new CoverImageOrchestrator();
    await coverOrchestrator.execute({
      outline,
      outlineArticle,
      coverImageUseCase: this.deps.coverImageUseCase,
      tenantId: tId,
      projectId: pId,
      articleId,
    });
    // Upsert des tags d'article (traçabilité SEO) avant publication
    if (this.deps.upsertArticleTagsUseCase) {
      // V3: Construire les tags à partir d'EditorialBriefData enrichi (keywords filtrés)
      const sourceTags = editorialBriefData.keywordTags;
      if (sourceTags.length === 0) {
        throw new Error('[GenerateArticleLinearUseCase] keywordTags requis pour upsertArticleTags');
      }
      const tags: KeywordTag[] = sourceTags
        .map(t => ({
          label: String(t.label).trim(),
          slug: t.slug?.trim() ? t.slug : slugifyKeyword(t.label),
          source: t.source ?? ('opportunity' as const),
          weight: t.weight,
        }))
        .filter(t => t.label.length > 0);

      // 🔍 Debug: tracer les tags avant upsert pour vérifier la cohérence des slugs
      this.logger.log('[GenerateArticle] Tags avant upsert', {
        articleId,
        tagsCount: tags.length,
        tags: tags.map(t => ({
          label: t.label,
          slug: t.slug,
          source: t.source,
        })),
      });

      await this.deps.upsertArticleTagsUseCase.execute({
        articleId,
        projectId: pId,
        tenantId: tId,
        tags,
      });
    }

    // Propager la cover éventuelle (les publishers lisent article.article.cover)
    if (outlineArticle.cover?.src && outlineArticle.cover.src.trim().length > 0) {
      article.cover = {
        src: outlineArticle.cover.src,
        ...(outlineArticle.cover.alt ? { alt: outlineArticle.cover.alt } : {}),
      };
    }

    // Linking Topic->KeywordPlan déjà effectué dans BuildTopicsFromFetchResultsUseCase (source unique)

    // Lier le brief à l'article généré (traçabilité éditoriale)
    if (this.deps.editorialBriefStore && briefId) {
      try {
        await this.deps.editorialBriefStore.linkBriefToArticle(briefId, articleId, tId);
        this.logger.debug("📝 EditorialBrief lié à l'article", { briefId, articleId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn('[GenerateArticle] Linking Brief->Article failed (non bloquant)', msg);
      }
    }

    //
    // Réfléchir à la fréquence de génération / Mise a jour  du SEO BRIEF

    // 8) Publication orchestrée (FS + GitHub) — fail-fast si service absent

    if (!this.deps.publicationService) {
      throw new Error('[GenerateArticle] ArticlePublicationService requis (fail-fast)');
    }
    if (!tId) throw new Error('[GenerateArticle] tenantId requis pour publication');
    if (!pId) throw new Error('[GenerateArticle] projectId requis pour publication');

    try {
      this.logger.log('🚀 Publication orchestrée (FS/GitHub) en cours...');
      const structure: ArticleStructure = {
        article,
        sections,
        topics,
        componentUsages: [],
        textFragments: [],
        comments: [],
      };
      if (!this.deps.publicationService) {
        throw new Error('[GenerateArticle] ArticlePublicationService requis (fail-fast)');
      }
      const publisher = new PublishArticleUseCase(this.deps.publicationService);
      const publishResults = await publisher.execute({
        structure,
        tenantId: tId,
        projectId: pId,
        onEvent: options?.onEvent,
      });
      this.logger.log('[GenerateArticle] Publication terminée', {
        targets: (publishResults as { target: string }[]).map(r => r.target),
      });
    } catch (err) {
      const emsg = err instanceof Error ? err.message : String(err);
      this.logger.error('[GenerateArticle] Publication failed', emsg);
      throw err;
    }

    return {
      article,
      sections,
      topics,
      componentUsages: [],
      textFragments: [],
      comments: [],
    };
  }

  /**
   * Analyse SEO des keywords
   * @returns Stratégie SEO avec keywords enrichis, intent, gaps
   */
  private async analyzeSeo(
    keywords: string[],
    tenantId: string,
    projectId: string,
    language: string
  ) {
    this.logger.log('🔍 Analyse SEO avec recherche web contextuelle...');

    const seoAnalysisResult = await this.deps.seoAnalysisUseCase.execute({
      tenantId,
      projectId,
      keywords,
      language,
    });

    const seoStrategy = mapSeoAnalysisResultCoreToDomain(seoAnalysisResult);

    this.logger.log('[GenerateArticle] Analyse SEO terminée', {
      keywordTags: seoStrategy.keywordPlan.tags.length,
      searchIntent: seoStrategy.searchIntent.intent,
    });

    return seoStrategy;
  }
}
