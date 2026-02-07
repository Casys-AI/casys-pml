import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type {
  ArticleGenerationOutline,
  OutlineWriterCommand,
  OutlineWriterPort,
} from '@casys/core';
import type {
  AITextModelPort,
  ArticleIndexingUpsertPort,
  IndexArticleProgressivelyUseCase,
  PromptTemplatePort,
  SectionContextPort,
  SectionSummarizerSummarizeSectionPort,
  TopicRelationsPort,
} from '@casys/application';

import { createLogger, type Logger } from '../../../../../utils/logger';
import { decideNextSectionNode } from './nodes/decide-next-section-node';
import { finalizeNode } from './nodes/finalize-node';
// Outline generation is handled upstream; no generation node here
import { initCursorNode } from './nodes/init-cursor-node';
// Outline persistence (indexing) is handled upstream; no persistOutline node here
import { persistSectionNode } from './nodes/persist-section-node';
import { refineSectionsNode } from './nodes/refine-sections-node';
import { reviewArticleNode } from './nodes/review-article-node';
import { summarizeSectionNode } from './nodes/summarize-section-node';
// No outline validation node; outline is assumed provided by the use case
import { writeSectionNode, type WriteSectionNodeDeps } from './nodes/write-section-node';
// Per-section unit nodes
import {
  type ArticleGenerationState,
  type ContentFormat,
  mdxSectionOutputSchema,
} from './article-generation.state';

export class ArticleGenerationWorkflow {
  private readonly logger: Logger;

  constructor(
    private readonly deps: {
      outlineWriter?: OutlineWriterPort;
      aiModel: AITextModelPort;
      promptTemplate: PromptTemplatePort;
      sectionContext?: SectionContextPort;
      sectionSummarizer?: SectionSummarizerSummarizeSectionPort;
      indexArticleUseCase?: IndexArticleProgressivelyUseCase;
      topicRelations?: TopicRelationsPort;
      indexingPort?: ArticleIndexingUpsertPort;
      logger?: Logger;
    }
  ) {
    this.logger = this.deps.logger ?? createLogger('ArticleGenerationWorkflow');
  }

