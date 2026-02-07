import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { PromptTemplatePort } from '@casys/application';

/**
 * Adaptateur FS pour le chargement de templates POML.
 * - Base injectée via DI (fail-fast si non définie)
 * - Empêche le path traversal
 * - Valide l'existence et le contenu non vide
 */
export class FsPromptTemplateAdapter implements PromptTemplatePort {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    if (!baseDir || baseDir.trim().length === 0) {
      throw new Error(
        "[FsPromptTemplateAdapter] baseDir requis et non fourni (fail-fast). Injectez la base des blueprints via le container d'infrastructure."
      );
    }
    this.baseDir = path.resolve(baseDir);
  }

  async loadTemplate(relativePath: string): Promise<string> {
    if (!relativePath || path.isAbsolute(relativePath)) {
      throw new Error(
        `[FsPromptTemplateAdapter] Chemin de template invalide: '${relativePath}'. Un chemin relatif est requis.`
      );
    }

    const targetPath = path.resolve(this.baseDir, relativePath);

    // Empêcher l’évasion de la base (path traversal)
    const normalizedBase = this.baseDir.endsWith(path.sep) ? this.baseDir : this.baseDir + path.sep;
    const normalizedTarget = targetPath;
    if (!normalizedTarget.startsWith(normalizedBase)) {
      throw new Error(
        `[FsPromptTemplateAdapter] Accès en dehors de la base interdit: '${relativePath}'. Base: ${this.baseDir}`
      );
    }

    // Optionnel: imposer l’extension .poml
    if (!relativePath.toLowerCase().endsWith('.poml')) {
      throw new Error(
        `[FsPromptTemplateAdapter] Extension de template non supportée: '${relativePath}'. Seuls les fichiers .poml sont autorisés.`
      );
    }

    let content: string;
    try {
      content = await fs.readFile(targetPath, 'utf-8');
    } catch (err) {
      throw new Error(
        `[FsPromptTemplateAdapter] Impossible de lire le template: '${relativePath}'. Erreur: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    if (!content || content.trim().length === 0) {
      throw new Error(`[FsPromptTemplateAdapter] Template vide: '${relativePath}'.`);
    }

    return content;
  }
}
