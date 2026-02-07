import { Tool } from '@langchain/core/tools';

import type { AITextModelPort, SectionWriteResult } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * Agent POML minimaliste pour générer une section.
 * Comportement harmonisé avec OutlineWriterAgent: forward d'un prompt POML directement au modèle.
 */
export class SectionWriterAgent extends Tool {
  name = 'section_writer';
  description =
    "Génère une section d'article à partir d'un prompt POML fourni. Entrée: chaîne POML. Sortie: texte brut du modèle.";

  private readonly logger = createLogger(SectionWriterAgent.name);
  private aiTextModel: AITextModelPort;

  constructor(aiTextModel: AITextModelPort) {
    super();
    this.aiTextModel = aiTextModel;
  }

  /**
   * Méthode requise par Tool - point d'entrée principal
   * @param arg Chaîne JSON d'entrée
   * @returns Résultat de génération de section sous forme de chaîne JSON
   */
  protected async _call(arg: string): Promise<string> {
    this.logger.debug('SectionWriterAgent appelé');
    if (!arg || typeof arg !== 'string' || arg.trim().length === 0) {
      throw new Error('SectionWriterAgent: prompt POML requis');
    }
    const aiResponse = await this.aiTextModel.generateText(arg);
    return aiResponse;
  }

  /**
   * Typed convenience matching SectionWriterWriteSectionPort.writeSection signature.
   */
  async writeSection(input: unknown): Promise<SectionWriteResult> {
    if (typeof input !== 'string' || input.trim().length === 0) {
      throw new Error('SectionWriterAgent.writeSection: prompt POML requis');
    }

    // Log INPUT (full prompt for debugging)
    this.logger.debug('SectionWriterAgent INPUT:', {
      prompt: input
    });

    const raw = await this.invoke(input);
    if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
      throw new Error('SectionWriterAgent.writeSection: réponse vide');
    }
    try {
      const result = JSON.parse(raw.trim()) as SectionWriteResult;

      // Log OUTPUT (full data for debugging)
      this.logger.debug('SectionWriterAgent OUTPUT:', {
        contentLength: result.content?.length ?? 0,
        content: result.content,
        componentsCount: Array.isArray(result.components) ? result.components.length : 0,
        components: result.components
      });

      return result;
    } catch (e) {
      this.logger.error('SectionWriterAgent.writeSection: JSON.parse failed', e);
      throw new Error('SectionWriterAgent.writeSection: invalid JSON');
    }
  }
}

/**
 * Factory function to create an instance of the SectionWriterAgent tool.
 * Mirrors the OutlineWriterAgent factory for consistent usage.
 */
export function createSectionWriterAgent(aiTextModel: AITextModelPort): SectionWriterAgent {
  return new SectionWriterAgent(aiTextModel);
}
