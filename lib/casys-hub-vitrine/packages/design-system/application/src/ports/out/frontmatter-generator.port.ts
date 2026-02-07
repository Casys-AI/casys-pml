import type { ProjectConfig } from '@casys/shared';
import type { ArticleStructure } from '@casys/core';

export type FrontmatterTarget = 'astro' | 'hugo';

export interface GeneratedFrontmatter {
  // Contenu complet du fichier (frontmatter + corps)
  content: string;
  // Nom de fichier recommandé (ex: slug.mdx)
  fileName: string;
  // Format du contenu
  format: 'mdx' | 'md';
  // Métadonnées additionnelles utiles à l’application
  meta?: {
    canonicalUrl?: string;
    slug?: string;
  };
}

/**
 * Port: génère le frontmatter et le contenu sérialisé pour une cible donnée.
 * Implémentations attendues en infrastructure (Astro, Hugo, ...).
 */
export interface FrontmatterGeneratorPort {
  readonly target: FrontmatterTarget;
  generate(article: ArticleStructure, project: ProjectConfig): Promise<GeneratedFrontmatter>;
}
