export interface AITextModelPort {
  /**
   * Génère un texte à partir d'un prompt (Markdown attendu)
   */
  generateText(prompt: string): Promise<string>;

  /**
   * Génère un texte en streaming (chunks progressifs)
   * @param prompt Prompt POML ou texte
   * @returns AsyncGenerator qui yield chaque chunk de texte
   */
  generateTextStream?(prompt: string): AsyncGenerator<string, void, unknown>;
}
