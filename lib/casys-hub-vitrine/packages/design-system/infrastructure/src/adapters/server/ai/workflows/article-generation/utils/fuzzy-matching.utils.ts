/**
 * Fuzzy String Matching Utilities
 *
 * Provides Levenshtein distance-based similarity scoring for robust
 * text fragment location with tolerance for minor variations.
 *
 * Use case: Locate text to replace even if surrounding context has minor edits
 */

export interface FuzzyMatchOptions {
  /**
   * Minimum similarity score for target line (0-1)
   * Default: 0.85 (85% similarity required)
   */
  targetThreshold?: number;

  /**
   * Minimum similarity score for context lines (0-1)
   * Default: 0.70 (70% similarity required)
   */
  contextThreshold?: number;

  /**
   * Minimum combined score (target + context average)
   * Default: 0.80
   */
  combinedThreshold?: number;

  /**
   * Case-sensitive matching
   * Default: false
   */
  caseSensitive?: boolean;

  /**
   * Normalize whitespace before comparison
   * Default: true
   */
  normalizeWhitespace?: boolean;

  /**
   * Enable verbose logging for debugging
   * Default: false
   */
  verbose?: boolean;
}

export interface FuzzyMatchResult {
  /** Match found */
  found: boolean;

  /** Line index where target was found (0-based) */
  lineIndex?: number;

  /** Similarity score for target line (0-1) */
  targetScore?: number;

  /** Similarity score for context before (0-1) */
  contextBeforeScore?: number;

  /** Similarity score for context after (0-1) */
  contextAfterScore?: number;

  /** Combined similarity score */
  combinedScore?: number;

  /** Reason for match failure */
  reason?: string;

  /** Fragment ID for logging */
  fragmentId?: string;
}

/**
 * Calculate Levenshtein edit distance between two strings
 *
 * Uses Wagner-Fischer dynamic programming algorithm
 * Time complexity: O(m * n)
 * Space complexity: O(min(m, n)) - optimized
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Edit distance (number of operations to transform str1 into str2)
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Early exit optimizations
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;
  if (str1 === str2) return 0;

  // Use rolling array optimization (space O(min(m,n)))
  let prev = Array.from({ length: len2 + 1 }, (_, i) => i);
  let curr = new Array(len2 + 1);

  for (let i = 1; i <= len1; i++) {
    curr[0] = i;

    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;

      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }

    // Swap arrays
    [prev, curr] = [curr, prev];
  }

  return prev[len2];
}

/**
 * Calculate similarity score (0-1) between two strings
 *
 * Formula: 1 - (distance / maxLength)
 * - 1.0 = identical strings
 * - 0.0 = completely different
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @param options - Matching options
 * @returns Similarity score between 0 and 1
 */
export function calculateSimilarity(
  str1: string,
  str2: string,
  options: Pick<FuzzyMatchOptions, 'caseSensitive' | 'normalizeWhitespace' | 'verbose'> = {}
): number {
  const { caseSensitive = false, normalizeWhitespace = true, verbose = false } = options;

  // Normalize inputs
  let s1 = str1;
  let s2 = str2;

  if (!caseSensitive) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
  }

  if (normalizeWhitespace) {
    s1 = s1.replace(/\s+/g, ' ').trim();
    s2 = s2.replace(/\s+/g, ' ').trim();
  }

  // Calculate distance and normalize
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0; // Both empty = perfect match

  const distance = levenshteinDistance(s1, s2);
  const score = 1 - distance / maxLen;

  if (verbose && score < 0.85) {
    console.log('[fuzzyMatching] calculateSimilarity', {
      expected: str1.substring(0, 60),
      actual: str2.substring(0, 60),
      score: (score * 100).toFixed(1) + '%',
      distance,
      maxLen,
    });
  }

  return score;
}

/**
 * Calculate similarity score for multi-line context
 *
 * Compares each line individually and returns average similarity
 *
 * @param actualLines - Lines found in content
 * @param expectedContext - Expected context lines
 * @param options - Matching options
 * @returns Average similarity score (0-1)
 */
