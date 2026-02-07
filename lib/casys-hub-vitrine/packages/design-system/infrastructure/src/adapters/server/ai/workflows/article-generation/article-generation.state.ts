import type {
  ArticleGenerationOutline,
  KeywordTag,
  OutlineWriterCommand,
  SectionNode,
  TextFragment,
  ArticleComment,
} from '@casys/core';
import { z } from 'zod';

export type ContentFormat = 'mdx' | 'markdown' | 'poml' | 'json';

export const mdxSectionOutputSchema = z.object({
  content: z.string().min(1),
  usedTopics: z
    .array(
      z.object({
        id: z.string().optional(),
        reason: z.string().optional(),
      })
    )
    .optional(),
  usedArticles: z
    .array(
      z.object({
        articleId: z.string().optional(),
        reason: z.string().optional(),
      })
    )
    .optional(),
  metadata: z
    .object({
      estimatedReadTime: z.number().optional(),
      keyTopics: z.array(z.string()).optional(),
    })
    .optional(),
});

export interface ArticleGenerationState {
  // Input
  tenantId: string;
  projectId: string;
  language: string;
  brief?: unknown;
  // Optional command to generate outline when not provided
  outlineCommand?: OutlineWriterCommand;

  // Params
  templatePath: string;
  contentFormat: ContentFormat;

  // Outline
  outline?: ArticleGenerationOutline;
  outlineSummary?: string;
  outlineKeywordTags?: KeywordTag[];

  // Per-section iteration state
  cursorIndex: number;
  pendingSectionIds?: string[];

  // Sections
  sections: SectionNode[];
  /** Buffer des relations détectées par section (remplies par write-section-node, consommées en persistance) */
  relationsBySection?: Record<
    string,
    {
      usedTopics?: { id?: string; reason?: string }[];
      usedArticles?: { articleId?: string; reason?: string }[];
    }
  >;

  // Validation with TextFragments + Comments
  textFragments?: TextFragment[];
  comments?: ArticleComment[];
  recentlyModifiedIds?: string[]; // Section IDs modified in last attempt (for smart validation)

  /**
   * Ratio de changement par section (0..1), calculé après patch/rewrite
   *  - 0 = identique, 1 = complètement différent
   */
  changedMap?: Record<string, number>;

  // Control / Metrics
  attempts: number;
  maxAttempts: number;
  totalWords: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}
