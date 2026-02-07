/**
 * DTO représentant un composant avec ses métadonnées
 * Utilisé pour les listes de composants et la présentation sommaire
 */
export interface ComponentMetadataDTO {
  /** Identifiant unique du composant */
  id: string;

  /** Nom du composant */
  name: string;

  /** Catégorie principale du composant */
  category: string;

  /** Sous-catégorie du composant */
  subcategory: string;

  /** Description du composant */
  description: string;

  /** Tags associés au composant */
  tags: string[];

  /** Cas d'utilisation du composant */
  useCases: string[];

  /** Contexte du composant */
  tenantId?: string;
  projectId?: string;

  /** Statistiques d'utilisation */
  usageCount?: number;
}

/**
 * DTO pour la réponse des endpoints de listing de composants
 * Contient la liste de composants avec métadonnées et informations complémentaires
 */
export interface ComponentListResponseDTO {
  /** Liste des composants avec leurs métadonnées */
  components: ComponentMetadataDTO[];

  /** Nombre total de composants */
  count: number;

  /** Message informatif */
  message: string;

  /** Portée de la liste (global, tenant, project, article) */
  scope: 'global' | 'tenant' | 'project' | 'article';

  /** Contexte de la liste */
  tenantId?: string;
  projectId?: string;
  articleId?: string;
}

/**
 * DTO pour la réponse des endpoints de recherche de composants
 */
export interface ComponentSearchResponseDTO {
  /** Résultats de recherche */
  results: {
    id: string;
    score: number;
    component: ComponentMetadataDTO;
  }[];

  /** Nombre total de résultats */
  count: number;

  /** Terme de recherche */
  query: string;
}
