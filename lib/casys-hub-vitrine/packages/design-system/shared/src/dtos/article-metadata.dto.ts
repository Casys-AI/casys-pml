/**
 * DTO représentant un article avec ses métadonnées
 * Utilisé pour les listes d'articles et la présentation sommaire
 */
export interface ArticleMetadataDTO {
  id: string;
  title: string;
  description: string;
  language: string;
  tags: string[]; // Tags générés par l'Outline Agent à implémenter
  createdAt?: string;
  tenantId: string;
  projectId: string;
  sectionsCount?: number;
  fragmentsCount?: number;
  commentsCount?: number;
  componentUsagesCount?: number;
}

/**
 * DTO pour la réponse des endpoints de listing d'articles
 * Contient la liste d'articles avec métadonnées et informations complémentaires
 */
export interface ArticleListResponseDTO {
  articles: ArticleMetadataDTO[];
  count: number;
  message: string;
}
