/**
 * Tests for Fuzzy Matching Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  calculateSimilarity,
  calculateContextScore,
  findTargetWithFuzzyContext,
  applyFuzzyReplacement,
} from '../fuzzy-matching.utils';

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('should return string length for empty string comparison', () => {
    expect(levenshteinDistance('', 'hello')).toBe(5);
    expect(levenshteinDistance('hello', '')).toBe(5);
  });

  it('should calculate single character insertion', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('should calculate single character deletion', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('should calculate single character substitution', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });

  it('should calculate multiple operations', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    // k→s, e→i, append g
  });

  it('should handle completely different strings', () => {
    const dist = levenshteinDistance('abc', 'xyz');
    expect(dist).toBe(3); // All substitutions
  });
});

describe('calculateSimilarity', () => {
  it('should return 1.0 for identical strings', () => {
    expect(calculateSimilarity('hello', 'hello')).toBe(1.0);
  });

  it('should return 0.0 for completely different strings of same length', () => {
    const similarity = calculateSimilarity('abc', 'xyz');
    expect(similarity).toBe(0.0); // 3 changes / 3 length
  });

  it('should return high similarity for minor typos', () => {
    const similarity = calculateSimilarity('hello world', 'helo world');
    expect(similarity).toBeGreaterThan(0.9); // 1 char difference
  });

  it('should be case-insensitive by default', () => {
    expect(calculateSimilarity('Hello', 'hello')).toBe(1.0);
  });

  it('should respect case-sensitive option', () => {
    const similarity = calculateSimilarity('Hello', 'hello', { caseSensitive: true });
    expect(similarity).toBeLessThan(1.0);
  });

  it('should normalize whitespace by default', () => {
    expect(calculateSimilarity('hello  world', 'hello world')).toBe(1.0);
  });

  it('should respect normalizeWhitespace option', () => {
    const similarity = calculateSimilarity('hello  world', 'hello world', {
      normalizeWhitespace: false,
    });
    expect(similarity).toBeLessThan(1.0);
  });

  it('should handle empty strings', () => {
    expect(calculateSimilarity('', '')).toBe(1.0);
  });
});

describe('calculateContextScore', () => {
  it('should return 1.0 for empty expected context', () => {
    const score = calculateContextScore(['line1', 'line2'], []);
    expect(score).toBe(1.0);
  });

  it('should return 0.0 for missing actual lines', () => {
    const score = calculateContextScore([], ['expected1', 'expected2']);
    expect(score).toBe(0.0);
  });

  it('should return 1.0 for perfect context match', () => {
    const actual = ['line 1', 'line 2'];
    const expected = ['line 1', 'line 2'];
    const score = calculateContextScore(actual, expected);
    expect(score).toBe(1.0);
  });

  it('should return high score for minor variations', () => {
    const actual = ['The quick brown fox', 'jumps over the lazy dog'];
    const expected = ['The quick brown fox', 'jumps over the laze dog']; // 1 char diff in 2nd line
    const score = calculateContextScore(actual, expected);
    expect(score).toBeGreaterThan(0.95);
  });

  it('should return average of line scores', () => {
    const actual = ['exact match', 'complete different'];
    const expected = ['exact match', 'xyz']; // 1st = 1.0, 2nd = 0.0
    const score = calculateContextScore(actual, expected);
    expect(score).toBeGreaterThan(0.4); // Average should be ~0.5
    expect(score).toBeLessThan(0.6);
  });

  it('should handle partial context (fewer actual lines than expected)', () => {
    const actual = ['line 1']; // Missing line 2
    const expected = ['line 1', 'line 2'];
    const score = calculateContextScore(actual, expected);
    expect(score).toBeLessThan(1.0); // Should penalize missing line
  });
});

describe('findTargetWithFuzzyContext', () => {
  // Simple content without empty lines for easier testing
  const sampleContent = `Line 0
Line 1
Line 2 target
Line 3
Line 4`;

  it('should find exact match with context', () => {
    const result = findTargetWithFuzzyContext(
      sampleContent,
      'Line 2 target',
      ['Line 1'],
      ['Line 3']
    );

    expect(result.found).toBe(true);
    expect(result.lineIndex).toBe(2);
    expect(result.targetScore).toBe(1.0);
    expect(result.contextBeforeScore).toBe(1.0);
    expect(result.contextAfterScore).toBe(1.0);
  });

  it('should find fuzzy match with minor typo in target', () => {
    const result = findTargetWithFuzzyContext(
      sampleContent,
      'Line 2 targat', // typo
      ['Line 1'],
      ['Line 3']
    );

    expect(result.found).toBe(true);
    expect(result.lineIndex).toBe(2);
    expect(result.targetScore).toBeGreaterThan(0.85);
    expect(result.targetScore).toBeLessThan(1.0);
  });

  it('should find match with minor variation in context', () => {
    const result = findTargetWithFuzzyContext(
      sampleContent,
      'Line 2 target',
      ['Line 1'],
      ['Line 3x'] // Minor typo in context
    );

    expect(result.found).toBe(true);
    expect(result.lineIndex).toBe(2);
  });

  it('should not match when target is too different', () => {
    const result = findTargetWithFuzzyContext(
      sampleContent,
      'Completely different text here',
      ['Line 1'],
      ['Line 3']
    );

    expect(result.found).toBe(false);
    expect(result.reason).toContain('No match found');
  });

  it('should not match when context is too different', () => {
    const result = findTargetWithFuzzyContext(
      sampleContent,
      'Line 2 target',
      ['Wrong context before'],
      ['Wrong context after']
    );

    expect(result.found).toBe(false);
  });

  it('should work without context before', () => {
    const result = findTargetWithFuzzyContext(
      sampleContent,
      'Line 0',
      [], // no context before (start of content)
      ['Line 1']
    );

    expect(result.found).toBe(true);
    expect(result.lineIndex).toBe(0);
  });

  it('should work without context after', () => {
    const result = findTargetWithFuzzyContext(
      sampleContent,
      'Line 4',
      ['Line 3'],
      [] // no context after (end of content)
    );

    expect(result.found).toBe(true);
    expect(result.lineIndex).toBe(4);
  });

  it('should work without any context', () => {
    const simpleContent = 'Only one line';
    const result = findTargetWithFuzzyContext(simpleContent, 'Only one line', [], []);

    expect(result.found).toBe(true);
    expect(result.lineIndex).toBe(0);
  });

  it('should return best match when multiple candidates exist', () => {
    const duplicateContent = `First occurrence
Some text
Second occurrence
More text
Second occurrence
Even more`;

    // Both "Second occurrence" lines could match, but first has better context
    const result = findTargetWithFuzzyContext(
      duplicateContent,
      'Second occurrence',
      ['Some text'],
      ['More text']
    );

    expect(result.found).toBe(true);
    expect(result.lineIndex).toBe(2); // Should match first "Second occurrence"
  });

  it('should respect custom thresholds', () => {
    const result = findTargetWithFuzzyContext(
      sampleContent,
      'Line 2 targat', // Minor typo
      ['Line 1'],
      ['Line 3'],
      {
        targetThreshold: 0.95, // Very strict
      }
    );

    expect(result.found).toBe(false); // Typo prevents match with strict threshold
  });

  it('should handle insufficient lines in content', () => {
    const shortContent = 'Only line';
    const result = findTargetWithFuzzyContext(
      shortContent,
      'Only line',
      ['Context before'], // Requires context that doesn't exist
      []
    );

    expect(result.found).toBe(false);
    expect(result.reason).toContain('need at least');
  });

  it('should calculate combined score correctly', () => {
    const result = findTargetWithFuzzyContext(
      sampleContent,
      'Line 2 target',
      ['Line 1'],
      ['Line 3']
    );

    expect(result.found).toBe(true);
    expect(result.combinedScore).toBeDefined();
    expect(result.combinedScore).toBeGreaterThan(0.8);
  });
});

describe('applyFuzzyReplacement', () => {
  const sampleContent = `Line 1
Line 2 original
Line 3`;

  it('should replace matched line with new content', () => {
    const { content, applied, match } = applyFuzzyReplacement(
      sampleContent,
      'Line 2 original',
      'Line 2 modified',
      ['Line 1'],
      ['Line 3']
    );

    expect(applied).toBe(true);
    expect(match?.found).toBe(true);
    expect(content).toContain('Line 2 modified');
    expect(content).not.toContain('Line 2 original');
  });

  it('should preserve surrounding content', () => {
    const { content, applied } = applyFuzzyReplacement(
      sampleContent,
      'Line 2 original',
      'Replacement',
      ['Line 1'],
      ['Line 3']
    );

    expect(applied).toBe(true);
    expect(content).toContain('Line 1');
    expect(content).toContain('Line 3');
  });

  it('should return original content when no match found', () => {
    const { content, applied, match } = applyFuzzyReplacement(
      sampleContent,
      'Nonexistent text',
      'Replacement',
      ['Wrong context'],
      ['Also wrong']
    );

    expect(applied).toBe(false);
    expect(match?.found).toBe(false);
    expect(content).toBe(sampleContent); // Unchanged
  });

  it('should handle fuzzy match and apply replacement', () => {
    const { content, applied } = applyFuzzyReplacement(
      sampleContent,
      'Line 2 originel', // Typo in search
      'Corrected line',
      ['Line 1'],
      ['Line 3']
    );

    expect(applied).toBe(true);
    expect(content).toContain('Corrected line');
  });

  it('should work with empty context', () => {
    const simpleContent = 'Single line to replace';
    const { content, applied } = applyFuzzyReplacement(
      simpleContent,
      'Single line to replace',
      'Replaced line',
      [],
      []
    );

    expect(applied).toBe(true);
    expect(content).toBe('Replaced line');
  });
});

describe('edge cases', () => {
  it('should handle content with empty lines', () => {
    const content = `Line 1

Line 3`;

    // When content has empty lines, they must be included in context
    const result = findTargetWithFuzzyContext(content, 'Line 3', [''], []); // Empty line before

    expect(result.found).toBe(true);
  });

  it('should handle markdown code blocks', () => {
    const content = `Code:
\`\`\`typescript
const x = 1;
\`\`\`
After`;

    const result = findTargetWithFuzzyContext(
      content,
      'const x = 1;',
      ['```typescript'],
      ['```']
    );

    expect(result.found).toBe(true);
  });

  it('should handle markdown lists', () => {
    const content = `- Item 1
- Item 2
- Item 3`;

    const result = findTargetWithFuzzyContext(content, '- Item 2', ['- Item 1'], ['- Item 3']);

    expect(result.found).toBe(true);
  });

  it('should handle very long lines', () => {
    const longLine = 'a'.repeat(1000);
    const result = findTargetWithFuzzyContext(longLine, longLine, [], []);

    expect(result.found).toBe(true);
  });

  it('should handle special characters', () => {
    const content = `Normal text
Line with $pecial ch@rs & symbols!
End text`;

    const result = findTargetWithFuzzyContext(
      content,
      'Line with $pecial ch@rs & symbols!',
      ['Normal text'],
      ['End text']
    );

    expect(result.found).toBe(true);
  });

  it('should handle unicode characters', () => {
    const content = `Start
Émojis et caractères: 🎉 français Ñ
End`;

    const result = findTargetWithFuzzyContext(
      content,
      'Émojis et caractères: 🎉 français Ñ',
      ['Start'],
      ['End']
    );

    expect(result.found).toBe(true);
  });
});

describe('intra-phrase fuzzy matching (NEW BEHAVIOR)', () => {
  /**
   * New behavior: Replace partial text within a sentence/phrase
   * using contextBefore/contextAfter as fuzzy location hints.
   * This tests the two-stage matching: find target candidates, then validate context.
   */

  it('should replace partial text within a sentence', () => {
    const content = 'The quick brown fox jumps over the lazy dog';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'brown fox',
      'red wolf',
      ['quick'],
      ['jumps']
    );

    expect(applied).toBe(true);
    expect(result).toBe('The quick red wolf jumps over the lazy dog');
    expect(result).toContain('quick');
    expect(result).toContain('jumps');
    expect(result).not.toContain('brown fox');
  });

  it('should preserve context before and after when replacing intra-phrase text', () => {
    const content = 'This article discusses machine learning algorithms in detail';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'machine learning',
      'artificial intelligence',
      ['discusses'],
      ['algorithms']
    );

    expect(applied).toBe(true);
    expect(result).toContain('discusses');
    expect(result).toContain('algorithms');
    expect(result).toContain('artificial intelligence');
    expect(result).not.toContain('machine learning');
  });

  it('should handle word replacement using context', () => {
    const content = 'The quick brown fox jumps over the lazy dog';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'fox',
      'wolf',
      ['brown'],
      ['jumps']
    );

    expect(applied).toBe(true);
    expect(result).toContain('wolf');
    expect(result).toContain('brown');
    expect(result).toContain('jumps');
    expect(result).not.toContain('fox');
  });

  it('should handle exact context matching for intra-phrase replacement', () => {
    const content = 'The quick brown fox jumps over the lazy dog';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'brown fox',
      'red wolf',
      ['quick'],
      ['jumps']
    );

    expect(applied).toBe(true);
    expect(result).toContain('red wolf');
    expect(result).toContain('quick');
    expect(result).toContain('jumps');
  });

  it('should handle partial text at the beginning of content', () => {
    const content = 'Important announcement: Please read carefully';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'announcement:',
      'notification:',
      [], // Empty context before (at beginning)
      ['Please']
    );

    expect(applied).toBe(true);
    expect(result).toContain('notification:');
    expect(result).toContain('Please');
  });

  it('should handle partial text at the end of content', () => {
    const content = 'Please note that this is important';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'is important',
      'matters',
      ['this'],
      [] // Empty context after (at end)
    );

    expect(applied).toBe(true);
    expect(result).toContain('matters');
    expect(result).toContain('this');
  });

  it('should handle very short partial text replacement', () => {
    const content = 'I like cats and dogs';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'and',
      'or',
      ['cats'],
      ['dogs']
    );

    expect(applied).toBe(true);
    expect(result).toBe('I like cats or dogs');
  });

  it('should not match when context is not found nearby', () => {
    const content = 'The quick brown fox jumps over the lazy dog';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'brown',
      'red',
      ['completely'], // Context that doesn't exist nearby
      ['different']
    );

    expect(applied).toBe(false);
    expect(result).toBe(content); // Unchanged
  });

  it('should handle text with special punctuation in intra-phrase matching', () => {
    const content = 'The quick, brown fox jumps over the lazy dog.';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'brown fox',
      'red wolf',
      ['quick,'],
      ['jumps']
    );

    expect(applied).toBe(true);
    expect(result).toContain('red wolf');
  });

  it('should handle markdown-formatted partial text replacement', () => {
    const content = 'This is **bold text** in a sentence';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'bold text',
      'strong emphasis',
      ['**'],
      ['**']
    );

    expect(applied).toBe(true);
    expect(result).toContain('**strong emphasis**');
  });

  it('should replace text across soft line breaks (spaces)', () => {
    const content = 'One two three\nfour five six';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'three\nfour',
      '3 4',
      ['two'],
      ['five']
    );

    expect(applied).toBe(true);
    expect(result).toContain('3 4');
  });

  it('should return match with target score when successful', () => {
    const content = 'Start content middle content end';
    const { match, applied } = applyFuzzyReplacement(
      content,
      'middle content',
      'replacement',
      ['Start'],
      ['end']
    );

    expect(applied).toBe(true);
    expect(match?.found).toBe(true);
    expect(match?.targetScore).toBeDefined();
    expect(match?.targetScore).toBeGreaterThan(0.8); // Should have reasonable confidence
  });

  it('should handle case-insensitive intra-phrase matching', () => {
    const content = 'The QUICK brown FOX jumps';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'quick brown fox',
      'slow red wolf',
      ['The'],
      ['jumps']
    );

    expect(applied).toBe(true);
    expect(result.toLowerCase()).toContain('slow red wolf');
  });

  it('should replace longest matching substring within bounds', () => {
    const content = 'The algorithm is fast and efficient algorithm';
    const { content: result, applied } = applyFuzzyReplacement(
      content,
      'algorithm',
      'method',
      ['is fast and efficient'],
      [] // Match the last occurrence
    );

    expect(applied).toBe(true);
    // Should match somewhere in the content
    expect(result).toContain('method');
  });
});
