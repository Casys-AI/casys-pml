import type { Domain } from '@casys/core';

/**
 * Port pour l'agent d'analyse de contexte business.
 * Infère l'industry, targetAudience, contentType et businessDescription
 * à partir des métriques domaine (top keywords, trafic, etc.)
 */
export interface BusinessContextAnalysisInput {
  domain: Domain;
  topKeywords?: { keyword: string; position?: number; searchVolume?: number }[];
  organicTraffic?: number;
  backlinksCount?: number;
  language?: string;
  /** Optional summary of scraped pages content to help inference when metrics are missing */
  pagesSummary?: string;
}

/**
 * Persona profile details
 */
export interface PersonaProfileDetails {
  demographics: string;     // ex: "25-40 ans, indépendants ou petites équipes"
  psychographics: string;   // ex: "Créatifs, autonomes, orientés qualité"
  techSavviness: string;    // ex: "Intermédiaire", "Avancé", "Débutant"
}

/**
 * Persona model for target audience segments
 */
export interface PersonaProfile {
  category: string;          // ex: "Artisans du digital"
  archetype: string;         // ex: "Freelances créatifs"
  emoji?: string;           // ex: "🎨"
  profile: PersonaProfileDetails;
  painPoints: string[];     // Points de douleur principaux
  motivations: string[];    // Motivations principales
  messagingAngle: string;   // ex: "Libérez votre créativité, on s'occupe du reste"
}

export interface BusinessContextAnalysisResult {
  industry: string;
  targetAudience: string;
  contentType: string;
  businessDescription: string;
  /** Type of site: "saas", "e-commerce", "blog", "corporate", etc. */
  siteType?: string;
  /** Detailed personas (2-3 max) */
  personas?: PersonaProfile[];
  /** Raw AI analysis output (optional, for debugging/display) */
  rawAnalysis?: string;
}

export interface BusinessContextAnalysisAgentPort {
  analyze(input: BusinessContextAnalysisInput): Promise<BusinessContextAnalysisResult>;
}
