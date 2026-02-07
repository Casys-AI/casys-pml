/**
 * Ontologie SEO d'un domaine
 * Représente les concepts clés, leurs relations et leur importance SEO
 */

export type OntologyNodeType = 'service' | 'feature' | 'benefit' | 'audience' | 'topic' | 'product';
export type OntologyEdgeType = 'includes' | 'relates_to' | 'targets' | 'provides' | 'requires';

export interface OntologyNode {
  /** Identifiant unique (slug) */
  id: string;
  /** Label lisible */
  label: string;
  /** Type de concept */
  type: OntologyNodeType;
  /** Description courte (1 phrase) */
  description?: string;
  /** Keywords associés (synonymes, variations) */
  keywords: string[];
  /** Niveau hiérarchique (1=racine, 2=sous-concept) */
  level?: number;
  /** Volume SEO agrégé (somme des volumes des keywords) */
  volume: number;
  /** Position moyenne dans les SERPs */
  avgPosition?: number;
  /** Métadonnées */
  metadata?: {
    source: 'ai' | 'nlp' | 'ranked' | 'hybrid';
    confidence: number;
    extractedFrom?: string[]; // URLs sources
  };
}

export interface OntologyEdge {
  /** Identifiant unique */
  id: string;
  /** ID du nœud source */
  from: string;
  /** ID du nœud cible */
  to: string;
  /** Type de relation */
  type: OntologyEdgeType;
  /** Force de la relation (0-1) */
  weight: number;
  /** Métadonnées */
  metadata?: {
    source: 'ai' | 'inferred';
    confidence: number;
  };
}

export interface DomainOntology {
  /** Domaine analysé */
  domain: string;
  /** Nœuds (concepts) */
  nodes: OntologyNode[];
  /** Arêtes (relations) */
  edges: OntologyEdge[];
  /** Date de création */
  createdAt: string;
  /** Version de l'ontologie */
  version: number;
  /** Métadonnées globales */
  metadata?: {
    totalVolume: number;
    avgConfidence: number;
    pagesAnalyzed?: number;
    keywordsAnalyzed?: number;
  };
}

/**
 * Résultat de l'extraction NLP
 */
export interface NLPExtraction {
  /** Termes extraits avec fréquence */
  terms: {
    text: string;
    frequency: number;
    type: 'noun' | 'verb' | 'adjective' | 'phrase';
  }[];
  /** Entités nommées */
  entities: {
    text: string;
    type: 'person' | 'organization' | 'location' | 'product' | 'other';
  }[];
  /** Topics principaux */
  topics: string[];
}
