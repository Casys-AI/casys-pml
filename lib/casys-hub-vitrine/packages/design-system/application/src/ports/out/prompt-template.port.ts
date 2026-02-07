/**
 * Port domaine pour le chargement de templates POML.
 * Aucune stratégie implicite: la résolution du chemin est déléguée à l'adaptateur (infrastructure).
 */
export interface PromptTemplatePort {
  /**
   * Charge le contenu texte d'un template à partir d'un chemin relatif à une racine contrôlée (ex: CASYS_BLUEPRINTS_ROOT).
   * Fail-fast si le fichier est introuvable, vide, ou inaccessible.
   */
  loadTemplate(relativePath: string): Promise<string>;
}
