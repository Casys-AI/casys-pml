/**
 * Port pour découvrir les pages importantes d'un site
 */

import type { PageCandidate } from '@casys/core';

// Re-export for convenience
export type { PageCandidate };

export interface PageDiscoveryPort {
  /**
   * Découvre les pages importantes d'un domaine
   * Combine plusieurs sources (sitemap, homepage links, etc.)
   * @param domain Nom du domaine
   * @param maxPages Nombre maximum de pages à retourner
   * @returns Pages candidates triées par score et source
   */
  discoverPages(domain: string, maxPages?: number): Promise<PageCandidate[]>;

  /**
   * Extrait les liens internes d'une page
   * @param content Contenu HTML/Markdown de la page
   * @param domain Domaine pour filtrer les liens internes
   * @returns URLs des liens internes
   */
  extractInternalLinks(content: string, domain: string): string[];
}
