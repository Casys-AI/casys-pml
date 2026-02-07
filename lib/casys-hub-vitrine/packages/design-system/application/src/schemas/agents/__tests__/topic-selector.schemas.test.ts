import { describe, it, expect } from 'vitest';

import { aiTopicSelectionResponseZodSchema } from '../../agents/topic-selector.schemas';

describe('aiTopicSelectionResponseZodSchema (v3)', () => {
  it('validates pillar mode with chosenCluster and keywordTags [cluster + additionals]', () => {
    const input = {
      angle: 'How to scale Next.js on Vercel',
      contentType: 'guide',
      selectionMode: 'pillar',
      chosenCluster: {
        pillarTag: { label: 'next js performance', slug: 'next-js-performance', source: 'pillar' },
        satelliteTags: [
          { label: 'vercel edge', slug: 'vercel-edge', source: 'satellite' },
          { label: 'server components', slug: 'server-components', source: 'satellite' }
        ]
      },
      seoSummary: {
        keywordTags: [
          // cluster (pillar + satellites)
          { label: 'next js performance', slug: 'next-js-performance', source: 'pillar' },
          { label: 'vercel edge', slug: 'vercel-edge', source: 'satellite' },
          { label: 'server components', slug: 'server-components', source: 'satellite' },
          // additionals (max 3-5 typical)
          { label: 'react 19', slug: 'react-19', source: 'trend' },
          { label: 'isr vs ssr', slug: 'isr-vs-ssr', source: 'related_keywords' }
        ],
        searchIntent: {
          intent: 'informational',
          confidence: 0.9,
          supportingQueries: ['next js performance tuning', 'edge functions latency']
        },
        contentStrategy: {
          recommendations: {
            seo: ['use schema.org'],
            editorial: ['include benchmarks'],
            technical: ['target 1500+ words']
          }
        },
        competitiveAnalysis: {
          contentGaps: ['benchmark next js vs remix', 'edge cache invalidation']
        }
      },
      topics: [
        { id: 't1', title: 'Some source article', sourceUrl: 'https://ex.com/a', createdAt: new Date().toISOString(), language: 'en' }
      ]
    };

    const parsed = aiTopicSelectionResponseZodSchema.parse(input);
    expect(parsed.angle).toBe('How to scale Next.js on Vercel');
    expect(parsed.chosenCluster?.pillarTag.label).toBe('next js performance');
    expect(parsed.seoSummary.keywordTags.length).toBeGreaterThanOrEqual(5);
  });

  it('validates satellite-only mode (no pillar) with extras', () => {
    const input = {
      angle: 'Edge Functions cold starts in practice',
      contentType: 'analyse-tendance',
      selectionMode: 'satellite',
      chosenCluster: {
        pillarTag: undefined,
        satelliteTags: [
          { label: 'vercel edge', slug: 'vercel-edge', source: 'satellite' }
        ]
      },
      seoSummary: {
        keywordTags: [
          // selected satellite
          { label: 'vercel edge', slug: 'vercel-edge', source: 'satellite' },
          // additionals
          { label: 'cold start', slug: 'cold-start', source: 'trend' },
          { label: 'edge runtime', slug: 'edge-runtime', source: 'related_keywords' }
        ],
        searchIntent: {
          intent: 'informational',
          confidence: 0.8,
          supportingQueries: ['edge function cold starts']
        },
        contentStrategy: { recommendations: { seo: [], editorial: [], technical: [] } },
        competitiveAnalysis: { contentGaps: ['measure cold start with k6'] }
      },
      topics: [
        { id: 't1', title: 'Another source', sourceUrl: 'https://ex.com/b', createdAt: new Date().toISOString(), language: 'en' }
      ]
    };

    const parsed = aiTopicSelectionResponseZodSchema.parse(input);
    expect(parsed.selectionMode).toBe('satellite');
    expect(parsed.chosenCluster?.satelliteTags.length).toBe(1);
    expect(parsed.chosenCluster?.pillarTag).toBeUndefined();
  });
});
