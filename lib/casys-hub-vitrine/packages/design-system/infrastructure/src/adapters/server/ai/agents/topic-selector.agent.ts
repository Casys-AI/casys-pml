import { Tool } from '@langchain/core/tools';

import type { SelectTopicResult } from '@casys/core';
import type { AITextModelPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * The TopicSelectorAgent is a specialized tool for selecting the most relevant topics
 * from a list of news articles using AI-powered analysis.
 */

export class TopicSelectorAgent extends Tool {
  name = 'topic_selector';
  description =
    "Sélectionne des sujets à partir d'un prompt POML fourni (incluant les instructions de format). Entrée: chaîne POML. Sortie: texte brut du modèle.";

  private readonly logger = createLogger(TopicSelectorAgent.name);
  private aiTextModel: AITextModelPort;

  constructor(aiTextModel: AITextModelPort) {
    super();
    this.aiTextModel = aiTextModel;
  }

  protected async _call(arg: string): Promise<string> {
    this.logger.debug('TopicSelectorAgent appelé');
    if (!arg || typeof arg !== 'string' || arg.trim().length === 0) {
      throw new Error('TopicSelectorAgent: prompt POML requis');
    }
    const aiResponse = await this.aiTextModel.generateText(arg);
    return aiResponse;
  }

  /**
   * Typed convenience matching SelectTopicExecutePort.execute signature.
   */
  async selectTopics(input: unknown): Promise<SelectTopicResult> {
    if (typeof input !== 'string' || input.trim().length === 0) {
      throw new Error('TopicSelectorAgent.selectTopics: prompt POML requis');
    }

    // Log INPUT (full prompt for debugging)
    this.logger.debug('TopicSelectorAgent INPUT:', {
      prompt: input
    });

    const raw = await this.invoke(input);
    if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
      throw new Error('TopicSelectorAgent.selectTopics: réponse vide');
    }
    try {
      const result = JSON.parse(raw.trim()) as SelectTopicResult;

      // Log OUTPUT (full data for debugging)
      this.logger.debug('TopicSelectorAgent OUTPUT:', {
        topicsCount: Array.isArray(result.topics) ? result.topics.length : 0,
        topics: Array.isArray(result.topics) 
          ? result.topics.map(t => ({ id: t.id, title: t.title, keywords: t.keywords }))
          : [],
        angle: result.angle
      });

      return result;
    } catch (e) {
      this.logger.error('TopicSelectorAgent.selectTopics: JSON.parse failed', e);
      throw new Error('TopicSelectorAgent.selectTopics: invalid JSON');
    }
  }
}

/**
 * Factory function to create an instance of the TopicSelectorAgent tool.
 * @param topicSelector The service to select topics from news articles
 * @returns A new instance of TopicSelectorAgent configured with the provided service
 */
export function createTopicSelectorAgent(aiTextModel: AITextModelPort): TopicSelectorAgent {
  return new TopicSelectorAgent(aiTextModel);
}