export function calculateContextScore(
  actualLines: string[],
  expectedContext: string[],
  options: Pick<FuzzyMatchOptions, 'caseSensitive' | 'normalizeWhitespace' | 'verbose'> = {}
): number {
  if (expectedContext.length === 0) return 1.0; // No context required = perfect match
  if (actualLines.length === 0) return 0.0; // Missing context = no match

  const { verbose = false } = options;

  // Compare line by line
  const scores: number[] = [];

  for (let i = 0; i < expectedContext.length; i++) {
    const expected = expectedContext[i];
    const actual = actualLines[i] ?? ''; // Missing line = empty string

    const score = calculateSimilarity(expected, actual, options);
    scores.push(score);

    if (verbose && score < 0.7) {
      console.log(`[fuzzyMatching] context line ${i}`, {
        expected: expected.substring(0, 60),
        actual: actual.substring(0, 60),
        score: (score * 100).toFixed(1) + '%',
      });
    }
  }

  // Return average score
  const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  if (verbose && avgScore < 0.7) {
    console.log('[fuzzyMatching] context avg score', {
      avgScore: (avgScore * 100).toFixed(1) + '%',
      lineCount: expectedContext.length,
      scores: scores.map(s => (s * 100).toFixed(1) + '%'),
    });
  }

  return avgScore;
}

/**
 * Find target line in content using fuzzy context matching
 *
 * Algorithm:
 * 1. Split content into lines
 * 2. For each potential target line:
 *    a. Calculate target similarity
 *    b. Calculate context before similarity
 *    c. Calculate context after similarity
 *    d. Check all thresholds
 * 3. Return best match above thresholds
 *
 * @param content - Full section content (markdown)
 * @param target - Target line to find
 * @param contextBefore - Expected lines before target
 * @param contextAfter - Expected lines after target
 * @param options - Matching options
 * @returns Match result with location and scores
 */
export function findTargetWithFuzzyContext(
  content: string,
  target: string,
  contextBefore: string[],
  contextAfter: string[],
  options: FuzzyMatchOptions = {}
): FuzzyMatchResult {
  const {
    targetThreshold = 0.85,
    contextThreshold = 0.7,
    combinedThreshold = 0.8,
    caseSensitive = false,
    normalizeWhitespace = true,
    verbose = false,
  } = options;

  const lines = content.split('\n');

  if (verbose) {
    console.log('[fuzzyMatching] Starting search', {
      targetLength: target.length,
      targetPreview: target.substring(0, 60),
      contentLines: lines.length,
      contextBeforeLinesCount: contextBefore.length,
      contextAfterLinesCount: contextAfter.length,
      targetThreshold: (targetThreshold * 100).toFixed(0) + '%',
      contextThreshold: (contextThreshold * 100).toFixed(0) + '%',
      combinedThreshold: (combinedThreshold * 100).toFixed(0) + '%',
    });
  }

  // Need at least enough lines for context + target
  const requiredLines = contextBefore.length + 1 + contextAfter.length;
  if (lines.length < requiredLines) {
    const reason = `Content has ${lines.length} lines, need at least ${requiredLines}`;
    if (verbose) {
      console.warn('[fuzzyMatching] Not enough lines:', reason);
    }
    return {
      found: false,
      reason,
    };
  }

  let bestMatch: FuzzyMatchResult = { found: false, reason: 'No match found above thresholds' };
  let bestCombinedScore = 0;

  // Scan through content looking for best match
  const startIndex = contextBefore.length;
  const endIndex = lines.length - contextAfter.length;

  let attemptCount = 0;
  let skipped = { targetThreshold: 0, contextThreshold: 0, combinedThreshold: 0 };

  for (let i = startIndex; i < endIndex; i++) {
    attemptCount++;
    const targetLine = lines[i];

    // 1. Check target similarity
    const targetScore = calculateSimilarity(target, targetLine, {
      caseSensitive,
      normalizeWhitespace,
      verbose,
    });

    if (targetScore < targetThreshold) {
      skipped.targetThreshold++;
      if (verbose) {
        console.log(`[fuzzyMatching] Line ${i}: target score too low`, {
          score: (targetScore * 100).toFixed(1) + '%',
          threshold: (targetThreshold * 100).toFixed(0) + '%',
          line: targetLine.substring(0, 60),
        });
      }
      continue; // Target doesn't match well enough
    }

    // 2. Check context before
    const beforeLines = lines.slice(i - contextBefore.length, i);
    const beforeScore = calculateContextScore(beforeLines, contextBefore, {
      caseSensitive,
      normalizeWhitespace,
      verbose,
    });

    if (beforeScore < contextThreshold) {
      skipped.contextThreshold++;
      if (verbose) {
        console.log(`[fuzzyMatching] Line ${i}: context before score too low`, {
          score: (beforeScore * 100).toFixed(1) + '%',
          threshold: (contextThreshold * 100).toFixed(0) + '%',
        });
      }
      continue; // Context before doesn't match
    }

    // 3. Check context after
    const afterLines = lines.slice(i + 1, i + 1 + contextAfter.length);
    const afterScore = calculateContextScore(afterLines, contextAfter, {
      caseSensitive,
      normalizeWhitespace,
      verbose,
    });

    if (afterScore < contextThreshold) {
      skipped.contextThreshold++;
      if (verbose) {
        console.log(`[fuzzyMatching] Line ${i}: context after score too low`, {
          score: (afterScore * 100).toFixed(1) + '%',
          threshold: (contextThreshold * 100).toFixed(0) + '%',
        });
      }
      continue; // Context after doesn't match
    }

    // 4. Calculate combined score (weighted average)
    const contextCount = contextBefore.length + contextAfter.length;
    const contextWeight = contextCount > 0 ? 0.3 : 0; // 30% for context if present
    const targetWeight = 1 - contextWeight; // 70% for target (or 100% if no context)

    const avgContextScore =
      contextCount > 0
        ? (beforeScore * contextBefore.length + afterScore * contextAfter.length) / contextCount
        : 1.0;

    const combinedScore = targetScore * targetWeight + avgContextScore * contextWeight;

    if (combinedScore < combinedThreshold) {
      skipped.combinedThreshold++;
      if (verbose) {
        console.log(`[fuzzyMatching] Line ${i}: combined score too low`, {
          targetScore: (targetScore * 100).toFixed(1) + '%',
          contextAvg: (avgContextScore * 100).toFixed(1) + '%',
          combined: (combinedScore * 100).toFixed(1) + '%',
          threshold: (combinedThreshold * 100).toFixed(0) + '%',
        });
      }
      continue; // Combined score too low
    }

    // This is a valid match - check if it's better than previous best
    if (combinedScore > bestCombinedScore) {
      bestMatch = {
        found: true,
        lineIndex: i,
        targetScore,
        contextBeforeScore: beforeScore,
        contextAfterScore: afterScore,
        combinedScore,
      };
      bestCombinedScore = combinedScore;

      if (verbose) {
        console.log(`[fuzzyMatching] Found match at line ${i}`, {
          targetScore: (targetScore * 100).toFixed(1) + '%',
          beforeScore: (beforeScore * 100).toFixed(1) + '%',
          afterScore: (afterScore * 100).toFixed(1) + '%',
          combined: (combinedScore * 100).toFixed(1) + '%',
        });
      }
    }
  }

  if (verbose) {
    console.log('[fuzzyMatching] Search complete', {
      foundMatch: bestMatch.found,
      attemptCount,
      skippedByTargetThreshold: skipped.targetThreshold,
      skippedByContextThreshold: skipped.contextThreshold,
      skippedByCompositeThreshold: skipped.combinedThreshold,
      bestScore: bestMatch.combinedScore ? (bestMatch.combinedScore * 100).toFixed(1) + '%' : 'N/A',
      reason: bestMatch.reason,
    });
  }

  return bestMatch;
}

