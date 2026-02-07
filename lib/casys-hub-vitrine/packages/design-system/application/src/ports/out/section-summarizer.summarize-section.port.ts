/**
 * Port de sortie : SectionSummarizer - action: summarize section
 * Résume intelligemment le contenu d'une section en 2-3 phrases
 */
export interface SectionSummarizerSummarizeSectionPort {
  /**
   * Résume une section d'article via un prompt POML
   * @param pomlPrompt Prompt POML complet avec le contenu de la section
   * @returns Résumé structuré avec idées clés
   */
  summarizeSection(pomlPrompt: string): Promise<{
    summary: string;
    keyPoints: string[];
  }>;
}
