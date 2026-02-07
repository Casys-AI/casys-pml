/**
 * DTO représentant l'utilisation d'un composant dans une section d'article
 * Sert de relation many-to-many entre les sections et les composants
 */
export interface ComponentUsageDTO {
  /** Identifiant unique de l'usage */
  id: string;

  /** Identifiant du composant utilisé */
  componentId: string;

  /** Identifiant de la section où le composant est utilisé */
  sectionId: string;

  /** Propriétés passées au composant */
  props: Record<string, unknown>;

  /** Position dans la section */
  position: number;

  /** Indique si ce composant remplace un titre de section */
  isSectionHeader?: boolean;
}

/**
 * DTO pour la réponse des endpoints de listing d'usages de composants
 */
export interface ComponentUsageListResponseDTO {
  /** Liste des usages de composants */
  usages: ComponentUsageDTO[];

  /** Nombre total d'usages */
  count: number;

  /** Message informatif */
  message: string;

  /** Contexte de la liste */
  sectionId?: string;
  articleId?: string;
  componentId?: string;
}

/**
 * DTO pour la réponse d'une opération sur un usage de composant
 */
export interface ComponentUsageOperationResponseDTO {
  /** Succès de l'opération */
  success: boolean;

  /** Message informatif */
  message: string;

  /** Usage de composant concerné (si applicable) */
  usage?: ComponentUsageDTO;
}