/**
 * Apply fuzzy-matched replacement to content
 *
 * NEW BEHAVIOR: Intra-phrase fuzzy matching
 * - contextBefore/After are TEXT CONTEXT (not line-based)
 * - Searches for: contextBefore + target + contextAfter sequence in content
 * - Replaces ONLY the target part, keeping context intact
 *
 * @param content - Original content
 * @param target - Text to replace (the middle part)
 * @param replacement - Replacement text
 * @param contextBefore - Text/lines before target (fuzzy context)
 * @param contextAfter - Text/lines after target (fuzzy context)
 * @param options - Matching options
 * @returns Modified content or original if no match
 */
export function applyFuzzyReplacement(
  content: string,
  target: string,
  replacement: string,
  contextBefore: string[],
  contextAfter: string[],
  options: FuzzyMatchOptions = {}
): { content: string; applied: boolean; match?: FuzzyMatchResult } {
  const { verbose = false, targetThreshold = 0.85, caseSensitive = false, normalizeWhitespace = true } = options;

  // Convert context arrays to strings
  const beforeText = contextBefore.join('\n').trim();
  const afterText = contextAfter.join('\n').trim();

  if (verbose) {
    console.log('[applyFuzzyReplacement] Starting intra-phrase search', {
      contentLength: content.length,
      targetLength: target.length,
      beforeLength: beforeText.length,
      afterLength: afterText.length,
    });
  }

  // Build search pattern: before + target + after (with flexible spacing)
  let searchContent = content;
  let searchBefore = beforeText;
  let searchTarget = target;
  let searchAfter = afterText;

  if (!caseSensitive) {
    searchContent = searchContent.toLowerCase();
    searchBefore = searchBefore.toLowerCase();
    searchTarget = searchTarget.toLowerCase();
    searchAfter = searchAfter.toLowerCase();
  }

  if (normalizeWhitespace) {
    searchContent = searchContent.replace(/\s+/g, ' ');
    searchBefore = searchBefore.replace(/\s+/g, ' ').trim();
    searchTarget = searchTarget.replace(/\s+/g, ' ').trim();
    searchAfter = searchAfter.replace(/\s+/g, ' ').trim();
  }

  // Search for target with context using fuzzy matching
  let bestScore = 0;
  let bestTargetStart = -1;

  // Step 1: Find all candidate positions where target could match (fuzzy)
  const targetCandidates: { position: number; score: number }[] = [];
  const maxStart = Math.max(0, searchContent.length - searchTarget.length);

  // Use fuzzy indexOf to find potential target positions
  for (let i = 0; i <= maxStart; i++) {
    const potentialTarget = searchContent.substring(i, i + searchTarget.length);
    const targetScore =
      1 -
      levenshteinDistance(potentialTarget, searchTarget) /
        Math.max(potentialTarget.length, searchTarget.length);

    if (targetScore >= targetThreshold) {
      targetCandidates.push({ position: i, score: targetScore });
    }
  }

  if (verbose) {
    console.log('[applyFuzzyReplacement] Found target candidates', {
      count: targetCandidates.length,
      threshold: (targetThreshold * 100).toFixed(0) + '%',
    });
  }

  // Step 2: For each target candidate, validate context before + after
  for (const candidate of targetCandidates) {
    const i = candidate.position;
    const targetScore = candidate.score;

    // Check context before using fuzzy indexOf backwards
    let beforeScore = 0;
    let contextBeforeMatch = false;

    if (searchBefore.length === 0) {
      contextBeforeMatch = true;
      beforeScore = 1.0;
    } else {
      // Search for "before" pattern in text up to position i
      // Use generous margin (2x context length + 200) to find context far back
      const beforeRegion = searchContent.substring(Math.max(0, i - searchBefore.length - 200), i);

      for (let j = 0; j <= beforeRegion.length - searchBefore.length; j++) {
        const potentialBefore = beforeRegion.substring(j, j + searchBefore.length);
        const score =
          1 -
          levenshteinDistance(potentialBefore, searchBefore) /
            Math.max(potentialBefore.length, searchBefore.length);
        if (score >= 0.7) {
          contextBeforeMatch = true;
          beforeScore = Math.max(beforeScore, score);
        }
      }
    }

    if (!contextBeforeMatch) {
      continue;
    }

    // Check context after using fuzzy indexOf forwards
    let afterScore = 0;
    let contextAfterMatch = false;

    if (searchAfter.length === 0) {
      contextAfterMatch = true;
      afterScore = 1.0;
    } else {
      // Search for "after" pattern in text from position (i + target.length)
      // Use generous margin (2x context length) to find context far ahead
      const afterStart = i + searchTarget.length;
      const afterRegion = searchContent.substring(afterStart, Math.min(searchContent.length, afterStart + searchAfter.length + 200));

      for (let j = 0; j <= afterRegion.length - searchAfter.length; j++) {
        const potentialAfter = afterRegion.substring(j, j + searchAfter.length);
        const score =
          1 -
          levenshteinDistance(potentialAfter, searchAfter) /
            Math.max(potentialAfter.length, searchAfter.length);
        if (score >= 0.7) {
          contextAfterMatch = true;
          afterScore = Math.max(afterScore, score);
        }
      }
    }

    if (!contextAfterMatch) {
      continue;
    }

    // Calculate combined score
    const combinedScore = targetScore * 0.7 + (beforeScore + afterScore) / 2 * 0.3;

    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestTargetStart = i;

      if (verbose) {
        console.log('[applyFuzzyReplacement] Found match', {
          position: i,
          targetScore: (targetScore * 100).toFixed(1) + '%',
          beforeScore: (beforeScore * 100).toFixed(1) + '%',
          afterScore: (afterScore * 100).toFixed(1) + '%',
          combinedScore: (combinedScore * 100).toFixed(1) + '%',
        });
      }
    }
  }

  if (bestTargetStart === -1) {
    if (verbose) {
      console.warn('[applyFuzzyReplacement] No match found above threshold', {
        threshold: targetThreshold,
        bestScoreFound: (bestScore * 100).toFixed(1) + '%',
      });
    }
    return { content, applied: false, match: { found: false, reason: 'No fuzzy match found' } };
  }

  // Replace ONLY the target part at the best position (in original content)
  const result =
    content.substring(0, bestTargetStart) +
    replacement +
    content.substring(bestTargetStart + target.length);

  if (verbose) {
    console.log('[applyFuzzyReplacement] Replacement applied', {
      position: bestTargetStart,
      score: (bestScore * 100).toFixed(1) + '%',
      oldLength: target.length,
      newLength: replacement.length,
    });
  }

  return {
    content: result,
    applied: true,
    match: { found: true, targetScore: bestScore },
  };
}
