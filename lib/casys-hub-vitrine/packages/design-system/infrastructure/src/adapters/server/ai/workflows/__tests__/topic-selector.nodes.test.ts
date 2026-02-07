import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorialBriefStorePort } from '@casys/core';
import type { AITextModelPort, PromptTemplatePort } from '@casys/application';

import {
  analyzeGapsNode,
  decisionNode,
  generateNode,
  reangleNode,
  type TopicSelectorNodeDeps,
  validateAngleNode,
} from '../topic-selector.nodes';
import type { TopicSelectorState } from '../topic-selector.types';

// ✨ V3: Tests obsolètes - Les nodes analyzeGaps, decision, generate, reangle, validateAngle n'existent plus
// V3 a seulement filterTopicsNode (workflow simplifié)
// TODO: Réécrire ces tests pour V3 (tester uniquement filterTopicsNode)
describe.skip('TopicSelectorWorkflow - Nodes', () => {
  let mockBriefStore: EditorialBriefStorePort;
  let mockAIModel: AITextModelPort;
  let mockPromptTemplate: PromptTemplatePort;
  let mockLogger: any;
  let baseDeps: TopicSelectorNodeDeps;
  let baseState: TopicSelectorState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBriefStore = {
      searchSimilarBriefs: vi.fn().mockResolvedValue([]),
      getExistingAngles: vi.fn().mockResolvedValue([]),
      saveEditorialBrief: vi.fn(),
      getEditorialBrief: vi.fn(),
      linkBriefToArticle: vi.fn(),
    } as unknown as EditorialBriefStorePort;

    mockAIModel = {
      generateText: vi.fn().mockResolvedValue(
        JSON.stringify({
          topics: [
            { id: 't1', title: 'Test Topic', sourceUrl: 'http://test.com', createdAt: new Date().toISOString(), language: 'fr' },
          ],
          angle: 'Test Angle',
          seoSummary: { enrichedKeywords: ['kw1'] },
        })
      ),
    };

    mockPromptTemplate = {
      loadTemplate: vi.fn().mockResolvedValue('<poml></poml>'),
    };

    mockLogger = {
      log: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    baseDeps = {
      briefStore: mockBriefStore,
      aiModel: mockAIModel,
      promptTemplate: mockPromptTemplate,
      logger: mockLogger,
    };

    baseState = {
      articles: [{ id: 'a1', title: 'Article 1', sourceUrl: 'http://a.com', publishedAt: new Date() }],
      tags: [{ label: 'test', slug: 'test', source: 'seed' }],
      seoBriefData: { keywordTags: [{ label: 'test' }] } as any,
      projectId: 'project1',
      tenantId: 'tenant1',
      maxTopics: 3,
      templatePath: 'test.poml',
      attempts: 0,
      maxAttempts: 3,
      status: 'generating',
    };
  });

  describe('generateNode', () => {
    it('génère topics + angle + seoSummary depuis AI', async () => {
      const result = await generateNode(baseState, {
        aiModel: mockAIModel,
        promptTemplate: mockPromptTemplate,
        logger: mockLogger,
      });

      expect(result.topics).toBeDefined();
      expect(result.topics).toHaveLength(1);
      expect(result.angle).toBe('Test Angle');
      expect(result.seoSummary).toBeDefined();
      expect(result.status).toBe('validating');
      expect(mockAIModel.generateText).toHaveBeenCalled();
    });

    it('limite les topics à maxTopics', async () => {
      (mockAIModel.generateText as any).mockResolvedValue(
        JSON.stringify({
          topics: [
            { id: 't1', title: 'Topic 1', sourceUrl: 'http://a.com', createdAt: new Date().toISOString(), language: 'fr' },
            { id: 't2', title: 'Topic 2', sourceUrl: 'http://b.com', createdAt: new Date().toISOString(), language: 'fr' },
            { id: 't3', title: 'Topic 3', sourceUrl: 'http://c.com', createdAt: new Date().toISOString(), language: 'fr' },
          ],
          angle: 'Test',
          seoSummary: {},
        })
      );

      const result = await generateNode({ ...baseState, maxTopics: 2 }, {
        aiModel: mockAIModel,
        promptTemplate: mockPromptTemplate,
        logger: mockLogger,
      });

      expect(result.topics).toHaveLength(2);
    });

    it('fail-fast si AI retourne 0 topics', async () => {
      (mockAIModel.generateText as any).mockResolvedValue(
        JSON.stringify({ topics: [], angle: 'Test', seoSummary: {} })
      );

      await expect(
        generateNode(baseState, {
          aiModel: mockAIModel,
          promptTemplate: mockPromptTemplate,
          logger: mockLogger,
        })
      ).rejects.toThrow(/aucun topic/i);
    });

    it('log: initial mode inclut seoBriefData dans POML params', async () => {
      await generateNode(baseState, {
        aiModel: mockAIModel,
        promptTemplate: mockPromptTemplate,
        logger: mockLogger,
      });
      const debugCalls = (mockLogger.debug as any).mock.calls as any[];
      const promptLog = debugCalls.find(c => String(c[0]).includes('Prompt params'));
      expect(promptLog).toBeDefined();
      expect(promptLog[1].mode).toBe('initial');
      expect(promptLog[1].hasFeedback).toBe(false);
      expect(promptLog[1].includeSeoBriefData).toBe(true);
    });

    it('log: reangle mode exclut seoBriefData et inclut feedback uniquement', async () => {
      const reangleState: TopicSelectorState = { ...baseState, feedback: 'Feedback test', attempts: 1 } as any;
      await generateNode(reangleState, {
        aiModel: mockAIModel,
        promptTemplate: mockPromptTemplate,
        logger: mockLogger,
      });
      const debugCalls = (mockLogger.debug as any).mock.calls as any[];
      const promptLog = debugCalls.find(c => String(c[0]).includes('Prompt params'));
      expect(promptLog).toBeDefined();
      expect(promptLog[1].mode).toBe('reangle');
      expect(promptLog[1].hasFeedback).toBe(true);
      expect(promptLog[1].includeSeoBriefData).toBe(false);
      // existingBriefs sont aussi exclus en reangle
      expect(promptLog[1].includeExistingBriefs).toBe(false);
      expect(promptLog[1].feedbackChars).toBeGreaterThan(0);
    });
  });

  describe('validateAngleNode', () => {
    it('accepte angle si aucun brief similaire', async () => {
      const state: TopicSelectorState = {
        ...baseState,
        angle: 'Angle unique',
        status: 'validating',
      };

      const result = await validateAngleNode(state, {
        briefStore: mockBriefStore,
        logger: mockLogger,
      });

      expect(result.status).toBe('analyzing');
      expect(result.conflictingBriefs).toEqual([]);
    });

    it('détecte conflit si brief similaire (score > 0.7)', async () => {
      (mockBriefStore.searchSimilarBriefs as any).mockResolvedValue([
        {
          brief: { id: 'b1', angle: { value: 'Angle existant' } },
          similarityScore: 0.85,
        },
      ]);

      const state: TopicSelectorState = {
        ...baseState,
        angle: 'Angle proche',
        status: 'validating',
      };

      const result = await validateAngleNode(state, {
        briefStore: mockBriefStore,
        logger: mockLogger,
      });

      expect(result.conflictingBriefs).toBeDefined();
      expect(result.conflictingBriefs).toHaveLength(1);
      expect(mockBriefStore.searchSimilarBriefs).toHaveBeenCalled();
    });
  });

  describe('analyzeGapsNode', () => {
    it('récupère les angles existants et content gaps depuis sourceTopics', async () => {
      (mockBriefStore.getExistingAngles as any).mockResolvedValue([
        'Angle 1',
        'Angle 2',
        'Angle 3',
      ]);

      const state: TopicSelectorState = {
        ...baseState,
        status: 'analyzing',
      };

      const result = await analyzeGapsNode(state, {
        briefStore: mockBriefStore,
        logger: mockLogger,
      });

      // contentGaps inclut désormais gaps SEO + titres d'articles (fusion dédupliquée)
      expect(result.contentGaps).toBeDefined();
      expect(result.contentGaps!.length).toBeGreaterThan(0);
      expect(result.contentGaps).toContain('Article 1');
      expect(result.status).toBe('reangling');
      expect(mockBriefStore.getExistingAngles).toHaveBeenCalled();
    });
  });

  describe('reangleNode', () => {
    it('construit feedback pour régénération', async () => {
      const state: TopicSelectorState = {
        ...baseState,
        angle: 'Mon angle rejeté',
        conflictingBriefs: [
          {
            brief: { id: 'b1', angle: { value: 'Angle existant' }, topics: [] },
            similarityScore: 0.8,
          },
        ],
        contentGaps: ['Gap 1', 'Gap 2'],
        status: 'reangling',
      };

      const result = await reangleNode(state, {
        logger: mockLogger,
      });

      expect(result.feedback).toBeDefined();
      expect(result.feedback).toContain('Mon angle rejeté');
      expect(result.attempts).toBe(1);
      expect(result.status).toBe('generating');
    });

    it('fail-fast si aucun conflit à résoudre', async () => {
      const state: TopicSelectorState = {
        ...baseState,
        conflictingBriefs: [],
        status: 'reangling',
      };

      await expect(
        reangleNode(state, { logger: mockLogger })
      ).rejects.toThrow(/aucun conflit/i);
    });
  });

  describe('decisionNode', () => {
    it('retourne accept si pas de conflit', () => {
      const state: TopicSelectorState = {
        ...baseState,
        conflictingBriefs: [],
        status: 'analyzing',
      };

      const decision = decisionNode(state);
      expect(decision).toBe('accept');
    });

    it('retourne reangle si conflit avec score > 0.85 et attempts < maxAttempts', () => {
      const state: TopicSelectorState = {
        ...baseState,
        conflictingBriefs: [
          { brief: { id: 'b1', angle: { value: 'Test' }, topics: [] }, similarityScore: 0.9 },
        ],
        attempts: 1,
        maxAttempts: 3,
        status: 'analyzing',
      };

      const decision = decisionNode(state);
      expect(decision).toBe('reangle');
    });

    it('retourne failed si max attempts atteint avec conflits', () => {
      const state: TopicSelectorState = {
        ...baseState,
        conflictingBriefs: [
          { brief: { id: 'b1', angle: { value: 'Test' }, topics: [] }, similarityScore: 0.8 },
        ],
        attempts: 3,
        maxAttempts: 3,
        status: 'analyzing',
      };

      const decision = decisionNode(state);
      expect(decision).toBe('failed');
    });
  });
});
