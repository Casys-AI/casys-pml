// TrendAnalyzerService removed/unavailable; container no longer wires it here.
/**
 * Services Core - approche Hono-native (DEPRECATED)
 *
 * IMPORTANT: Ce container est obsolète. Les services ont été déplacés vers @casys/application.
 * Utiliser `createApplicationServices` dans @casys/application à la place.
 *
 * Services déplacés: ArticleIndexingService, ComponentVectorSearchService, etc.
 * Raison: éviter dépendance inversée core → application (les services dépendent des ports OUT)
 */

export interface CoreServices {
  // Ports/Adapters externes à injecter
  // Utilisation de 'unknown' pour éviter dépendance inversée core → application
  articleFetcher?: unknown;
  articleStructureStore?: unknown;
  articleStructureRepository?: unknown;
  componentSearchPort?: unknown;

  // Logger optionnel injecté (adapté côté infra)
  logger?: {
    debug?: (msg: string, ...args: unknown[]) => void;
    warn?: (msg: string, ...args: unknown[]) => void;
    error?: (msg: string, error?: unknown) => void;
    log?: (msg: string, ...args: unknown[]) => void;
  };
}

/**
 * Factory pour créer les services Core (DEPRECATED - retourne objet vide)
 *
 * @deprecated Utiliser createApplicationServices dans @casys/application
 * Ce container ne fait plus rien car tous les services ont été déplacés.
 */
export function createCoreServices(_dependencies: CoreServices): Record<string, never> {
  console.warn(
    '[DEPRECATED] createCoreServices is obsolete. Use createApplicationServices from @casys/application instead.'
  );
  return {};
}
