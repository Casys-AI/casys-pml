import type { ProjectConfig } from '@casys/shared';
import type {
  AngleSelectionCommand,
  AngleSelectionResult,
  EditorialBrief,
  SeoBriefDataV3,
  TopicCandidate,
} from '@casys/core';

import type {
  AngleSelectionWorkflowPort,
  EditorialBriefStorePort,
  UserProjectConfigPort,
} from '../../ports/out';
import { applicationLogger as logger } from '../../utils/logger';

/**
 * Use Case pour générer un angle éditorial stratégique
 *
 * Responsabilité:
 * - Charger le contexte projet (ProjectConfig)
 * - Récupérer les briefs existants (anti-doublons)
 * - Construire BusinessContext V3
 * - Appeler AngleSelectionWorkflow
 *
 * Retourne: {selectedAngle, chosenCluster, contentType, selectionMode, targetPersona}
 */
export class GenerateAngleUseCase {
  constructor(
    private readonly configReader: UserProjectConfigPort,
    private readonly angleSelectionWorkflow: AngleSelectionWorkflowPort,
    private readonly briefStore?: EditorialBriefStorePort
  ) {}

  async execute(input: {
    tenantId: string;
    projectId: string;
    language: string;
    articles: TopicCandidate[];
    seoBriefData: SeoBriefDataV3;
    seoBriefId?: string;
  }): Promise<AngleSelectionResult> {
    const { tenantId, projectId, language, articles, seoBriefData, seoBriefId } = input;

    const startTime = Date.now();
    logger.log('[GenerateAngleUseCase] Démarrage', {
      tenantId,
      projectId,
      articlesCount: articles.length,
      hasSeoBriefId: !!seoBriefId,
      seoBriefId: seoBriefId ?? 'none',
      keywordTagsCount: seoBriefData.keywordTags?.length ?? 0,
    });

    // Fail-fast validations
    if (!tenantId?.trim() || !projectId?.trim()) {
      throw new Error('[GenerateAngleUseCase] tenantId et projectId requis');
    }
    if (!language?.trim()) {
      throw new Error('[GenerateAngleUseCase] language requis');
    }
    if (!Array.isArray(articles) || articles.length === 0) {
      throw new Error('[GenerateAngleUseCase] articles requis (min 1)');
    }
    if (!seoBriefData) {
      throw new Error('[GenerateAngleUseCase] seoBriefData requis');
    }

    // Charger ProjectConfig pour BusinessContext + template
    const projectConfig: ProjectConfig = await this.configReader.getProjectConfig(
      tenantId,
      projectId
    );

    if (!projectConfig.language?.trim()) {
      throw new Error('[GenerateAngleUseCase] project.language requis dans ProjectConfig');
    }

    // Template requis
    const angleTemplatePathRaw = projectConfig?.generation?.angleSelector?.template;
    if (!angleTemplatePathRaw || angleTemplatePathRaw.trim().length === 0) {
      throw new Error(
        '[GenerateAngleUseCase] generation.angleSelector.template requis dans la config projet'
      );
    }
    const angleTemplatePath = angleTemplatePathRaw;

    // ✨ V3.1: Récupérer TOUS les EditorialBriefs du projet (version dégradée)
    // Le mapper extrait {id, angle, createdAt} pour le prompt POML
    // TODO V4: Filtrer par TopicCluster une fois que briefs d'existing articles sont liés aux clusters
    let existingBriefs: EditorialBrief[] = [];
    if (this.briefStore) {
      try {
        logger.debug('[GenerateAngleUseCase] Chargement briefs du projet (anti-doublons)', {
          projectId,
        });

        existingBriefs = await this.briefStore.getAllEditorialBriefs({
          tenantId,
          projectId,
          limit: 20, // Augmenté pour mieux détecter doublons (checklists, guides, etc.)
        });

        logger.debug('[GenerateAngleUseCase] Briefs trouvés dans le projet', {
          count: existingBriefs.length,
        });

        if (existingBriefs.length > 0) {
          logger.log('[GenerateAngleUseCase] 📋 Briefs existants chargés', {
            count: existingBriefs.length,
            angles: existingBriefs.map(b => ({
              id: b.id,
              angle: b.angle.value.substring(0, 80), // EditorialAngle ValueObject
              createdAt: b.createdAt,
            })),
          });
        } else {
          logger.log('[GenerateAngleUseCase] ℹ️ Aucun brief existant dans le projet');
        }
      } catch (error) {
        logger.warn(
          '[GenerateAngleUseCase] Erreur chargement briefs, continué sans',
          error
        );
      }
    } else {
      logger.debug('[GenerateAngleUseCase] briefStore absent, skip existingBriefs');
    }

    // Construire BusinessContext V3 (priorité: ProjectConfig, fallback: seoAnalysis)
    const angleCommand: AngleSelectionCommand = {
      tenantId,
      projectId,
      language,
      articles,
      seoBriefData,
      businessContext: projectConfig.businessContext
        ? {
            // Utiliser businessContext depuis ProjectConfig (recommandé)
            industry: projectConfig.businessContext.industry,
            siteType: projectConfig.businessContext.siteType,
            targetAudience: projectConfig.businessContext.targetAudience,
            businessDescription: projectConfig.businessContext.businessDescription,
            contentType: projectConfig.businessContext.contentType,
            personas: projectConfig.businessContext.personas,
          }
        : {
            // Fallback: extraire depuis seoAnalysis (rétro-compatibilité)
            industry: projectConfig.generation.seoAnalysis?.industry || '',
            targetAudience: projectConfig.generation.seoAnalysis?.targetAudience || '',
            businessDescription: projectConfig.generation.seoAnalysis?.businessDescription,
            personas: [],
          },
      existingBriefs,
    };

    const workflowStart = Date.now();
    logger.debug('[GenerateAngleUseCase] 🔄 Appel AngleSelectionWorkflow', {
      template: angleTemplatePath,
      existingBriefsCount: existingBriefs.length,
      articlesCount: articles.length,
    });

    // Appeler AngleSelectionWorkflow
    const angleResult = await this.angleSelectionWorkflow.execute(angleCommand, {
      templatePath: angleTemplatePath,
    });

    const workflowDuration = Date.now() - workflowStart;
    logger.log('[GenerateAngleUseCase] ⏱️ AngleSelectionWorkflow terminé', {
      duration: `${workflowDuration}ms`,
    });

    // Validation anti-doublons (Simple reminder, LLM Judge fait la vraie validation)
    if (existingBriefs.length > 0) {
      const isDuplicate = existingBriefs.some(b =>
        b.angle.value.toLowerCase().includes(angleResult.selectedAngle.toLowerCase()) ||
        angleResult.selectedAngle.toLowerCase().includes(b.angle.value.toLowerCase())
      );

      if (isDuplicate) {
        logger.warn('[GenerateAngleUseCase] ⚠️ Doublon potentiel détecté (reminder)', {
          newAngle: angleResult.selectedAngle,
          similarExisting: existingBriefs
            .filter(b =>
              b.angle.value.toLowerCase().includes(angleResult.selectedAngle.toLowerCase()) ||
              angleResult.selectedAngle.toLowerCase().includes(b.angle.value.toLowerCase())
            )
            .map(b => b.angle.value),
        });
      }
    }

    logger.log('[GenerateAngleUseCase] ✅ Angle généré', {
      angle: angleResult.selectedAngle,
      chosenClusterPillar: angleResult.chosenCluster?.pillarTag?.label,
      chosenClusterSatellites: angleResult.chosenCluster?.satelliteTags?.length,
      contentType: angleResult.contentType,
      selectionMode: angleResult.selectionMode,
    });

    const totalDuration = Date.now() - startTime;
    logger.log('[GenerateAngleUseCase] ✅ Terminé', {
      duration: `${totalDuration}ms`,
      angle: angleResult.selectedAngle.substring(0, 100),
      cluster: angleResult.chosenCluster?.pillarTag?.label,
      contentType: angleResult.contentType,
    });

    return angleResult;
  }
}
