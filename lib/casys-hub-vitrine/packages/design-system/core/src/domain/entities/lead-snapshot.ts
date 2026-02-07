import type { DomainOntology } from './ontology.entity';
import type { KeywordTag } from '../types/seo.types';

/**
 * Lead Graph Node
 */
export interface LeadGraphNode {
  id: string;
  type: 'page' | 'tag';
  label?: string; // Optional for blurred preview
}

/**
 * Lead Graph Edge
 */
export interface LeadGraphEdge {
  id: string;
  source: string;
  target: string;
  weight?: number;
}

/**
 * Lead Graph
 */
export interface LeadGraph {
  nodes: LeadGraphNode[];
  edges: LeadGraphEdge[];
}

/**
 * Lead Seeds (proposed and selected keywords)
 */
export interface LeadSeeds {
  proposed: string[];
  selected: string[];
}

/**
 * Lead Snapshot - Main entity for lead analysis results
 * Represents the complete state of a lead analysis at a given time
 */
export interface LeadSnapshot {
  // Identity
  id: string;
  domain: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  etag: string;

  // Step 1: Domain Identity
  seeds?: LeadSeeds;
  domainMetrics?: {
    domainRank?: number;
    organicTraffic?: number;
    backlinksCount?: number;
    referringDomains?: number;
    topKeywords?: { keyword: string; position?: number; searchVolume?: number }[];
  };
  ontology?: DomainOntology;
  businessContext?: {
    industry?: string;
    targetAudience?: string;
    contentType?: string;
    businessDescription?: string;
    rawAnalysis?: string;
  };

  // Keywords discovered with AI enrichment (Step 1)
  discoveredKeywords?: KeywordTag[];

  // Step 2: Opportunities (populated later)
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
    intent: 'informational' | 'navigational' | 'transactional' | 'commercial';
    confidence: number;
  };

  // Graphs (for preview/unlock flow)
  graphPreview?: LeadGraph; // Redacted version for preview
  graphFull?: LeadGraph; // Full version, requires unlock
}

/**
 * Lead Unlock Record
 */
export interface LeadUnlockRecord {
  domain: string;
  email: string;
  token: string;
  createdAt: string;
}
