/**
 * DTOs pour l'ontologie de domaine (Step 1 - Overview)
 * Générée par OntologyBuilder à partir du contenu du site
 */

/**
 * Noeud de l'ontologie (topic découvert)
 */
export interface OntologyNodeDTO {
  id: string;
  label: string;
  type?: string;              // ex: "topic", "category", "product"
  keywords?: string[];
  description?: string;
  level?: number;             // Niveau hiérarchique (0 = root)
  volume?: number;            // Search volume si disponible
  metadata?: Record<string, unknown>;
}

/**
 * Relation entre noeuds de l'ontologie
 */
export interface OntologyEdgeDTO {
  id: string;
  source: string;             // ID du noeud source
  target: string;             // ID du noeud cible
  type?: string;              // ex: "related_to", "subcategory_of"
  label?: string;             // Label de la relation
  weight?: number;            // Force de la relation (0-1)
}

/**
 * Ontologie complète du domaine
 */
export interface DomainOntologyDTO {
  nodes: OntologyNodeDTO[];
  edges: OntologyEdgeDTO[];
}
