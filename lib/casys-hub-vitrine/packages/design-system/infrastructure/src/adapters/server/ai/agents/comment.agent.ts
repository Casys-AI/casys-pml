import { Tool } from '@langchain/core/tools';
import { z } from 'zod';

import type { AITextModelPort } from '@casys/application';

import { createLogger, type Logger } from '../../../../utils/logger';

/**
 * Schéma de validation pour l'entrée du CommentAgent
 */
const CommentAgentInputSchema = z.object({
  originalComment: z.string().min(1, 'Le commentaire original est requis'),
  context: z
    .object({
      sectionContent: z.string().optional(),
      articleTitle: z.string().optional(),
      articleTopic: z.string().optional(),
      previousComments: z.array(z.string()).optional(),
    })
    .optional(),
  actionsPerformed: z
    .object({
      componentsGenerated: z
        .array(
          z.object({
            name: z.string(),
            props: z.record(z.unknown()),
          })
        )
        .optional(),
      sectionsWritten: z
        .array(
          z.object({
            type: z.string(),
            content: z.string(),
          })
        )
        .optional(),
      otherActions: z.array(z.string()).optional(),
    })
    .optional(),
  responseStyle: z.enum(['helpful', 'detailed', 'concise', 'encouraging']).default('helpful'),
  includeActionSummary: z.boolean().default(true),
});

export type CommentAgentInput = z.infer<typeof CommentAgentInputSchema>;

/**
 * Schéma de validation pour la réponse IA du CommentAgent
 */
const CommentResponseSchema = z.object({
  response: z.string().min(1, 'La réponse est requise'),
  tone: z.string(),
  actionsSummary: z.array(z.string()),
  followUpSuggestions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  metadata: z.object({
    responseLength: z.number().min(0),
    complexity: z.enum(['simple', 'moderate', 'complex']),
    topics: z.array(z.string()),
    sentiment: z.enum(['positive', 'neutral', 'negative']),
  }),
});

export type CommentResponse = z.infer<typeof CommentResponseSchema>;

/**
 * Agent LangChain pour générer des réponses conversationnelles aux commentaires
 * Comprend le contexte complet incluant les composants générés et actions effectuées
 */
export class CommentAgent extends Tool {
  name = 'comment_responder';
  description =
    'Generates conversational responses to user comments with full context awareness of generated components and performed actions. Input should be a JSON object with originalComment, context, actionsPerformed, responseStyle, and includeActionSummary.';

  private readonly logger: Logger;

  constructor(
    private readonly aiTextModel: AITextModelPort,
    logger?: Logger
  ) {
    super();
    this.logger = logger ?? createLogger('CommentAgent');
  }

