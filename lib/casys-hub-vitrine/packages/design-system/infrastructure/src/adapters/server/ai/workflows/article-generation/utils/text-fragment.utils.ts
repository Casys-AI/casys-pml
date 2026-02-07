/**
 * Text Fragment Utilities (Fuzzy Context Matching Version)
 *
 * Helper functions to apply TextFragment patches to section content
 * using robust fuzzy context matching with Levenshtein distance.
 *
 * Strategy: Use contextBefore/target/contextAfter with fuzzy tolerance
 * for reliable text location even with minor variations.
 */

import type { TextFragment } from '@casys/core';
import {
  findTargetWithFuzzyContext,
  applyFuzzyReplacement,
  type FuzzyMatchOptions,
  type FuzzyMatchResult,
} from './fuzzy-matching.utils';

export interface ApplyTextFragmentOptions extends FuzzyMatchOptions {
  /**
   * Log detailed patch application for debugging
   * Default: false
   */
  verbose?: boolean;
}

export interface ApplyTextFragmentResult {
  /**
   * Modified content after applying patch
   */
  content: string;

  /**
   * Whether the patch was successfully applied
   */
  applied: boolean;

  /**
   * Match result from fuzzy matching
   */
  match?: FuzzyMatchResult;

  /**
   * Reason for failure if not applied
   */
  reason?: string;
}

/**
 * Apply a TextFragment patch to section content using fuzzy context matching
 *
 * Expected TextFragment structure:
 * ```typescript
 * {
 *   id: string;
 *   sectionId: string;
 *   content: string;           // The replacement text
 *   position: number;          // Logical position (for ordering)
 *   metadata?: {
 *     contextBefore?: string[];  // 1-2 lines before target
 *     target?: string;           // Exact line to replace
 *     contextAfter?: string[];   // 1-2 lines after target
 *   }
 * }
 * ```
 *
 * If metadata with context is missing, will attempt fallback strategies.
 *
 * @param content - Original section content (markdown)
 * @param fragment - TextFragment to apply
 * @param options - Application options
 * @returns Result with modified content and application status
 */
export function applyTextFragment(
  content: string,
  fragment: TextFragment,
  options: ApplyTextFragmentOptions = {}
): ApplyTextFragmentResult {
  const { verbose = false, ...fuzzyOptions } = options;

  // Extract context from metadata
  const metadata = (fragment as any).metadata;
  const contextBefore: string[] = metadata?.contextBefore ?? [];
  const target: string | undefined = metadata?.target;
  const contextAfter: string[] = metadata?.contextAfter ?? [];

  if (verbose) {
    console.log('[applyTextFragment] Applying patch', {
      fragmentId: fragment.id,
      sectionId: fragment.sectionId,
      hasTarget: !!target,
      contextBeforeLines: contextBefore.length,
      contextAfterLines: contextAfter.length,
      replacementLength: fragment.content.length,
      replacementPreview: fragment.content.substring(0, 80),
    });
  }

  // Strategy: Fuzzy context matching
  if (target) {
    const result = applyFuzzyReplacement(
      content,
      target,
      fragment.content,
      contextBefore,
      contextAfter,
      { ...fuzzyOptions, verbose } // Pass verbose to fuzzy matching
    );

    if (result.applied) {
      if (verbose) {
        console.log('[applyTextFragment] Fuzzy match successful', {
          fragmentId: fragment.id,
          lineIndex: result.match?.lineIndex,
          targetScore: ((result.match?.targetScore ?? 0) * 100).toFixed(1) + '%',
          beforeScore: ((result.match?.contextBeforeScore ?? 0) * 100).toFixed(1) + '%',
          afterScore: ((result.match?.contextAfterScore ?? 0) * 100).toFixed(1) + '%',
          combinedScore: ((result.match?.combinedScore ?? 0) * 100).toFixed(1) + '%',
        });
      }

      return {
        content: result.content,
        applied: true,
        match: result.match,
      };
    } else {
      if (verbose) {
        console.warn('[applyTextFragment] Fuzzy match failed', {
          fragmentId: fragment.id,
          reason: result.match?.reason ?? 'Unknown reason',
          targetScore: result.match?.targetScore,
          contextBeforeScore: result.match?.contextBeforeScore,
          contextAfterScore: result.match?.contextAfterScore,
        });
      }

      return {
        content,
        applied: false,
        match: result.match,
        reason: result.match?.reason ?? 'Fuzzy match failed',
      };
    }
  }

  // Fallback: No context provided - cannot apply safely
  if (verbose) {
    console.warn('[applyTextFragment] No target/context in metadata', {
      fragmentId: fragment.id,
      metadata,
    });
  }

  return {
    content,
    applied: false,
    reason: 'Missing target and context in fragment metadata',
  };
}

