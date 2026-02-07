import { Tool } from '@langchain/core/tools';

import type { AITextModelPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * Résultat de résumé d'une section
 */
export interface SectionSummaryResult {
  summary: string; // Résumé en 2-3 phrases
  keyPoints: string[]; // 2-3 idées clés
}

/**
 * Input pour le résumé de section
 */
export interface SectionSummarizerInput {
  sectionTitle: string;
  sectionContent: string;
  sectionLevel?: number;
  maxSentences?: number;
}

/**
 * Agent POML pour résumer intelligemment une section d'article
 * Utilisé pour générer des résumés concis des sections voisines dans le contexte
 */
export class SectionSummarizerAgent extends Tool {
  name = 'section_summarizer';
  description =
    "Résume une section d'article en 2-3 phrases. Input: POML prompt. Output: JSON {summary, keyPoints}.";

  private readonly logger = createLogger('SectionSummarizerAgent');

  constructor(private readonly aiTextModel: AITextModelPort) {
    super();
  }

  /**
   * Méthode interne Tool (reçoit le prompt POML complet)
   * Retourne directement la réponse IA sans parsing/re-stringify
   */
  protected async _call(pomlPrompt: string): Promise<string> {
    this.logger.debug('SectionSummarizerAgent appelé');

    if (!pomlPrompt || typeof pomlPrompt !== 'string' || pomlPrompt.trim().length === 0) {
      throw new Error('SectionSummarizerAgent: prompt POML requis');
    }

    const aiResponse = await this.aiTextModel.generateText(pomlPrompt);
    return aiResponse;
  }

  /**
   * Méthode publique typée pour résumer une section
   * (utilisée par l'application via le port)
   */
  async summarizeSection(pomlPrompt: string): Promise<SectionSummaryResult> {
    if (typeof pomlPrompt !== 'string' || pomlPrompt.trim().length === 0) {
      throw new Error('SectionSummarizerAgent.summarizeSection: prompt POML requis');
    }

    const raw = await this.invoke(pomlPrompt);
    if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
      throw new Error('SectionSummarizerAgent.summarizeSection: réponse vide');
    }

    try {
      const result = JSON.parse(raw.trim()) as SectionSummaryResult;
      
      // Validation basique du schéma
      if (!result.summary || !Array.isArray(result.keyPoints)) {
        throw new Error('Format de réponse invalide: summary ou keyPoints manquants');
      }
      
      return result;
    } catch (e) {
      this.logger.error('SectionSummarizerAgent.summarizeSection: JSON.parse failed', e);
      throw new Error('SectionSummarizerAgent.summarizeSection: invalid JSON');
    }
  }
}