  private buildGraph(params: { templatePath: string; contentFormat: ContentFormat }) {
    const StateAnn = Annotation.Root({
      tenantId: Annotation<ArticleGenerationState['tenantId']>(),
      projectId: Annotation<ArticleGenerationState['projectId']>(),
      language: Annotation<ArticleGenerationState['language']>(),

      // Config
      templatePath: Annotation<ArticleGenerationState['templatePath']>(),
      contentFormat: Annotation<ArticleGenerationState['contentFormat']>(),

      // Outline / Sections
      outlineCommand: Annotation<ArticleGenerationState['outlineCommand']>(),
      outline: Annotation<ArticleGenerationState['outline']>(),
      outlineSummary: Annotation<ArticleGenerationState['outlineSummary']>(),
      outlineKeywordTags: Annotation<ArticleGenerationState['outlineKeywordTags']>(),
      sections: Annotation<ArticleGenerationState['sections']>(),
      cursorIndex: Annotation<ArticleGenerationState['cursorIndex']>(),
      relationsBySection: Annotation<ArticleGenerationState['relationsBySection']>(),

      // Validation / Control
      textFragments: Annotation<ArticleGenerationState['textFragments']>(),
      comments: Annotation<ArticleGenerationState['comments']>(),
      recentlyModifiedIds: Annotation<ArticleGenerationState['recentlyModifiedIds']>(),
      attempts: Annotation<ArticleGenerationState['attempts']>(),
      maxAttempts: Annotation<ArticleGenerationState['maxAttempts']>(),
      totalWords: Annotation<ArticleGenerationState['totalWords']>(),
      status: Annotation<ArticleGenerationState['status']>(),
    });

    type GraphState = typeof StateAnn.State;
    const builder = new StateGraph(StateAnn);

    const writeSectionDeps: WriteSectionNodeDeps = {
      aiModel: this.deps.aiModel,
      promptTemplate: this.deps.promptTemplate,
      sectionContext: this.deps.sectionContext,
      logger: this.logger,
      outputContract:
        params.contentFormat === 'mdx' || params.contentFormat === 'markdown'
          ? mdxSectionOutputSchema
          : mdxSectionOutputSchema,
    };

    const decideAfterReview = (s: ArticleGenerationState) => {
      const hasFragments = (s.textFragments?.length ?? 0) > 0;
      const attemptNum = s.attempts ?? 0;
      const maxAttempts = s.maxAttempts ?? 1;

      // Check attempt limit
      if (attemptNum >= maxAttempts) {
        this.logger.warn('[ArticleGeneration] ⚠️  Attempt limit reached, FINALIZE forced', {
          attempts: attemptNum,
          maxAttempts,
          remainingFragments: s.textFragments?.length ?? 0,
        });
        return 'finalize';
      }

      let decision: 'finalize' | 'refineSections';
      if (!hasFragments) {
        decision = 'finalize';
        this.logger.log('[ArticleGeneration] ✅ Decision: FINALIZE (no corrections needed)', {
          attempt: attemptNum,
          sectionsCompleted: s.sections.length,
        });
      } else {
        decision = 'refineSections';
        this.logger.log('[ArticleGeneration] 🔧 Decision: APPLY TextFragments', {
          attempt: attemptNum + 1,
          maxAttempts,
          fragmentsToApply: s.textFragments?.length,
          sectionsAffected: new Set(s.textFragments?.map(f => f.sectionId)).size,
        });
      }

      return decision;
    };

    // No outline validation decision: we always proceed to outline persistence

    const graph = builder
      // Per-section loop nodes
      .addNode('initCursor', (state: GraphState) =>
        initCursorNode(state as ArticleGenerationState, { logger: this.logger })
      )
      .addNode('writeSection', (state: GraphState) =>
        writeSectionNode(state as ArticleGenerationState, writeSectionDeps)
      )
      .addNode('summarizeSection', (state: GraphState) =>
        summarizeSectionNode(state as ArticleGenerationState, {
          logger: this.logger,
          promptTemplate: this.deps.promptTemplate,
          sectionSummarizer: this.deps.sectionSummarizer!,
          templatePath: 'prompts/section-summarizer.poml',
        })
      )
      .addNode('persistSection', (state: GraphState) =>
        persistSectionNode(state as ArticleGenerationState, {
          logger: this.logger,
          indexArticleUseCase: this.deps.indexArticleUseCase,
          topicRelations: this.deps.topicRelations,
          indexingPort: this.deps.indexingPort,
        })
      )
      .addNode('decideNextSection', (state: GraphState) =>
        decideNextSectionNode(state as ArticleGenerationState, { logger: this.logger })
      )
      .addNode('reviewArticle', (state: GraphState) =>
        reviewArticleNode(state as ArticleGenerationState, {
          logger: this.logger,
          aiModel: this.deps.aiModel,
        })
      )
      .addNode('refineSections', (state: GraphState) =>
        refineSectionsNode(state as ArticleGenerationState, {
          logger: this.logger,
          aiModel: this.deps.aiModel,
        })
      )
      .addNode('finalize', (state: GraphState) =>
        finalizeNode(state as ArticleGenerationState, { logger: this.logger })
      )
      .addEdge(START, 'initCursor')
      // Per-section loop
      .addEdge('initCursor', 'writeSection')
      .addEdge('writeSection', 'summarizeSection')
      .addEdge('summarizeSection', 'persistSection')
      .addEdge('persistSection', 'decideNextSection')
      .addConditionalEdges(
        'decideNextSection',
        (s: GraphState) => {
          const st = s as unknown as ArticleGenerationState;
          const total = st.outline?.sections?.length ?? 0;
          const curr = st.cursorIndex ?? 0;
          return curr < total ? 'writeSection' : 'reviewArticle';
        },
        { writeSection: 'writeSection', reviewArticle: 'reviewArticle' }
      )
      .addConditionalEdges(
        'reviewArticle',
        (s: GraphState) => decideAfterReview(s as ArticleGenerationState),
        {
          refineSections: 'refineSections',
          finalize: 'finalize',
        }
      )
      .addEdge('refineSections', 'reviewArticle')
      .addEdge('finalize', END)
      .compile();

    return graph;
  }

  async execute(
    input: {
      tenantId: string;
      projectId: string;
      language: string;
      outline?: ArticleGenerationOutline;
      outlineCommand?: OutlineWriterCommand; // if outline is absent and an outline writer is provided
    },
    config: {
      templatePath: string;
      contentFormat: ContentFormat;
      maxAttempts?: number;
    }
  ) {
    const { tenantId, projectId, language, outline, outlineCommand } = input;
    const { templatePath, contentFormat, maxAttempts = 1 } = config;

    const graph = this.buildGraph({ templatePath, contentFormat });

    const initial: ArticleGenerationState = {
      tenantId,
      projectId,
      language,
      templatePath,
      contentFormat,
      outline,
      outlineCommand,
      cursorIndex: 0,
      sections: [],
      attempts: 0,
      maxAttempts,
      totalWords: 0,
      status: 'pending',
    };

    const result = await graph.invoke(initial, {
      recursionLimit: 100, // Support 10-15 sections + 1-2 cycles révision (après suppression validateSection: 4 nœuds/section au lieu de 5)
    });
    return {
      outline: result.outline,
      sections: result.sections,
      totalWords: result.totalWords,
      status: result.status,
    };
  }
}

export function createArticleGenerationWorkflow(deps: {
  outlineWriter?: OutlineWriterPort;
  aiModel: AITextModelPort;
  promptTemplate: PromptTemplatePort;
  sectionContext?: SectionContextPort;
  sectionSummarizer?: SectionSummarizerSummarizeSectionPort;
  indexArticleUseCase?: IndexArticleProgressivelyUseCase;
  topicRelations?: TopicRelationsPort;
  indexingPort?: ArticleIndexingUpsertPort;
  logger?: Logger;
}): ArticleGenerationWorkflow {
  return new ArticleGenerationWorkflow(deps);
}
