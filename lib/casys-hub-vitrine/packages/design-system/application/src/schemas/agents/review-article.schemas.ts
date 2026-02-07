/**
 * Schema validation for Review Article with TextFragment + ArticleComment
 * (Fuzzy Context Matching Version)
 *
 * Validates AI output for review cycles using domain objects with fuzzy context:
 * - TextFragment: Precise text patches with contextBefore/target/contextAfter
 * - ArticleComment: Rationale for each modification (why)
 */

import { z } from 'zod';

/**
 * Fuzzy context metadata schema for TextFragment
 * Used to locate and replace text with tolerance for minor variations
 */
export const fuzzyContextMetadataSchema = z.object({
  /**
   * 1-2 lines of context before the target line
   * Used to disambiguate location in content
   */
  contextBefore: z.array(z.string()).default([]),

  /**
   * The exact line to find and replace
   * Will be matched with fuzzy tolerance (85% similarity)
   */
  target: z.string().min(1, 'target line required'),

  /**
   * 1-2 lines of context after the target line
   * Used to disambiguate location in content
   */
  contextAfter: z.array(z.string()).default([]),
});

/**
 * TextFragment schema - matches core domain entity with fuzzy context metadata
 * packages/core/src/domain/entities/article-structure.entity.ts
 */
export const textFragmentSchema = z.object({
  id: z.string().uuid('TextFragment ID must be UUID'),
  sectionId: z.string().min(1, 'sectionId required'),
  content: z.string().min(1, 'content required (new text to apply)'),
  position: z.number().int().nonnegative('position must be non-negative integer'),

  /**
   * Fuzzy context metadata for robust text location
   * Required for patch application
   */
  metadata: fuzzyContextMetadataSchema,
});

/**
 * ArticleComment schema - matches core domain entity
 * packages/core/src/domain/entities/article-structure.entity.ts
 */
export const articleCommentSchema = z.object({
  id: z.string().uuid('ArticleComment ID must be UUID'),
  articleId: z.string().optional(), // Will be set by workflow, not AI
  textFragmentId: z.string().uuid('textFragmentId must link to a TextFragment'),
  content: z.string().min(10, 'comment content must explain WHY (min 10 chars)'),
  position: z.number().int().nonnegative(),

  authorId: z.string().optional().default('AI-reviewer'),
  createdAt: z.string().datetime().optional(),
  replies: z.array(z.any()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Review output schema with TextFragments + Comments
 * AI must generate TextFragments with fuzzy context metadata
 */
export const reviewOutputSchema = z.object({
  textFragments: z.array(textFragmentSchema).default([]),
  comments: z.array(articleCommentSchema).default([]),
});

// Type exports for TypeScript
export type FuzzyContextMetadata = z.infer<typeof fuzzyContextMetadataSchema>;
export type TextFragmentOutput = z.infer<typeof textFragmentSchema>;
export type ArticleCommentOutput = z.infer<typeof articleCommentSchema>;
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

/**
 * Validation helper: ensure all comments reference existing fragments
 */
export function validateFragmentCommentLinks(
  fragments: TextFragmentOutput[],
  comments: ArticleCommentOutput[]
): { valid: boolean; errors: string[] } {
  const fragmentIds = new Set(fragments.map(f => f.id));
  const errors: string[] = [];

  for (const comment of comments) {
    if (!fragmentIds.has(comment.textFragmentId)) {
      errors.push(
        `Comment ${comment.id} references non-existent fragment ${comment.textFragmentId}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validation helper: ensure fragments reference valid sections
 */
export function validateFragmentSectionRefs(
  fragments: TextFragmentOutput[],
  validSectionIds: string[]
): { valid: boolean; errors: string[] } {
  const sectionIdSet = new Set(validSectionIds);
  const errors: string[] = [];

  for (const fragment of fragments) {
    if (!sectionIdSet.has(fragment.sectionId)) {
      errors.push(
        `Fragment ${fragment.id} references non-existent section ${fragment.sectionId}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validation helper: ensure fuzzy context is valid
 */
export function validateFuzzyContext(fragment: TextFragmentOutput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Target is required
  if (!fragment.metadata.target || fragment.metadata.target.trim().length === 0) {
    errors.push(`Fragment ${fragment.id}: target line is required`);
  }

  // Context arrays must be arrays
  if (!Array.isArray(fragment.metadata.contextBefore)) {
    errors.push(`Fragment ${fragment.id}: contextBefore must be an array`);
  }

  if (!Array.isArray(fragment.metadata.contextAfter)) {
    errors.push(`Fragment ${fragment.id}: contextAfter must be an array`);
  }

  // Warn if no context at all (makes matching harder)
  if (
    fragment.metadata.contextBefore.length === 0 &&
    fragment.metadata.contextAfter.length === 0
  ) {
    errors.push(
      `Fragment ${fragment.id}: WARNING - no context provided, matching may be ambiguous`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}