/**
 * DTO principal pour Lead Analysis
 * Représente un snapshot complet de l'analyse d'un lead (site web)
 */

import type { BusinessContextDTO } from './business-context.dto';
import type { DomainMetricsDTO } from './domain-metrics.dto';
import type { DomainOntologyDTO } from './ontology.dto';

/**
 * Keywords seeds (proposés et sélectionnés)
 */
export interface LeadSeedsDTO {
  proposed: string[];   // Keywords proposés par l'IA
  selected: string[];   // Keywords sélectionnés par l'utilisateur
}

/**
 * Lead Snapshot - Résultat complet d'une analyse de lead
 * Utilisé par l'API /api/lead/* et consommé par le dashboard Angular
 */
export interface LeadSnapshotDTO {
  // Identity
  id: string;
  domain: string;
  createdAt: string;      // ISO 8601
  updatedAt: string;      // ISO 8601
  version: number;
  etag: string;

  // Step 1: Domain Identity & Overview
  seeds?: LeadSeedsDTO;
  metrics?: DomainMetricsDTO;
  businessContext?: BusinessContextDTO;
  ontology?: DomainOntologyDTO;

  // Step 2: Opportunities (enrichissement ultérieur)
  keywordMetrics?: Array<{
    keyword: string;
    searchVolume?: number;
    difficulty?: number;
    cpc?: number;
    competition?: 'low' | 'medium' | 'high';
  }>;

  trends?: Array<{
    keyword: string;
    trend: 'rising' | 'stable' | 'declining';
    relatedQueries?: string[];
  }>;

  competitors?: Array<{
    title: string;
    description?: string;
    keywords?: string[];
    url?: string;
  }>;

  // Step 3: Strategy (keyword plan)
  keywordPlan?: {
    tags: Array<{
      label: string;
      slug: string;
      source: 'seed' | 'opportunity' | 'trend' | 'ai';
      searchVolume?: number;
      difficulty?: number;
      competition?: 'low' | 'medium' | 'high';
    }>;
    contentGaps: Array<{ keyword: string; reason: string; details?: string }>;
    recommendations: string[];
  };

  searchIntent?: {
    intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
    confidence: number;
  };
}
