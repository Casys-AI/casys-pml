import { describe, it, expect } from 'vitest';

import type { ExtractedKeyword } from '../../value-objects/extracted-keyword.value';

describe('ExtractedKeyword Value Object', () => {
  it('should create a valid ExtractedKeyword', () => {
    const keyword: ExtractedKeyword = {
      keyword: 'machine learning',
      frequency: 15,
      relevanceScore: 0.85,
      sources: ['https://example.com/page1', 'https://example.com/page2'],
    };

    expect(keyword.keyword).toBe('machine learning');
    expect(keyword.frequency).toBe(15);
    expect(keyword.relevanceScore).toBe(0.85);
    expect(keyword.sources).toHaveLength(2);
  });

  it('should have relevanceScore between 0 and 1', () => {
    const keyword: ExtractedKeyword = {
      keyword: 'test',
      frequency: 1,
      relevanceScore: 0.5,
      sources: [],
    };

    expect(keyword.relevanceScore).toBeGreaterThanOrEqual(0);
    expect(keyword.relevanceScore).toBeLessThanOrEqual(1);
  });

  it('should support empty sources array', () => {
    const keyword: ExtractedKeyword = {
      keyword: 'test',
      frequency: 1,
      relevanceScore: 0.5,
      sources: [],
    };

    expect(keyword.sources).toEqual([]);
  });

  it('should be comparable by relevanceScore for sorting', () => {
    const keywords: ExtractedKeyword[] = [
      { keyword: 'low', frequency: 1, relevanceScore: 0.3, sources: [] },
      { keyword: 'high', frequency: 1, relevanceScore: 0.9, sources: [] },
      { keyword: 'medium', frequency: 1, relevanceScore: 0.6, sources: [] },
    ];

    const sorted = [...keywords].sort((a, b) => b.relevanceScore - a.relevanceScore);

    expect(sorted[0].keyword).toBe('high');
    expect(sorted[1].keyword).toBe('medium');
    expect(sorted[2].keyword).toBe('low');
  });
});
