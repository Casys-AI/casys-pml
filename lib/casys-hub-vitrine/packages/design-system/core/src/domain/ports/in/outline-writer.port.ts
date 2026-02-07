import type { SectionNode } from '../../entities/article-structure.entity';
import type { OutlineWriterCommand } from '../../types/outline-writer.types';
import type { KeywordTag } from '../../types/seo.types';

/**
 * Port IN (Hexagonal) pour la génération d'outline éditorial
 * Stable pour les adaptateurs entrants (API/CLI/jobs)
 */
export interface OutlineWriterResult {
  title: string;
  summary: string;
  slug: string; // Slug SEO-optimisé généré par l'IA
  sections: SectionNode[];
  keywordTags?: KeywordTag[];
}

export interface OutlineWriterPort {
  execute(
    command: OutlineWriterCommand & { tenantId: string; projectId: string }
  ): Promise<OutlineWriterResult>;
}