  /**
   * Méthode requise par Tool - point d'entrée principal
   * @param input Chaîne JSON d'entrée
   * @returns Résultat de génération de réponse sous forme de chaîne JSON
   */
  async _call(input: string): Promise<string> {
    try {
      this.logger.log('=== Génération Réponse Commentaire ===');

      const parsedInput = this.validateAndParseInput(input);
      const result = await this.respondToComment(parsedInput);

      return JSON.stringify(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      this.logger.error(`Erreur dans CommentAgent: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Valide et parse l'entrée JSON
   * @param input Chaîne JSON d'entrée
   * @returns Entrée parsée et validée
   */
  private validateAndParseInput(input: string): CommentAgentInput {
    try {
      const parsed: unknown = JSON.parse(input);
      return CommentAgentInputSchema.parse(parsed);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        throw new Error(`Validation échouée: ${errorMessages.join(', ')}`);
      }
      throw new Error('Format JSON invalide pour CommentAgent');
    }
  }

  /**
   * Génère une réponse conversationnelle au commentaire
   * @param input Paramètres de génération de réponse
   * @returns Réponse générée avec métadonnées
   */
  async respondToComment(input: CommentAgentInput): Promise<CommentResponse> {
    this.logger.debug('Génération de réponse au commentaire', {
      originalCommentLength: input.originalComment.length,
      responseStyle: input.responseStyle,
      hasContext: !!input.context,
      hasActions: !!input.actionsPerformed,
    });

    // Construction du contexte complet
    const fullContext = this.buildFullContext(input);

    // Prompt pour la génération de réponse
    const prompt = this.buildResponsePrompt(input, fullContext);

    try {
      // Appel au modèle IA
      const response = await this.aiTextModel.generateText(prompt);

      const result = this.parseAIResponse(response, input);

      this.logger.debug('Réponse générée avec succès', {
        responseLength: result.response.length,
        confidence: result.confidence,
        tone: result.tone,
        actionsCount: result.actionsSummary.length,
      });

      return result;
    } catch (error) {
      this.logger.error('Erreur lors de la génération de réponse', error);
      throw new Error(
        `Impossible de générer la réponse: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }
  }

  /**
   * Construit le contexte complet pour l'IA
   */
  private buildFullContext(input: CommentAgentInput): string {
    let context = `Commentaire original: "${input.originalComment}"\n`;
    context += `Style de réponse souhaité: ${input.responseStyle}\n`;

    // Contexte de l'article
    if (input.context) {
      if (input.context.articleTitle) {
        context += `\nTitre de l'article: ${input.context.articleTitle}\n`;
      }
      if (input.context.articleTopic) {
        context += `Sujet de l'article: ${input.context.articleTopic}\n`;
      }
      if (input.context.sectionContent) {
        context += `\nContenu de la section concernée:\n${input.context.sectionContent.substring(0, 500)}...\n`;
      }
      if (input.context.previousComments && input.context.previousComments.length > 0) {
        context += `\nCommentaires précédents:\n${input.context.previousComments.map(c => `- ${c}`).join('\n')}\n`;
      }
    }

    // Actions effectuées
    if (input.actionsPerformed && input.includeActionSummary) {
      context += `\nActions effectuées en réponse au commentaire:\n`;

      if (
        input.actionsPerformed.componentsGenerated &&
        input.actionsPerformed.componentsGenerated.length > 0
      ) {
        context += `Composants générés:\n`;
        input.actionsPerformed.componentsGenerated.forEach(comp => {
          context += `- ${comp.name} avec props: ${JSON.stringify(comp.props)}\n`;
        });
      }

      if (
        input.actionsPerformed.sectionsWritten &&
        input.actionsPerformed.sectionsWritten.length > 0
      ) {
        context += `Sections écrites/modifiées:\n`;
        input.actionsPerformed.sectionsWritten.forEach(section => {
          context += `- ${section.type}: ${section.content.substring(0, 100)}...\n`;
        });
      }

      if (input.actionsPerformed.otherActions && input.actionsPerformed.otherActions.length > 0) {
        context += `Autres actions:\n`;
        input.actionsPerformed.otherActions.forEach(action => {
          context += `- ${action}\n`;
        });
      }
    }

    return context;
  }

  /**
   * Construit le prompt pour l'IA
   */
  private buildResponsePrompt(input: CommentAgentInput, fullContext: string): string {
    const styleGuidance = {
      helpful: 'amical et serviable, en expliquant clairement ce qui a été fait',
      detailed: 'détaillé et technique, en fournissant des explications approfondies',
      concise: 'bref et direct, allant droit au but',
      encouraging: 'motivant et positif, en encourageant la collaboration',
    };

    return `Tu es un assistant IA collaboratif qui répond aux commentaires des utilisateurs dans un système de création de contenu.

Contexte complet:
${fullContext}

Instructions:
1. Génère une réponse ${styleGuidance[input.responseStyle]}
2. Reconnais le commentaire original et montre que tu l'as compris
3. ${input.includeActionSummary ? 'Résume brièvement les actions effectuées' : 'Ne mentionne pas spécifiquement les actions techniques'}
4. Propose des suggestions de suite si pertinent
5. Maintiens un ton professionnel mais accessible
6. Utilise le français naturel

Format de réponse attendu (JSON strict):
{
  "response": "Réponse conversationnelle au commentaire",
  "tone": "Description du ton utilisé",
  "actionsSummary": ["Action 1 résumée", "Action 2 résumée"],
  "followUpSuggestions": ["Suggestion 1", "Suggestion 2"],
  "confidence": 0.9,
  "metadata": {
    "responseLength": 250,
    "complexity": "moderate",
    "topics": ["topic1", "topic2"],
    "sentiment": "positive"
  }
}

Réponds UNIQUEMENT avec le JSON, sans texte additionnel.`;
  }

  /**
   * Parse la réponse de l'IA et extrait les résultats
   */
  private parseAIResponse(response: string, input: CommentAgentInput): CommentResponse {
    try {
      const parsed: unknown = JSON.parse(response.trim());

      // Validation avec Zod
      const result = CommentResponseSchema.safeParse(parsed);

      if (result.success) {
        return result.data;
      } else {
        const errorMessages = result.error.errors.map(
          err => `${err.path.join('.')}: ${err.message}`
        );
        const errorMsg = `Validation de la réponse IA échouée: ${errorMessages.join(', ')}`;
        this.logger.error(errorMsg, { errors: result.error.errors });
        throw new Error(errorMsg);
      }
    } catch (_error) {
      this.logger.warn("Impossible de parser la réponse IA, génération d'une réponse par défaut");

      // Fallback si le parsing JSON échoue
      const fallbackResponse = this.generateFallbackResponse(input);
      return fallbackResponse;
    }
  }

  /**
   * Génère une réponse de secours si le parsing échoue
   */
  private generateFallbackResponse(input: CommentAgentInput): CommentResponse {
    const responses = {
      helpful: `Merci pour votre commentaire ! J'ai bien pris en compte votre demande et j'ai effectué les actions nécessaires pour y répondre.`,
      detailed: `Votre commentaire a été analysé en détail. J'ai procédé aux modifications et générations demandées selon les spécifications fournies.`,
      concise: `Commentaire traité. Actions effectuées.`,
      encouraging: `Super commentaire ! J'ai hâte de voir ce que nous pouvons créer ensemble. Vos suggestions ont été mises en œuvre !`,
    };

    // Assurer qu'on a une réponse valide même si responseStyle est invalide
    const defaultStyle = 'helpful';
    const selectedResponse = responses[input.responseStyle] ?? responses[defaultStyle];
    const selectedTone = input.responseStyle ?? defaultStyle;

    return {
      response: selectedResponse,
      tone: selectedTone,
      actionsSummary: ['Actions effectuées selon le commentaire'],
      followUpSuggestions: ['Continuer à collaborer', 'Proposer des améliorations'],
      confidence: 0.6,
      metadata: {
        responseLength: selectedResponse.length,
        complexity: 'simple',
        topics: ['général'],
        sentiment: 'positive',
      },
    };
  }

  /**
   * Calcule la longueur de la réponse
   */
  private calculateResponseLength(response: string): number {
    return response.length;
  }
}
