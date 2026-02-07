import {
  buildSectionSummarizerPoml,
  type PromptTemplatePort,
  type SectionSummarizerSummarizeSectionPort,
} from '@casys/application';

import { createLogger, type Logger } from '../../../../../../utils/logger';
import type { ArticleGenerationState } from '../article-generation.state';

export interface SummarizeSectionNodeDeps {
  logger?: Logger;
  promptTemplate: PromptTemplatePort;
  sectionSummarizer: SectionSummarizerSummarizeSectionPort;
  templatePath?: string; // default: 'prompts/section-summarizer.poml'
}

export async function summarizeSectionNode(
  state: ArticleGenerationState,
  deps: SummarizeSectionNodeDeps
): Promise<ArticleGenerationState> {
  const logger = deps.logger ?? createLogger('ArticleGeneration.summarizeSection');
  const templatePath = deps.templatePath ?? 'prompts/section-summarizer.poml';

  if (!state.sections || state.sections.length === 0) return state;

  const idx = state.cursorIndex ?? 0;
  const current = state.sections.find(s => s.position === idx) ?? state.sections[idx];
  if (!current) return state;

  try {
    const level = typeof current.level === 'number' && current.level > 0 ? current.level : 2;
    const dto = {
      sectionTitle: current.title,
      sectionContent: current.content,
      sectionLevel: level,
      maxSentences: 3,
    };
    const poml = await buildSectionSummarizerPoml(deps.promptTemplate, templatePath, dto);
    const res = await deps.sectionSummarizer.summarizeSection(poml);
    const summary = res?.summary ? String(res.summary) : undefined;

    const updated = state.sections.map(s => (s.id === current.id ? { ...s, summary } : s));
    return { ...state, sections: updated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn?.('[ArticleGeneration] summarizeSection failed (non-bloquant)', {
      sectionId: current.id,
      error: msg,
    });
    return state;
  }
}
