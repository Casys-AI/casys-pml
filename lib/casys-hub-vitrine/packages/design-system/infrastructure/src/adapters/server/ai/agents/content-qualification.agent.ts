import { Tool } from '@langchain/core/tools';

import type { AITextModelPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * Résultat de qualification IA du contenu
 */
export interface ContentQualificationResult {
  cleanedContent: string;
  contentType: 'article' | 'blog' | 'documentation' | 'news' | 'forum' | 'other';
  keyPoints: string[];
  qualityScore: number; // 0-1
  summary?: string;
}

/**
 * Agent IA simple pour qualification de contenu
 * Input: { content: string, title?: string, url?: string }
 * Output: ContentQualificationResult
 */
export class ContentQualificationAgent extends Tool {
  name = 'content_qualification';
  description =
    'Qualifie et nettoie du contenu extrait. Input: {content, title?, url?}. Output: contenu qualifié.';

  private readonly logger = createLogger('ContentQualificationAgent');

  constructor(private readonly aiTextModel: AITextModelPort) {
    super();
  }

  protected async _call(input: string): Promise<string> {
    this.logger.debug('ContentQualificationAgent appelé pour qualification');

    try {
      const request = JSON.parse(input);
      const { content, title, url } = request;

      if (!content || typeof content !== 'string') {
        throw new Error('Content requis pour la qualification');
      }

      // Prompt de qualification IA
      const prompt = `
Analyse et améliore ce contenu extrait automatiquement.

${title ? `TITRE: ${title}` : ''}
${url ? `URL: ${url}` : ''}

CONTENU:
${content.slice(0, 4000)}${content.length > 4000 ? '...[tronqué]' : ''}

Tâches:
1. Nettoie le contenu (supprime navigation, pubs, éléments parasites)
2. Identifie le type de contenu (article, blog, documentation, news, forum, other)
3. Extrais les points clés principaux (3-5 points max)
4. Évalue la qualité globale (0-1)
5. Crée un résumé concis si le contenu > 2000 caractères

Retourne un JSON strict:
{
  "cleanedContent": "contenu nettoyé...",
  "contentType": "article|blog|documentation|news|forum|other",
  "keyPoints": ["point 1", "point 2", ...],
  "qualityScore": 0.85,
  "summary": "résumé optionnel si contenu long"
}`;

      const aiResponse = await this.aiTextModel.generateText(prompt);
      const qualified = JSON.parse(aiResponse);

      return JSON.stringify({
        success: true,
        result: {
          cleanedContent: qualified.cleanedContent ?? content,
          contentType: qualified.contentType ?? 'other',
          keyPoints: qualified.keyPoints ?? [],
          qualityScore: qualified.qualityScore ?? 0.5,
          summary: qualified.summary,
        },
      });
    } catch (error) {
      this.logger.error('Erreur dans ContentQualificationAgent:', error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      });
    }
  }
}
