import { LeadAnalysisStreamingUseCase, type LeadAnalysisUseCaseDeps } from '@casys/application';

import type { Logger } from '../../utils/logger';
import { LeadAnalysisDepsSchema } from '../schemas/ports.schema';
import { optionalFactory, validateDeps } from './factory-helpers';

/**
 * Type predicate pour narrower Partial<LeadAnalysisUseCaseDeps> vers LeadAnalysisUseCaseDeps
 * Vérifie que les dépendances critiques sont présentes
 */
function isFullLeadDeps(deps: Partial<LeadAnalysisUseCaseDeps>): deps is LeadAnalysisUseCaseDeps {
  return !!deps.store && !!deps.businessContextAgent && !!deps.domainAnalysis && !!deps.keywordDiscovery && !!deps.pageScraper;
}

/**
 * Build LeadAnalysisStreamingUseCase
 * Pattern OPTIONAL: retourne undefined si deps critiques manquantes
 */
export function buildLeadAnalysisUseCase(infraServices: Record<string, unknown>, logger?: Logger) {
  return optionalFactory('leadAnalysisUseCase', () => {
    // ✅ Validation Zod - Pass ALL deps required by LeadAnalysisUseCaseDeps
    // Note: LeadAnalysisUseCaseDeps uses 'store' not 'leadAnalysisStore'
    const result = LeadAnalysisDepsSchema.safeParse({
      store: infraServices.leadAnalysisStore,
      businessContextAgent: infraServices.businessContextAgent,
      domainAnalysis: infraServices.domainAnalysis,
      keywordDiscovery: infraServices.keywordDiscovery,
      keywordEnrichment: infraServices.keywordEnrichment,
      googleTrends: infraServices.googleTrends,
      googleScraping: infraServices.googleScraping,
      promptTemplate: infraServices.promptTemplate,
      seoAnalysisAgent: infraServices.seoAnalysisAgent,
      pageScraper: infraServices.pageScraper,
      siteKeywords: infraServices.siteKeywords,
    });

    if (!result.success) {
      logger?.debug?.('[FeatureGate] OFF leadAnalysisUseCase: Zod validation failed', {
        errors: result.error.issues,
      });
      return undefined;
    }

    const validatedDeps = result.data;

    // Valider les deps critiques
    const validation = validateDeps(validatedDeps, ['store', 'businessContextAgent', 'domainAnalysis', 'keywordDiscovery', 'pageScraper']);
    if (!validation.valid) {
      logger?.debug?.('[FeatureGate] OFF leadAnalysisUseCase: missing critical deps', {
        missing: validation.missing,
      });
      return undefined;
    }

    // Feature gating : vérifier les dépendances critiques avec type predicate
    if (!isFullLeadDeps(validatedDeps)) {
      logger?.debug?.('[FeatureGate] OFF leadAnalysisUseCase: type predicate failed');
      return undefined;
    }

    // ✅ validatedDeps est maintenant typé comme LeadAnalysisUseCaseDeps (narrowed par type predicate)
    return new LeadAnalysisStreamingUseCase(validatedDeps);
  }, logger);
}
