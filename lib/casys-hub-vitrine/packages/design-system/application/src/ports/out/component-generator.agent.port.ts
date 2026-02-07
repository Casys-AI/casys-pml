export interface ComponentGeneratorAgentPort {
  /**
   * Génère des props pour un composant à partir d'un commentaire utilisateur
   * et des métadonnées du composant sélectionné.
   */
  generateProps(
    comment: string,
    componentMetadata: Record<string, unknown>
  ): Promise<{
    props: Record<string, unknown>;
    reasoning: string;
    confidence: number; // 0..1
  }>;
}
export type ComponentGeneratorAgent = ComponentGeneratorAgentPort;
