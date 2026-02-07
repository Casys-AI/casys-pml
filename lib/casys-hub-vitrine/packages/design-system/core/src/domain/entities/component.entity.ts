/**
 * Définition d'une propriété de composant
 */
export interface PropDefinition {
  /** Type TypeScript de la propriété */
  type: string;

  /** Indique si la propriété est requise */
  required: boolean;

  /** Valeur par défaut de la propriété, si définie */
  default?: string;

  /** Description de la propriété */
  description?: string;
}

/**
 * Définition d'un composant Astro
 */
export interface ComponentDefinition {
  /** Identifiant unique du composant */
  id: string;

  /** Nom du composant */
  name: string;

  /** Catégorie principale du composant (ex: metrics, mindmaps) */
  category: string;

  /** Sous-catégorie du composant (ex: performance, concept) */
  subcategory: string;

  /** Chemin relatif du fichier du composant */
  filePath: string;

  /** Description du composant */
  description: string;

  /** Propriétés du composant */
  props: Record<string, PropDefinition>;

  /** Tags associés au composant */
  tags: string[];

  /** Cas d'utilisation du composant */
  useCases: string[];

  /** Composants liés ou similaires */
  related?: string[];

  /** Identifiant du tenant (utilisateur, projet) */
  tenantId?: string;

  /** Identifiant du projet */
  projectId?: string;

  /** Métadonnées additionnelles (IA, configuration, etc.) */
  metadata?: {
    ai_metadata?: {
      semantic_purpose?: string;
      input_requirements?: string;
      output_format?: string;
      complexity?: 'low' | 'medium' | 'high';
    };
    [key: string]: unknown;
  };
}

/**
 * Types utilitaires pour les use cases de composants
 */

/** Identifiants de base pour les opérations sur les composants */
export interface ComponentIdentifiers {
  componentId: string;
  tenantId?: string;
  projectId?: string;
}

/** Résultat de base pour les opérations sur les composants */
export interface ComponentOperationResult {
  success: boolean;
  message: string;
}

/** Résultat d'opération avec identifiants */
export interface ComponentOperationWithIds extends ComponentOperationResult, ComponentIdentifiers {}

/** Types utilitaires pour les résultats de listing */
export interface ComponentListingResult<T extends 'global' | 'tenant' | 'project' | 'article'> {
  components: ComponentDefinition[];
  total: number;
  scope: T;
}

export type ComponentListingGlobal = ComponentListingResult<'global'>;

export interface ComponentListingTenant extends ComponentListingResult<'tenant'> {
  tenantId: string;
  components: (ComponentDefinition & {
    projectId: string;
    projectName: string;
  })[];
}

export interface ComponentListingProject extends ComponentListingResult<'project'> {
  tenantId: string;
  projectId: string;
}

export interface ComponentListingArticle extends ComponentListingResult<'article'> {
  tenantId: string;
  projectId: string;
  articleId: string;
}

/**
 * Résultat de recherche de composant
 */
export interface ComponentSearchResult {
  /** Identifiant du composant */
  id: string;

  /** Score de pertinence */
  score: number;

  /** Métadonnées partielles du composant */
  metadata: Partial<ComponentDefinition>;
}

/**
 * Représente l'utilisation d'un composant dans un fragment de texte
 */
export interface ComponentUsage {
  /** Identifiant unique de l'usage */
  id: string;

  /** Identifiant du composant utilisé */
  componentId: string;

  /** Identifiant du fragment de texte où le composant est utilisé */
  textFragmentId: string;

  /** Propriétés passées au composant */
  props: Record<string, unknown>;

  /** Position dans le fragment */
  position: number;

  /** Indique si ce composant remplace un titre de section */
  isSectionHeader?: boolean;
}
