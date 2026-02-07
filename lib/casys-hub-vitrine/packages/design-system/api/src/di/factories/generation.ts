import {
  GenerateArticleLinearUseCase,
  type GenerateArticleLinearUseCaseDeps,
} from '@casys/application';

import type { Logger } from '../../utils/logger';
import { GenerateArticleLinearDepsSchema } from '../schemas/ports.schema';
import { optionalFactory, validateDeps } from './factory-helpers';

/**
 * Type predicate pour narrower Partial<GenerateArticleLinearUseCaseDeps> vers GenerateArticleLinearUseCaseDeps
 * Vérifie que toutes les dépendances critiques sont présentes
 */
function isFullGenerateArticleDeps(
  deps: Partial<GenerateArticleLinearUseCaseDeps>
): deps is GenerateArticleLinearUseCaseDeps {
  return !!(
    deps.topicDiscovery &&
    deps.selectTopicUseCase &&
    deps.seoAnalysisUseCase &&
    deps.contentFetcher &&
    deps.configReader &&
    deps.projectSettings &&
    deps.generateAngleUseCase &&
    deps.indexArticleUseCase
  );
}

/**
 * Build GenerateArticleLinearUseCase avec DI complète et validation Zod
-
 *
 * Note: seoAnalysisUseCase sera bientôt optionnel dans @casys/application
 * pour permettre génération d'article sans SEO brief (mode dégradé)
 */
export function buildGenerateArticleLinearUseCase(deps: Record<string, unknown>, logger?: Logger) {
  return optionalFactory(
    'generateArticleLinearUseCase',
    () => {
      // ✅ Validation Zod + type inference
      const result = GenerateArticleLinearDepsSchema.safeParse(deps);

      if (!result.success) {
        logger?.debug?.('[FeatureGate] OFF generateArticleLinearUseCase: Zod validation failed', {
          errors: result.error.issues,
        });
        return undefined;
      }

      const validatedDeps = result.data;

      // Valider les deps critiques (seoAnalysisUseCase sera retiré de cette liste bientôt)
      const criticalDeps = [
        'topicDiscovery',
        'selectTopicUseCase',
        'seoAnalysisUseCase', // TODO: rendre optionnel dans @casys/application
        'contentFetcher',
        'configReader',
        'projectSettings',
        'generateAngleUseCase',
        'indexArticleUseCase',
      ];

      const validation = validateDeps(validatedDeps, criticalDeps);
      if (!validation.valid) {
        logger?.debug?.('[FeatureGate] OFF generateArticleLinearUseCase: missing critical deps', {
          missing: validation.missing,
        });
        return undefined;
      }

      // Feature gating : vérifier que toutes les dépendances critiques sont présentes avec type predicate
      if (!isFullGenerateArticleDeps(validatedDeps)) {
        logger?.debug?.('[FeatureGate] OFF generateArticleLinearUseCase: type predicate failed');
        return undefined;
      }

      // ✅ Utiliser la factory create() avec l'objet deps complet (y compris optionnels)
      // Les orchestrateurs sont instanciés avec fallback inline dans le use case
      return GenerateArticleLinearUseCase.create({
        // Requis
        topicDiscovery: validatedDeps.topicDiscovery,
        selectTopicUseCase: validatedDeps.selectTopicUseCase,
        seoAnalysisUseCase: validatedDeps.seoAnalysisUseCase,
        contentFetcher: validatedDeps.contentFetcher,
        configReader: validatedDeps.configReader,
        projectSettings: validatedDeps.projectSettings,
        generateAngleUseCase: validatedDeps.generateAngleUseCase,
        indexArticleUseCase: validatedDeps.indexArticleUseCase,
        // Optionnels (injectés si disponibles)
        articleWorkflow: validatedDeps.articleWorkflow,
        publicationService: validatedDeps.publicationService,
        coverImageUseCase: validatedDeps.coverImageUseCase,
        upsertArticleTagsUseCase: validatedDeps.upsertArticleTagsUseCase,
        topicRelations: validatedDeps.topicRelations,
        buildTopicsFromFetchResultsUseCase: validatedDeps.buildTopicsFromFetchResultsUseCase,
        editorialBriefStore: validatedDeps.editorialBriefStore,
        seoBriefStore: validatedDeps.seoBriefStore,
        outlineWriterUseCase: validatedDeps.outlineWriterUseCase,
        discoverTopicsUseCase: validatedDeps.discoverTopicsUseCase,
        ensureTenantProjectUseCase: validatedDeps.ensureTenantProjectUseCase,
        editorialBriefAgent: validatedDeps.editorialBriefAgent,
        prepareContextService: validatedDeps.prepareContextService,
        fetchArticlesService: validatedDeps.fetchArticlesService,
        linkSelectedTopicsUseCase: validatedDeps.linkSelectedTopicsUseCase,
        logger,
      });
    },
    logger
  );
}
