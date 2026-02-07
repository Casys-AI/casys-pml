import { SeoAnalysisUseCase, type SeoAnalysisUseCaseDeps } from '@casys/application';

import type { Logger } from '../../utils/logger';
import { SeoAnalysisDepsSchema } from '../schemas/ports.schema';
import { optionalFactory, validateDeps } from './factory-helpers';

/**
 * Type predicate pour narrower Partial<SeoAnalysisUseCaseDeps> vers SeoAnalysisUseCaseDeps
 * Vérifie que toutes les dépendances critiques sont présentes
 */
function isFullSeoDeps(deps: Partial<SeoAnalysisUseCaseDeps>): deps is SeoAnalysisUseCaseDeps {
  return !!(
    deps.aiTextModel &&
    deps.promptTemplate &&
    deps.googleScraping &&
    deps.googleTrends &&
    deps.keywordEnrichment &&
    deps.domainAnalysis &&
    deps.projectSettings &&
    deps.keywordPlanRepo
  );
}

/**
 * Build SeoAnalysisUseCase avec DI complète et validation Zod
 * Pattern OPTIONAL: retourne undefined si deps critiques manquantes
 */
export function buildSeoAnalysisUseCase(deps: Record<string, unknown>, logger?: Logger) {
  return optionalFactory('seoAnalysisUseCase', () => {
    // Helper local pour vérifier les méthodes
    const hasMethod = (obj: unknown, methodName: string): boolean => {
      if (!obj || typeof obj !== 'object') return false;
      const port = obj as Record<string, unknown>;
      return typeof port[methodName] === 'function';
    };

    // ✅ Validation Zod + type inference
    const result = SeoAnalysisDepsSchema.safeParse(deps);

    if (!result.success) {
      logger?.debug?.('[FeatureGate] OFF seoAnalysisUseCase: Zod validation failed', {
        errors: result.error.issues,
      });
      return undefined;
    }

    const validatedDeps = result.data;

    // Valider les deps critiques
    const validation = validateDeps(validatedDeps, [
      'aiTextModel',
      'promptTemplate',
      'googleScraping',
      'googleTrends',
      'keywordEnrichment',
      'domainAnalysis',
      'projectSettings',
      'keywordPlanRepo',
    ]);

    if (!validation.valid) {
      logger?.debug?.('[FeatureGate] OFF seoAnalysisUseCase: missing critical deps', {
        missing: validation.missing,
      });
      return undefined;
    }

    // Feature gating : vérifier que toutes les dépendances sont présentes avec type predicate
    if (!isFullSeoDeps(validatedDeps)) {
      logger?.debug?.('[FeatureGate] OFF seoAnalysisUseCase: type predicate failed');
      return undefined;
    }

    // ✅ Utiliser la factory create() avec l'objet deps complet (y compris optionnels)
    return SeoAnalysisUseCase.create({
      aiTextModel: validatedDeps.aiTextModel,
      promptTemplate: validatedDeps.promptTemplate,
      googleScraping: validatedDeps.googleScraping,
      googleTrends: validatedDeps.googleTrends,
      keywordEnrichment: validatedDeps.keywordEnrichment,
      domainAnalysis: validatedDeps.domainAnalysis,
      // Optionnels (injectés si disponibles)
      configReader: validatedDeps.configReader,
      projectSettings: validatedDeps.projectSettings,
      seoAnalysisAgent: validatedDeps.seoAnalysisAgent,
      keywordPlanRepo: validatedDeps.keywordPlanRepo,
      tagRepository: validatedDeps.tagRepository,
      seoBriefStore: validatedDeps.seoBriefStore,
      topicClusterStore: validatedDeps.topicClusterStore,
      brief: validatedDeps.brief,
    });
  }, logger);
}
