import {
  type AnalyzeExistingArticleDeps,
  AnalyzeExistingArticleUseCase,
  IndexArticlesUseCase,
  ListArticlesUseCase,
} from '@casys/application';

import type { Logger } from '../../utils/logger';
import {
  AnalyzeExistingArticleDepsSchema,
  IndexArticlesDepsSchema,
  ListArticlesDepsSchema,
} from '../schemas/ports.schema';
import { optionalFactory, validateDeps } from './factory-helpers';

/**
 * Build ListArticlesUseCase
 * Pattern OPTIONAL: retourne undefined si articleStructureRepository absent
 */
export function buildListArticlesUseCase(
  articleStructureRepository: unknown,
  logger?: Logger
): ListArticlesUseCase | undefined {
  return optionalFactory('listArticlesUseCase', () => {
    // Log diagnostic: vérifier ce qui est passé
    if (logger?.debug) {
      logger.debug('[Factory] listArticlesUseCase: checking dependency', {
        hasRepository: !!articleStructureRepository,
        repositoryType: articleStructureRepository ? typeof articleStructureRepository : 'undefined',
      });
    }

    // ✅ Validation Zod
    const result = ListArticlesDepsSchema.safeParse({ articleStructureRepository });

    if (!result.success) {
      if (logger?.debug) {
        logger.debug('[FeatureGate] OFF listArticlesUseCase: Zod validation failed', {
          errors: result.error.issues,
        });
      }
      return undefined;
    }

    if (!result.data.articleStructureRepository) {
      if (logger?.debug) {
        logger.debug('[FeatureGate] OFF listArticlesUseCase: missing articleStructureRepository after Zod');
      }
      return undefined;
    }

    // ✅ Type exact inféré par Zod
    if (logger?.debug) {
      logger.debug('[Factory] listArticlesUseCase: creating instance ✅');
    }
    return new ListArticlesUseCase(result.data.articleStructureRepository);
  }, logger);
}

/**
 * Build IndexArticlesUseCase
 * Pattern OPTIONAL: retourne undefined si articleStructureStore absent
 */
export function buildIndexArticlesUseCase(
  articleStructureStore: unknown,
  logger?: Logger
): IndexArticlesUseCase | undefined {
  return optionalFactory('indexArticlesUseCase', () => {
    // ✅ Validation Zod
    const result = IndexArticlesDepsSchema.safeParse({ articleStructureStore });

    if (!result.success || !result.data.articleStructureStore) {
      logger?.debug?.('[FeatureGate] OFF indexArticlesUseCase: missing articleStructureStore');
      return undefined;
    }

    // ✅ Type exact inféré par Zod
    return new IndexArticlesUseCase(result.data.articleStructureStore);
  }, logger);
}

/**
 * Type predicate pour narrower Partial<AnalyzeExistingArticleDeps> vers AnalyzeExistingArticleDeps
 * Vérifie que les dépendances critiques sont présentes
 */
function isFullAnalyzeArticleDeps(deps: Partial<AnalyzeExistingArticleDeps>): deps is AnalyzeExistingArticleDeps {
  return !!(
    deps.articleStore &&
    deps.articleReader &&
    deps.projectSettings &&
    deps.articleParser &&
    deps.seoAnalysisUseCase &&
    deps.keywordPlanRepo &&
    deps.tagRepository &&
    deps.topicRepository &&
    deps.topicRelations &&
    deps.ensureTenantProject &&
    deps.seoBriefStore &&
    deps.topicDiscovery &&
    deps.indexArticleFromRepo
  );
}

/**
 * Build AnalyzeExistingArticleUseCase
 * Pattern OPTIONAL: retourne undefined si deps critiques manquantes
 */
export function buildAnalyzeExistingArticleUseCase(
  infraServices: Record<string, unknown>,
  appServices: Record<string, unknown>,
  logger?: Logger
): AnalyzeExistingArticleUseCase | undefined {
  return optionalFactory('analyzeExistingArticleUseCase', () => {
    // ✅ Validation Zod + type inference
    const result = AnalyzeExistingArticleDepsSchema.safeParse({
      articleStore: infraServices.articleStructureStore,
      articleReader: infraServices.articleStructureRepository,
      githubRepository: infraServices.githubArticleRepository,
      projectSettings: infraServices.projectSeoSettings,
      articleParser: infraServices.articleParser,
      seoAnalysisUseCase: appServices.seoAnalysisUseCase,
      seoKeywordsMetricsUseCase: appServices.seoKeywordsMetricsUseCase,
      articleKeywordsMetricsUseCase: appServices.articleKeywordsMetricsUseCase,
      keywordPlanRepo: infraServices.keywordPlanRepo,
      tagRepository: infraServices.tagRepository,
      topicRepository: infraServices.topicRepository,
      topicRelations: infraServices.topicRelations,
      ensureTenantProject: appServices.ensureTenantProjectUseCase,
      seoBriefStore: infraServices.seoBriefStore,
      topicDiscovery: infraServices.topicDiscovery,
      indexArticleFromRepo: appServices.indexArticleFromRepoUseCase,
      syncArticlesFromGithub: appServices.syncArticlesFromGithubUseCase,
      editorialAngleAgent: infraServices.editorialAngleAgent,
      editorialBriefStore: infraServices.editorialBriefStore,
    });

    if (!result.success) {
      logger?.debug?.('[FeatureGate] OFF analyzeExistingArticleUseCase: Zod validation failed', {
        errors: result.error.issues,
      });
      return undefined;
    }

    const validatedDeps = result.data;

    // Valider les deps critiques
    const criticalDeps = [
      'articleStore',
      'articleReader',
      'projectSettings',
      'articleParser',
      'seoAnalysisUseCase',
      'keywordPlanRepo',
      'tagRepository',
      'topicRepository',
      'topicRelations',
      'ensureTenantProject',
      'seoBriefStore',
      'topicDiscovery',
      'indexArticleFromRepo',
    ];

    const validation = validateDeps(validatedDeps, criticalDeps);
    if (!validation.valid) {
      logger?.debug?.('[FeatureGate] OFF analyzeExistingArticleUseCase: missing critical deps', {
        missing: validation.missing,
      });
      return undefined;
    }

    // Feature gating : vérifier que toutes les dépendances critiques sont présentes avec type predicate
    if (!isFullAnalyzeArticleDeps(validatedDeps)) {
      logger?.debug?.('[FeatureGate] OFF analyzeExistingArticleUseCase: type predicate failed');
      return undefined;
    }

    // ✅ Utiliser la factory create() avec l'objet deps complet (typé par le type predicate)
    return AnalyzeExistingArticleUseCase.create(validatedDeps);
  }, logger);
}
