import { Tool } from '@langchain/core/tools';

import type { AITextModelPort, ArticleOutline } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * Agent POML minimaliste pour générer un outline.
 * Comportement harmonisé avec TopicSelectorAgent: forward d'un prompt POML directement au modèle.
 */
export class OutlineWriterAgent extends Tool {
  name = 'outline_writer';
  description =
    "Génère un plan d'article à partir d'un prompt POML fourni. Entrée: chaîne POML. Sortie: texte brut du modèle.";

  private readonly logger = createLogger(OutlineWriterAgent.name);
  private aiTextModel: AITextModelPort;

  constructor(aiTextModel: AITextModelPort) {
    super();
    this.aiTextModel = aiTextModel;
  }

  protected async _call(arg: string): Promise<string> {
    this.logger.debug('OutlineWriterAgent appelé');
    if (!arg || typeof arg !== 'string' || arg.trim().length === 0) {
      throw new Error('OutlineWriterAgent: prompt POML requis');
    }
    const aiResponse = await this.aiTextModel.generateText(arg);
    return aiResponse;
  }

  /**
   * Typed convenience: parse the model response into a structured outline.
   * Matches OutlineWriterGenerateOutlinePort.generateOutline signature.
   */
  async generateOutline(input: unknown): Promise<ArticleOutline> {
    if (typeof input !== 'string' || input.trim().length === 0) {
      throw new Error('OutlineWriterAgent.generateOutline: prompt POML requis');
    }

    // Log INPUT (full prompt for debugging)
    this.logger.debug('OutlineWriterAgent INPUT:', {
      prompt: input
    });

    const raw = await this.invoke(input);
    if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
      throw new Error('OutlineWriterAgent.generateOutline: réponse vide');
    }
    try {
      const result = JSON.parse(raw.trim()) as ArticleOutline;

      // Log OUTPUT (full data for debugging)
      this.logger.debug('OutlineWriterAgent OUTPUT:', {
        title: result.title,
        sectionsCount: Array.isArray(result.sections) ? result.sections.length : 0,
        sections: Array.isArray(result.sections) 
          ? result.sections.map((s: any) => ({ title: s.title, level: s.level }))
          : []
      });

      return result;
    } catch (e) {
      this.logger.error('OutlineWriterAgent.generateOutline: JSON.parse failed', e);
      throw new Error('OutlineWriterAgent.generateOutline: invalid JSON');
    }
  }
}

/**
 * Factory function to create an instance of the OutlineWriterAgent tool.
 * Mirrors the TopicSelectorAgent factory for consistent usage.
 */
export function createOutlineWriterAgent(aiTextModel: AITextModelPort): OutlineWriterAgent {
  return new OutlineWriterAgent(aiTextModel);
}
