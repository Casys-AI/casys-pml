import { type ArticleStructure } from '@casys/core';

/**
 * Port pour accéder aux structures d'articles avec granularité tenant/project dans le graph
 */
export interface ArticleStructureRepositoryPort {
  /**
   * Trouve toutes les structures d'articles dans l'arborescence complète
   */
  findAll(): Promise<ArticleStructure[]>;

  /**
   * Trouve toutes les structures d'articles d'un tenant
   */
  findByTenant(tenantId: string): Promise<ArticleStructure[]>;

  /**
   * Liste les projets existants pour un tenant donné
   */
  listProjectsByTenant(tenantId: string): Promise<string[]>;

  /**
   * Trouve toutes les structures d'articles d'un projet spécifique
   */
  findByProject(tenantId: string, projectId: string): Promise<ArticleStructure[]>;

  /**
   * Trouve une structure d'article par son ID (recherche dans toute l'arborescence)
   */
  findById(articleId: string): Promise<ArticleStructure | null>;

  /**
   * Trouve une structure d'article par son chemin exact
   */
  findByPath(
    tenantId: string,
    projectId: string,
    fileName: string
  ): Promise<ArticleStructure | null>;

  /**
   * Sauvegarde une structure d'article (CRUD)
   */
  save(articleStructure: ArticleStructure): Promise<void>;

  /**
   * Supprime une structure d'article par son ID
   */
  delete(articleId: string): Promise<void>;
}
