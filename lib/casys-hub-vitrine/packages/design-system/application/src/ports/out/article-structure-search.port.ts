import { type ArticleSearchResult } from '@casys/core/src/domain/entities/article-structure.entity';

/**
 * Port définissant les opérations de recherche dans les articles
 * Sépare les préoccupations : recherche vs CRUD
 * Support pour recherche textuelle, sémantique, et hybride avec Graph RAG
 */
export interface ArticleStructureSearchPort {
  // ===== RECHERCHE SÉMANTIQUE =====

  /**
   * Recherche sémantique d'articles par similarité d'embeddings
   * Recherche sur les métadonnées (title + description + keywords + sources)
   * @param queryText Texte de la requête
   * @param tenantId ID du tenant (optionnel)
   * @param limit Nombre maximum de résultats (optionnel)
   * @param threshold Seuil de similarité minimum (optionnel, défaut: 0.6)
   */
  searchArticlesByEmbedding(
    queryText: string,
    tenantId?: string,
    limit?: number,
    threshold?: number
  ): Promise<ArticleSearchResult[]>;

  /**
   * Recherche sémantique de sections par similarité d'embeddings
   * Recherche sur le contenu complet des sections (title + content)
   * @param queryText Texte de la requête
   * @param tenantId ID du tenant (optionnel)
   * @param limit Nombre maximum de résultats (optionnel)
   * @param threshold Seuil de similarité minimum (optionnel, défaut: 0.6)
   */
  searchSectionsByEmbedding(
    queryText: string,
    tenantId?: string,
    limit?: number,
    threshold?: number
  ): Promise<ArticleSearchResult[]>;

  /**
   * Recherche sémantique de fragments de texte par similarité d'embeddings
   * Recherche sur le contenu des fragments annotés
   * @param queryText Texte de la requête
   * @param tenantId ID du tenant (optionnel)
   * @param limit Nombre maximum de résultats (optionnel)
   * @param threshold Seuil de similarité minimum (optionnel, défaut: 0.7)
   */
  searchTextFragmentsByEmbedding(
    queryText: string,
    tenantId?: string,
    limit?: number,
    threshold?: number
  ): Promise<(ArticleSearchResult & { fragmentId: string; fragmentContent: string })[]>;

  /**
   * Recherche sémantique de commentaires par similarité d'embeddings
   * Recherche sur le contenu contextualisé (fragment + commentaire)
   * @param queryText Texte de la requête
   * @param tenantId ID du tenant (optionnel)
   * @param limit Nombre maximum de résultats (optionnel)
   * @param threshold Seuil de similarité minimum (optionnel, défaut: 0.6)
   */
  searchCommentsByEmbedding(
    queryText: string,
    tenantId?: string,
    limit?: number,
    threshold?: number
  ): Promise<ArticleSearchResult[]>;

  // ===== RECHERCHE HYBRIDE =====

  /**
   * Recherche hybride articles par tags + sémantique
   * Combine graph traversal (tags communs) et similarity search (embeddings)
   * Score composite configurable pour balancer graph vs semantic
   * @param queryText Texte de recherche sémantique
   * @param tags Tags pour graph traversal (optionnel)
   * @param projectId ID du projet
   * @param tenantId ID du tenant
   * @param limit Nombre maximum de résultats (défaut: 10)
   * @param semanticWeight Balance graph vs semantic 0-1 (défaut: 0.5)
   * @param threshold Seuil de similarité sémantique (défaut: 0.65)
   */
  searchArticlesByTagsAndSemantic(params: {
    queryText: string;
    tags?: string[];
    projectId: string;
    tenantId: string;
    limit?: number;
    semanticWeight?: number;
    threshold?: number;
  }): Promise<ArticleSearchResult[]>;

  /**
   * Recherche hybride sections par tags + sémantique (Sections-first RAG)
   * Cible directement les sections mais remonte le contexte article (slug, title, description)
   */
  searchSectionsByTagsAndSemantic(params: {
    queryText: string;
    tags?: string[];
    projectId: string;
    tenantId: string;
    limit?: number;
    semanticWeight?: number;
    threshold?: number;
  }): Promise<ArticleSearchResult[]>;

  /**
   * Recherche hybride intelligente : sémantique + Graph RAG
   * Combine recherche exacte et similarité vectorielle
   * Applique Graph RAG avec enrichissement contextuel multi-niveau
   * Scoring composite : composite_score + parent_context
   * @param queryText Texte de la requête
   * @param tenantId ID du tenant (optionnel)
   * @param limit Nombre maximum de résultats (optionnel)
   * @param projectId ID du projet (optionnel)
   * @param articleId ID de l'article (optionnel)
   */
  searchSectionsHybrid(
    queryText: string,
    tenantId?: string,
    limit?: number,
    projectId?: string,
    articleId?: string
  ): Promise<ArticleSearchResult[]>;

  // ===== RECHERCHE GRAPHE PURE (VOISINAGE PAR POSITION) =====

  /**
   * Recherche des sections voisines par position dans le même article (purement graphe).
   * Exclut la section courante (position exacte) et favorise les plus proches.
   * @param articleId ID de l'article courant
   * @param position Position de la section courante
   * @param window Fenêtre de voisinage (par défaut: 5) → positions [pos-window .. pos+window]\{pos}
   * @param tenantId ID du tenant (optionnel)
   * @param projectId ID du projet (optionnel)
   * @param limit Limite de résultats (optionnel, défaut: 2*window)
   */
  searchSectionsByGraphNeighborhood(
    articleId: string,
    position: number,
    window?: number,
    tenantId?: string,
    projectId?: string,
    limit?: number
  ): Promise<ArticleSearchResult[]>;
}
