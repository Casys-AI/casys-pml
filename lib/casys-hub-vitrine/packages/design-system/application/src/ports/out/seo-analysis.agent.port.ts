import type { KeywordPlanDTO, SearchIntentDataDTO } from '@casys/shared';

/**
 * Port pour l'agent d'analyse SEO
 * Génère un brief SEO (keywordPlan + searchIntent) à partir d'un prompt POML
 */
export interface SeoAnalysisAgentPort {
  /** Chemin générique (LLM/agent) - forward du prompt POML */
  invoke(pomlPrompt: string): Promise<string>;
  
  /** 
   * Chemin typé - parse et structure la réponse JSON
   * @param pomlPrompt - Prompt POML complet avec données DataForSEO
   * @returns Analyse SEO structurée (keywordPlan + searchIntent)
   */
  analyze?(pomlPrompt: string): Promise<{
    keywordPlan: KeywordPlanDTO;
    searchIntent: SearchIntentDataDTO;
  }>;
}

export type ISeoAnalysisAgentPort = SeoAnalysisAgentPort;
