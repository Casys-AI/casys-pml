import type { Logger } from '../../utils/logger';

/**
 * Feature gating: deux types de factories pour gérer les dépendances
 * 
 * OPTIONAL FACTORY:
 * - Retourne undefined si deps manquantes
 * - La route renvoie 501 "feature_unavailable"
 * - Utilisé pour features annexes (SEO, lead analysis, etc.)
 * 
 * REQUIRED FACTORY:
 * - Throw Error si deps manquantes
 * - Crash au boot si impossible
 * - Utilisé pour features core/contractuelles (generate article, etc.)
 */

export interface FactoryResult<T> {
  success: boolean;
  value?: T;
  missing?: string[];
  error?: string;
}

/**
 * Wrapper pour factory optionnelle
 * Retourne undefined si la factory échoue
 */
export function optionalFactory<T>(
  factoryName: string,
  buildFn: () => T | undefined,
  logger?: Logger
): T | undefined {
  try {
    const result = buildFn();
    if (!result) {
      logger?.debug?.(`[FeatureGate] OFF ${factoryName}: build returned undefined`);
      return undefined;
    }
    return result;
  } catch (error) {
    logger?.debug?.(`[FeatureGate] OFF ${factoryName}:`, error);
    return undefined;
  }
}

/**
 * Wrapper pour factory requise
 * Throw si la factory échoue (crash au boot)
 */
export function requiredFactory<T>(
  factoryName: string,
  buildFn: () => T | undefined,
  logger?: Logger
): T {
  try {
    const result = buildFn();
    if (!result) {
      const errorMsg = `[Fatal] ${factoryName} required but build returned undefined`;
      logger?.error?.(errorMsg);
      throw new Error(errorMsg);
    }
    return result;
  } catch (error) {
    const errorMsg = `[Fatal] ${factoryName} boot failure: ${error instanceof Error ? error.message : String(error)}`;
    logger?.error?.(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Valide les dépendances et retourne les deps manquantes
 */
export function validateDeps(
  deps: Record<string, unknown>,
  required: string[]
): { valid: boolean; missing: string[] } {
  const missing = required.filter(key => !deps[key]);
  return { valid: missing.length === 0, missing };
}
