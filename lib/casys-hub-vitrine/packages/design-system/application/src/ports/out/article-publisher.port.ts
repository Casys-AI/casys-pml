import type { ArticleStructure } from '@casys/core';

/**
 * Port pour la publication d'articles (ex: GitHub, CMS, etc.)
 *
 * Principe: l'adaptateur se charge de transformer la structure d'article
 * en artefact(s) publiables (MDX, assets) et de pousser la ressource vers
 * la cible (ex: repo GitHub) en gérant l'authentification et les erreurs.
 */
export interface ArticlePublisherPort {
  /**
   * Publie un article vers une cible externe (ex: GitHub repo)
   * @param article Structure d'article générée
   * @param tenantId Identifiant du tenant
   * @param projectId Identifiant du projet
   * @returns Informations sur la ressource distante créée/modifiée
   */
  publishArticle(
    article: ArticleStructure,
    tenantId: string,
    projectId: string
  ): Promise<{
    url: string; // URL web de la ressource (ex: blob GitHub)
    path: string; // Chemin dans la cible (ex: chemin dans le repo)
    success: boolean;
    commitSha?: string; // Référence du commit créé/maj
  }>;
}
