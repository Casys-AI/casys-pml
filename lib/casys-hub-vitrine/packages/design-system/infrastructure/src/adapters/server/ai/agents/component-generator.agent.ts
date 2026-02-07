import { Tool } from '@langchain/core/tools';
import { z } from 'zod';

import type { ComponentDefinition } from '@casys/core';
import type { AITextModelPort, ComponentGeneratorAgentPort } from '@casys/application';

import { createLogger, type Logger } from '../../../../utils/logger';

/**
 * Schéma de validation pour l'entrée du ComponentGeneratorAgent
 */
const ComponentGeneratorInputSchema = z.object({
  comment: z.string().min(1, 'Le commentaire ne peut pas être vide'),
  component: z
    .object({
      name: z.string(),
      description: z.string(),
      category: z.string(),
      subcategory: z.string(),
      props: z.record(z.any()),
    })
    .passthrough(), // Permet les champs supplémentaires
});

export type ComponentGeneratorInput = z.infer<typeof ComponentGeneratorInputSchema>;

/**
 * Schéma de validation pour la réponse IA du ComponentGeneratorAgent
 */
const ComponentPropsGenerationResultSchema = z.object({
  props: z.record(z.unknown()),
  reasoning: z.string().min(1, 'Le raisonnement est requis'),
  confidence: z.number().min(0).max(1),
});

export type ComponentPropsGenerationResult = z.infer<typeof ComponentPropsGenerationResultSchema>;

/**
 * Agent LangChain pour générer des props intelligentes de composants
 * Hérite de Tool pour être utilisé dans les chaînes LangChain
 */
export class ComponentGeneratorAgent extends Tool implements ComponentGeneratorAgentPort {
  name = 'component_props_generator';
  description =
    'Generates intelligent props for a component based on a user comment. Input should be a JSON object with "comment" and "component" keys.';

  private readonly logger: Logger;

  constructor(
    private readonly aiTextModel: AITextModelPort,
    logger?: Logger
  ) {
    super();
    this.logger = logger ?? createLogger('ComponentGeneratorAgent');
  }

  /**
   * Méthode requise par Tool - point d'entrée principal
   * @param input Chaîne JSON d'entrée
   * @returns Résultat de génération de props sous forme de chaîne JSON
   */
  async _call(input: string): Promise<string> {
    try {
      this.logger.log('=== Génération Props Composant ===');

      const parsedInput = this.validateAndParseInput(input);
      const result = await this.generateProps(parsedInput.comment, parsedInput.component);

      return JSON.stringify(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      this.logger.error(`Erreur dans ComponentGeneratorAgent: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Génère les props optimales pour un composant basé sur un commentaire
   * @param comment Commentaire utilisateur
   * @param component Composant sélectionné
   * @returns Props générées avec reasoning
   */
  async generateProps(
    comment: string,
    component: unknown
  ): Promise<ComponentPropsGenerationResult> {
    try {
      const comp = ((): ComponentDefinition => {
        if (
          component &&
          typeof component === 'object' &&
          'name' in component &&
          'description' in component &&
          'category' in component &&
          'subcategory' in component &&
          'props' in component
        ) {
          return component as ComponentDefinition;
        }
        throw new Error('Composant invalide: propriétés minimales manquantes');
      })();

      this.logger.log(`Génération de props pour composant ${comp.name}`);

      const prompt = this.buildPrompt(comment, comp);
      const rawResponse = await this.aiTextModel.generateText(prompt);

      // Parsing et validation avec Zod
      const parsed: unknown = JSON.parse(rawResponse);
      const result = ComponentPropsGenerationResultSchema.safeParse(parsed);

      if (result.success) {
        this.logger.log(`Props générées avec succès (confiance: ${result.data.confidence})`);
        return result.data;
      } else {
        const errorMessages = result.error.errors.map(
          err => `${err.path.join('.')}: ${err.message}`
        );
        const errorMsg = `Validation de la réponse IA échouée: ${errorMessages.join(', ')}`;
        this.logger.error(errorMsg, { errors: result.error.errors });
        throw new Error(errorMsg);
      }
    } catch (error) {
      this.logger.error('Erreur lors de la génération de props:', error);
      throw error;
    }
  }

  /**
   * Construit le prompt pour la génération de props
   * @param comment Commentaire utilisateur
   * @param component Composant sélectionné
   * @returns Prompt formaté
   */
  private buildPrompt(comment: string, component: ComponentDefinition): string {
    return `Tu es un expert en génération de props pour des composants React/Astro.

CONTEXTE:
- Commentaire utilisateur: "${comment}"
- Composant sélectionné: ${component.name}
- Description: ${component.description}
- Catégorie: ${component.category} / ${component.subcategory}
- Props existantes du composant: ${JSON.stringify(component.props, null, 2)}

TÂCHE:
Génère les props optimales pour ce composant basé sur le commentaire utilisateur.
Utilise les props existantes comme référence pour la structure et les types.

RÈGLES:
1. Respecte la structure des props existantes
2. Génère des valeurs réalistes et cohérentes
3. Pour les données (data), crée des exemples pertinents
4. Pour les textes, utilise le contenu du commentaire comme inspiration
5. Assure-toi que les props sont valides JSON

RÉPONSE (JSON uniquement):
{
  "props": {
    // Props générées ici
  },
  "reasoning": "Explication de tes choix de génération",
  "confidence": 0.85
}

IMPORTANT : Réponds UNIQUEMENT avec le JSON structuré demandé, sans préambule ni texte supplémentaire.`;
  }

  /**
   * Valide et parse l'entrée du ComponentGeneratorAgent
   * @param input Chaîne JSON d'entrée
   * @returns L'entrée validée et typée
   */
  private validateAndParseInput(input: string): ComponentGeneratorInput {
    try {
      this.logger.log('ComponentGeneratorAgent raw input:', input);

      // Parser le JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(input);
      } catch (_parseError) {
        throw new Error('Format JSON invalide');
      }

      // Valider avec le schéma Zod
      const result = ComponentGeneratorInputSchema.safeParse(parsed);

      if (!result.success) {
        const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        throw new Error(`Données d'entrée invalides: ${errors}`);
      }

      return result.data;
    } catch (error) {
      this.logger.error("Erreur lors de la validation de l'entree:", error);
      throw error;
    }
  }
}

/**
 * Factory function pour créer un ComponentGeneratorAgent tool
 * @param aiTextModel Le modèle IA à utiliser
 * @returns Instance de ComponentGeneratorAgent
 */
export function createComponentGeneratorTool(
  aiTextModel: AITextModelPort
): ComponentGeneratorAgent {
  return new ComponentGeneratorAgent(aiTextModel);
}
