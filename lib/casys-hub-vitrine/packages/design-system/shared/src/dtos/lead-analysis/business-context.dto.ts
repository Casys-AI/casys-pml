/**
 * DTOs pour le Business Context (Step 1 - Overview)
 * Utilisés par le dashboard Angular et l'API lead analysis
 */

/**
 * Détails du profil persona
 */
export interface PersonaProfileDetailsDTO {
  demographics: string;     // ex: "25-40 ans, indépendants ou petites équipes"
  psychographics: string;   // ex: "Créatifs, autonomes, orientés qualité"
  techSavviness: string;    // ex: "Intermédiaire", "Avancé", "Débutant"
}

/**
 * Profil persona complet
 * Généré par BusinessContextAnalysisAgent
 */
export interface PersonaProfileDTO {
  category: string;          // ex: "Artisans du digital"
  archetype: string;         // ex: "Freelances créatifs"
  emoji?: string;           // ex: "🎨"
  profile: PersonaProfileDetailsDTO;
  painPoints: string[];     // Points de douleur principaux
  motivations: string[];    // Motivations principales
  messagingAngle: string;   // ex: "Libérez votre créativité, on s'occupe du reste"
}

/**
 * Business Context complet
 * Sortie de BusinessContextAnalysisAgent.analyze()
 */
export interface BusinessContextDTO {
  // Core information
  industry: string;                // ex: "Marketing Technology"
  siteType?: string;              // ex: "saas", "e-commerce", "blog"
  targetAudience: string;         // ex: "PME et agences marketing"
  businessDescription?: string;   // Description complète de l'entreprise
  contentType?: string;           // ex: "product pages + blog"

  // Target audience personas (max 3 recommandé pour UI)
  personas?: PersonaProfileDTO[];

  // Optional - raw LLM analysis if needed
  rawAnalysis?: string;
}