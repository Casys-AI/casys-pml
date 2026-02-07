import type { ComponentDefinition, ComponentUsage } from '@casys/core';

import {
  type ComponentGeneratorAgentPort,
  type ComponentUsageCreatePort,
  type ComponentVectorSearchReadPort,
  type StructureSearchArticleContextPort,
} from '../ports/out';
import { createLogger } from '../utils/logger';

// Types moved from old ComponentGenerationService
export interface ComponentGenerationResult {
  selectedComponent: Partial<ComponentDefinition>;
  generatedProps: Record<string, unknown>;
  componentUsage: ComponentUsage;
  similarityScore: number;
}

export interface GenerateComponentFromCommentRequest {
  commentContent: string;
  sectionId: string;
  position: number;
  tenantId?: string;
}

export interface GenerateComponentFromCommentResponse {
  success: boolean;
  result?: ComponentGenerationResult & {
    aiReasoning: string;
    confidence: number;
  };
  error?: string;
}

export class GenerateComponentFromCommentUseCase {
  private readonly logger = createLogger('GenerateComponentFromCommentUseCase');

  constructor(
    private readonly vectorSearch: ComponentVectorSearchReadPort,
    private readonly usageCreate: ComponentUsageCreatePort,
    private readonly componentGenerator: ComponentGeneratorAgentPort,
    private readonly articleContext?: StructureSearchArticleContextPort
  ) {}

  /**
   * Génère un composant intelligent à partir d'un commentaire
   * @param request Demande de génération
   * @returns Résultat avec composant et props générés
   */
  async execute(
    request: GenerateComponentFromCommentRequest
  ): Promise<GenerateComponentFromCommentResponse> {
    try {
      this.validateRequest(request);
      this.logger.log(`Génération de composant depuis commentaire: "${request.commentContent}"`);

      // 1. Enrichir le contexte avec la recherche d'articles si disponible
      let enrichedContext = request.commentContent;
      if (this.articleContext) {
        try {
          const contextResult = await this.articleContext.searchContextForComment({
            commentContent: request.commentContent,
            tenantId: request.tenantId,
          });
          if (contextResult.primaryContext.sections.length > 0) {
            const contextTexts = contextResult.primaryContext.sections
              .map(s => s.content)
              .join(' ');
            enrichedContext = `${request.commentContent} Context: ${contextTexts}`;
            this.logger.debug('Contexte enrichi depuis les articles', {
              originalLength: request.commentContent.length,
              enrichedLength: enrichedContext.length,
            });
          }
        } catch (error) {
          this.logger.warn("Impossible d'enrichir le contexte", { error });
        }
      }

      // 2. Rechercher les composants similaires
      const searchResults = await this.vectorSearch.searchComponentsWithContext(enrichedContext);
      if (searchResults.length === 0) {
        return { success: false, error: 'Aucun composant pertinent trouvé pour ce commentaire' };
      }

      // 3. Sélectionner le meilleur composant (premier résultat)
      const bestComponent = searchResults[0];
      this.logger.log(
        `Composant sélectionné: ${bestComponent.metadata.name} (score: ${bestComponent.score})`
      );

      // 4. Génération intelligente des props via IA
      this.logger.log(`Amélioration des props via IA pour ${bestComponent.metadata.name}`);
      const aiPropsResult = await this.componentGenerator.generateProps(
        request.commentContent,
        bestComponent.metadata as Record<string, unknown>
      );

      // 5. Créer l'usage de composant avec les props IA
      const tempTextFragmentId = `${request.sectionId}-generated-fragment-${request.position}`;
      const usageCreationResult = await this.usageCreate.createComponentUsage({
        componentId: bestComponent.id,
        textFragmentId: tempTextFragmentId,
        position: request.position,
        props: {
          ...aiPropsResult.props,
          _generated: true,
          _timestamp: new Date().toISOString(),
          _originalComment: request.commentContent,
          _confidence: aiPropsResult.confidence,
        },
        tenantId: request.tenantId,
      });

      if (!usageCreationResult.success || !usageCreationResult.usage) {
        const baseMsg = "Erreur lors de la création de l'usage";
        const details = usageCreationResult.error ?? 'usage manquant';
        return { success: false, error: `${baseMsg}: ${details}` };
      }

      // 6. Construire le résultat final
      const result: ComponentGenerationResult & { aiReasoning: string; confidence: number } = {
        selectedComponent: bestComponent.metadata,
        generatedProps: aiPropsResult.props,
        componentUsage: usageCreationResult.usage,
        similarityScore: bestComponent.score,
        aiReasoning: aiPropsResult.reasoning,
        confidence: aiPropsResult.confidence,
      };

      this.logger.log(
        `Composant généré avec succès: ${result.selectedComponent.name} (confiance: ${result.confidence})`
      );
      return { success: true, result };
    } catch (error) {
      this.logger.error(
        'Erreur lors de la génération de composant:',
        error instanceof Error ? error.message : String(error)
      );
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }

  // plus de génération inline ici: déléguée à componentGenerator (port out)

  /**
   * Valide la demande de génération
   * @param request Demande à valider
   * @returns true si valide
   */
  private validateRequest(request: GenerateComponentFromCommentRequest): boolean {
    if (!request.commentContent?.trim()) {
      throw new Error('Le contenu du commentaire est requis');
    }

    if (!request.sectionId?.trim()) {
      throw new Error("L'ID de section est requis");
    }

    if (typeof request.position !== 'number' || request.position < 0) {
      throw new Error('La position doit être un nombre positif');
    }

    return true;
  }
}
