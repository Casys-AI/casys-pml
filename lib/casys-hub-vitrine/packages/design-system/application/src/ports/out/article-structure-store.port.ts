import { type ArticleNode, type ArticleStructure, type SectionNode } from '@casys/core';

/**
 * Port définissant les opérations de stockage et de modification pour la structure hiérarchique des articles
 * Séparé du port de listing pour respecter le principe de séparation des responsabilités
 */
export interface ArticleStructureStorePort {
  /**
   * Indexe un article complet avec sa structure hiérarchique
   * @param articleStructure Structure complète de l'article
   * @param tenantId ID du tenant (optionnel)
   */
  indexArticleStructure(articleStructure: ArticleStructure, tenantId?: string): Promise<void>;

  /**
   * Supprime un article et toute sa structure
   * @param articleId ID de l'article
   * @param tenantId ID du tenant (optionnel)
   */
  deleteArticleStructure(articleId: string, tenantId?: string): Promise<void>;

  /**
   * Upsert de l'outline d'un article (Article + sections sans contenu)
   * Permet l'indexation progressive immédiatement après la génération de l'outline.
   * Si un EmbeddingPort est disponible côté adaptateur, il peut générer un embedding
   * à partir de `title + "\n\n" + description` pour le nœud Article.
   */
  upsertOutline(article: ArticleNode, sections: SectionNode[], tenantId?: string): Promise<void>;

  /**
   * Upsert d'une section (titre/position/parent). Ne gère pas le contenu.
   */
  upsertSection(section: SectionNode, projectId: string, tenantId?: string): Promise<void>;

  /**
   * Mise à jour du contenu d'une section existante. L'adaptateur peut régénérer
   * l'embedding de la section (titre + contenu) si un EmbeddingPort est injecté.
   */
  updateSectionContent(
    sectionId: string,
    content: string,
    projectId: string,
    tenantId?: string,
    summary?: string
  ): Promise<void>;

  /**
   * Lier une section à un article interne pour le maillage interne
   * Crée la relation (Section)-[:REFERENCES]->(Article)
   */
  linkSectionToArticle(params: {
    sectionId: string;
    articleId: string;
    tenantId: string;
    projectId: string;
  }): Promise<void>;
}