/**
 * Batch apply multiple TextFragments to content
 *
 * Applies fragments in order of position (ascending).
 * Stops on first failure and returns partial result.
 *
 * @param content - Original content
 * @param fragments - Array of TextFragments to apply
 * @param options - Application options
 * @returns Result with final content and application summary
 */
export function applyTextFragments(
  content: string,
  fragments: TextFragment[],
  options: ApplyTextFragmentOptions = {}
): {
  content: string;
  applied: number;
  failed: number;
  results: ApplyTextFragmentResult[];
} {
  const { verbose = false } = options;

  // Sort by position to maintain logical order
  const sorted = [...fragments].sort((a, b) => a.position - b.position);

  let currentContent = content;
  let applied = 0;
  let failed = 0;
  const results: ApplyTextFragmentResult[] = [];

  if (verbose) {
    console.log('[applyTextFragments] Applying batch', {
      totalFragments: sorted.length,
      verbose: true,
    });
  }

  for (let i = 0; i < sorted.length; i++) {
    const fragment = sorted[i];
    if (verbose) {
      console.log(`[applyTextFragments] Processing fragment ${i + 1}/${sorted.length}`, {
        fragmentId: fragment.id,
      });
    }

    const result = applyTextFragment(currentContent, fragment, options);
    results.push(result);

    if (result.applied) {
      currentContent = result.content;
      applied++;
      if (verbose) {
        console.log(`[applyTextFragments] Fragment ${i + 1} applied successfully`);
      }
    } else {
      failed++;
      if (verbose) {
        console.warn(`[applyTextFragments] Fragment ${i + 1} failed`, {
          fragmentId: fragment.id,
          reason: result.reason,
        });
      }
      // Continue with next fragment even if this one failed
    }
  }

  if (verbose) {
    console.log('[applyTextFragments] Batch complete', {
      applied,
      failed,
      totalFragments: sorted.length,
      successRate: ((applied / sorted.length) * 100).toFixed(1) + '%',
    });
  }

  return {
    content: currentContent,
    applied,
    failed,
    results,
  };
}

/**
 * Split markdown content into lines (simple helper)
 *
 * @param content - Markdown content
 * @returns Array of lines
 */
export function splitLines(content: string): string[] {
  return content.split('\n');
}

/**
 * Join lines back into content (simple helper)
 *
 * @param lines - Array of lines
 * @returns Joined content
 */
export function joinLines(lines: string[]): string {
  return lines.join('\n');
}

/**
 * Extract context lines around a target line
 *
 * Useful for generating context when creating TextFragments.
 *
 * @param content - Full content
 * @param lineIndex - Index of target line (0-based)
 * @param contextSize - Number of lines before/after (default: 1)
 * @returns Context object with before/target/after lines
 */
export function extractContext(
  content: string,
  lineIndex: number,
  contextSize: number = 1
): {
  contextBefore: string[];
  target: string;
  contextAfter: string[];
} | null {
  const lines = splitLines(content);

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return null; // Invalid line index
  }

  const startBefore = Math.max(0, lineIndex - contextSize);
  const endAfter = Math.min(lines.length, lineIndex + contextSize + 1);

  return {
    contextBefore: lines.slice(startBefore, lineIndex),
    target: lines[lineIndex],
    contextAfter: lines.slice(lineIndex + 1, endAfter),
  };
}

/**
 * Create a TextFragment with fuzzy context from content
 *
 * Helper to generate properly structured TextFragments for patches.
 *
 * @param sectionId - Section ID
 * @param content - Original section content
 * @param lineIndex - Index of line to replace
 * @param replacement - Replacement text
 * @param contextSize - Lines of context to include (default: 1)
 * @returns TextFragment ready for application
 */
export function createTextFragmentWithContext(
  sectionId: string,
  content: string,
  lineIndex: number,
  replacement: string,
  contextSize: number = 1
): TextFragment | null {
  const context = extractContext(content, lineIndex, contextSize);

  if (!context) {
    return null; // Invalid line index
  }

  return {
    id: crypto.randomUUID(),
    sectionId,
    content: replacement,
    position: lineIndex,
    metadata: {
      contextBefore: context.contextBefore,
      target: context.target,
      contextAfter: context.contextAfter,
    },
  } as TextFragment;
}

/**
 * Validate that a TextFragment has the required fuzzy context metadata
 *
 * @param fragment - TextFragment to validate
 * @returns True if fragment has valid context metadata
 */
export function hasValidContext(fragment: TextFragment): boolean {
  const metadata = (fragment as any).metadata;

  if (!metadata) {
    return false;
  }

  // At minimum, must have target line
  if (!metadata.target || typeof metadata.target !== 'string') {
    return false;
  }

  // Context arrays should be arrays (can be empty)
  if (metadata.contextBefore && !Array.isArray(metadata.contextBefore)) {
    return false;
  }

  if (metadata.contextAfter && !Array.isArray(metadata.contextAfter)) {
    return false;
  }

  return true;
}
