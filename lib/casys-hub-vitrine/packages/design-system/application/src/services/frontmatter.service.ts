import type { ProjectConfig } from '@casys/shared';
import type { ArticleStructure } from '@casys/core';

import type { FrontmatterGeneratorPort, FrontmatterTarget, GeneratedFrontmatter } from '../ports/out';

/**
 * Service de domaine pour orchestrer la génération de frontmatter multi-cibles.
 * - Sélectionne l'adaptateur (via port) selon la configuration projet
 * - Valide la présence des options critiques (fail-fast)
 */
export class FrontmatterService {
  constructor(private readonly generators: Map<FrontmatterTarget, FrontmatterGeneratorPort>) {}

  private resolveTarget(project: ProjectConfig): FrontmatterTarget {
    const type = project.type;
    if (type === 'astro') return 'astro';
    if (type === 'hugo') return 'hugo';
    throw new Error(
      `[FrontmatterService] project.type="${type}" non supporté pour la génération de frontmatter (supportés: "astro", "hugo")`
    );
  }

  private assertCanonicalBase(project: ProjectConfig): void {
    const base = project.publication?.canonicalBaseUrl?.trim();
    if (!base) {
      throw new Error(
        '[FrontmatterService] publication.canonicalBaseUrl requis et non vide (fail-fast)'
      );
    }
  }

  private assertProfile(project: ProjectConfig): void {
    const profile = project.publication?.frontmatter?.profile?.trim();
    if (!profile) {
      throw new Error('[FrontmatterService] publication.frontmatter.profile requis (fail-fast)');
    }
  }

  async generateForProject(
    article: ArticleStructure,
    project: ProjectConfig
  ): Promise<GeneratedFrontmatter> {
    // Validations fail-fast
    const target = this.resolveTarget(project);
    this.assertCanonicalBase(project);
    this.assertProfile(project);

    const generator = this.generators.get(target);
    if (!generator) {
      throw new Error(`[FrontmatterService] Aucun générateur enregistré pour la cible: ${target}`);
    }

    return generator.generate(article, project);
  }
}
