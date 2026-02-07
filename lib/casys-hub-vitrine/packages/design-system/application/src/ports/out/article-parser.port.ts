import { type ArticleStructure } from '@casys/core';

/**
 * Port pour le parsing d'articles à partir de fichiers sources
 */
export interface ArticleParserPort {
  /**
   * Parse un fichier MDX et extrait sa structure hiérarchique
   * @param filePath Chemin complet vers le fichier MDX
   * @param tenantId ID du tenant (optionnel, sera extrait du chemin si non fourni)
   * @param projectId ID du projet (optionnel, sera extrait du chemin si non fourni)
   * @returns Structure complète de l'article parsé
   */
  parseArticleStructure(
    filePath: string,
    tenantId?: string,
    projectId?: string
  ): Promise<ArticleStructure>;

  /**
   * Extrait les liens internes/externes d'un contenu markdown (section)
   */
  extractLinks(markdown: string): {
    internal: string[];
    external: string[];
  };

  /**
   * Extrait les liens section par section pour une structure d'article
   */
  extractLinksForArticle(structure: ArticleStructure): {
    sectionId: string;
    internal: string[];
    external: string[];
  }[];
}
