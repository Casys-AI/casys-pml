import {
  type IndexComponentsUseCaseDeps,
  IndexComponentsUseCaseImpl,
  type ListComponentsUseCaseDeps,
  ListComponentsUseCaseImpl,
} from '@casys/application';

import type { Logger } from '../../utils/logger';
import { IndexComponentsDepsSchema, ListComponentsDepsSchema } from '../schemas/ports.schema';
import { optionalFactory, validateDeps } from './factory-helpers';

/**
 * Type predicate pour narrower Partial<IndexComponentsUseCaseDeps> vers IndexComponentsUseCaseDeps
 * Vérifie que les dépendances critiques sont présentes
 */
function isFullIndexComponentsDeps(
  deps: Partial<IndexComponentsUseCaseDeps>
): deps is IndexComponentsUseCaseDeps {
  return !!deps.componentUsageStore;
}

/**
 * Type predicate pour narrower Partial<ListComponentsUseCaseDeps> vers ListComponentsUseCaseDeps
 * Vérifie que les dépendances critiques sont présentes
 */
function isFullListComponentsDeps(
  deps: Partial<ListComponentsUseCaseDeps>
): deps is ListComponentsUseCaseDeps {
  return !!deps.componentListing;
}

/**
 * Build IndexComponentsUseCase
 * Pattern OPTIONAL: retourne undefined si deps critiques manquantes
 */
export function buildIndexComponentsUseCase(
  infraServices: Record<string, unknown>,
  logger?: Logger
): IndexComponentsUseCaseImpl | undefined {
  return optionalFactory('indexComponentsUseCase', () => {
    // ✅ Validation Zod
    const result = IndexComponentsDepsSchema.safeParse({
      componentUsageStore: infraServices.componentUsageStore,
      componentVectorStore: infraServices.componentVectorStore,
    });

    if (!result.success) {
      logger?.debug?.('[FeatureGate] OFF indexComponentsUseCase: Zod validation failed', {
        errors: result.error.issues,
      });
      return undefined;
    }

    const validatedDeps = result.data;

    // Valider les deps critiques
    const validation = validateDeps(validatedDeps, ['componentUsageStore']);
    if (!validation.valid) {
      logger?.debug?.('[FeatureGate] OFF indexComponentsUseCase: missing critical deps', {
        missing: validation.missing,
      });
      return undefined;
    }

    // Feature gating : vérifier que toutes les dépendances sont présentes avec type predicate
    if (!isFullIndexComponentsDeps(validatedDeps)) {
      logger?.debug?.('[FeatureGate] OFF indexComponentsUseCase: type predicate failed');
      return undefined;
    }

    // ✅ validatedDeps est maintenant typé comme IndexComponentsUseCaseDeps (narrowed par type predicate)
    // Note: Le constructeur attend seulement 'indexing' (componentUsageStore)
    return new IndexComponentsUseCaseImpl(validatedDeps.componentUsageStore);
  }, logger);
}

/**
 * Build ListComponentsUseCase
 * Pattern OPTIONAL: retourne undefined si deps critiques manquantes
 */
export function buildListComponentsUseCase(
  infraServices: Record<string, unknown>,
  logger?: Logger
): ListComponentsUseCaseImpl | undefined {
  return optionalFactory('listComponentsUseCase', () => {
    // ✅ Validation Zod
    const result = ListComponentsDepsSchema.safeParse({
      componentListing: infraServices.componentListing,
    });

    if (!result.success) {
      logger?.debug?.('[FeatureGate] OFF listComponentsUseCase: Zod validation failed', {
        errors: result.error.issues,
      });
      return undefined;
    }

    const validatedDeps = result.data;

    // Valider les deps critiques
    const validation = validateDeps(validatedDeps, ['componentListing']);
    if (!validation.valid) {
      logger?.debug?.('[FeatureGate] OFF listComponentsUseCase: missing critical deps', {
        missing: validation.missing,
      });
      return undefined;
    }

    // Feature gating : vérifier que la dépendance est présente avec type predicate
    if (!isFullListComponentsDeps(validatedDeps)) {
      logger?.debug?.('[FeatureGate] OFF listComponentsUseCase: type predicate failed');
      return undefined;
    }

    // ✅ validatedDeps est maintenant typé comme ListComponentsUseCaseDeps (narrowed par type predicate)
    return new ListComponentsUseCaseImpl(validatedDeps.componentListing);
  }, logger);
}
