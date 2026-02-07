import { describe, it, expect } from 'vitest';

import type { PageCandidate } from '../../value-objects/page-candidate.value';

describe('PageCandidate Value Object', () => {
  it('should create a valid PageCandidate', () => {
    const candidate: PageCandidate = {
      url: 'https://example.com/page1',
      score: 0.85,
      source: 'sitemap',
      metadata: {
        title: 'Page 1',
        priority: 1,
      },
    };

    expect(candidate.url).toBe('https://example.com/page1');
    expect(candidate.score).toBe(0.85);
    expect(candidate.source).toBe('sitemap');
    expect(candidate.metadata?.title).toBe('Page 1');
  });

  it('should support all source types', () => {
    const sources: PageCandidate['source'][] = ['sitemap', 'homepage-links', 'ai-selection'];

    sources.forEach(source => {
      const candidate: PageCandidate = {
        url: 'https://example.com',
        score: 0.5,
        source,
      };

      expect(candidate.source).toBe(source);
    });
  });

  it('should allow optional metadata', () => {
    const candidate: PageCandidate = {
      url: 'https://example.com',
      score: 0.5,
      source: 'sitemap',
    };

    expect(candidate.metadata).toBeUndefined();
  });

  it('should be sortable by score', () => {
    const candidates: PageCandidate[] = [
      { url: 'https://example.com/low', score: 0.3, source: 'sitemap' },
      { url: 'https://example.com/high', score: 0.9, source: 'ai-selection' },
      { url: 'https://example.com/medium', score: 0.6, source: 'homepage-links' },
    ];

    const sorted = [...candidates].sort((a, b) => b.score - a.score);

    expect(sorted[0].url).toBe('https://example.com/high');
    expect(sorted[1].url).toBe('https://example.com/medium');
    expect(sorted[2].url).toBe('https://example.com/low');
  });

  it('should support partial metadata', () => {
    const candidateWithTitle: PageCandidate = {
      url: 'https://example.com',
      score: 0.5,
      source: 'sitemap',
      metadata: {
        title: 'Only title',
      },
    };

    const candidateWithPriority: PageCandidate = {
      url: 'https://example.com',
      score: 0.5,
      source: 'sitemap',
      metadata: {
        priority: 1,
      },
    };

    expect(candidateWithTitle.metadata?.title).toBe('Only title');
    expect(candidateWithTitle.metadata?.priority).toBeUndefined();
    expect(candidateWithPriority.metadata?.priority).toBe(1);
    expect(candidateWithPriority.metadata?.title).toBeUndefined();
  });
});
