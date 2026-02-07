import type { CandidateAngle } from '@casys/core';
import { slugifyKeyword } from '@casys/core';
import type { AngleSelectionPromptResult } from '@casys/shared';
import { buildAngleSelectionPoml, mapCommandToAngleSelectionPromptDTO } from '@casys/application';

import type {
  AngleSelectionState,
  AngleSelectionNodeDeps,
} from '../angle-selection.types';

/**
 * Node 1: Génération de 3-5 angles candidats diversifiés
 *
 * Responsabilités:
 * - Appeler le LLM avec le prompt POML angle-selection
 * - Parser la réponse JSON (candidateAngles array)
 * - Mapper les DTOs vers le domain
 * - Retourner les angles candidats dans le state
 */
export async function generateAnglesNode(
  state: AngleSelectionState,
  deps: Pick<AngleSelectionNodeDeps, 'aiModel' | 'templateReader' | 'logger'>
): Promise<Partial<AngleSelectionState>> {
  const { aiModel, templateReader, logger } = deps;

  logger.log('[AngleSelection] 🎨 Génération de 3-5 angles candidats diversifiés', {
    attempt: state.attempts + 1,
    maxAttempts: state.maxAttempts,
  });

  // Mapper la commande domain vers les paramètres POML
  const promptParams = mapCommandToAngleSelectionPromptDTO({
    tenantId: state.tenantId,
    projectId: state.projectId,
    language: state.language,
    articles: state.articles,
    seoBriefData: state.seoBriefData,
    businessContext: state.businessContext,
    existingBriefs: state.existingBriefs,
  });

  logger.debug('[AngleSelection] Prompt params', {
    personasCount: promptParams.personasCount,
    articlesCount: state.articles.length,
    existingBriefsCount: promptParams.existingBriefsCount,
    seoHasPriority: promptParams.seoHasPriority,
    seoHasTopicClusters: promptParams.seoHasTopicClusters,
  });

  // Construire le prompt POML
  const poml = await buildAngleSelectionPoml(
    templateReader as any, // Type cast - templateReader implements PromptTemplatePort
    state.templatePath,
    promptParams
  );

  // Appel LLM
  const raw = await aiModel.generateText(poml);

  // Parse réponse JSON
  const parsed = JSON.parse(raw.trim()) as AngleSelectionPromptResult;

  if (!parsed.candidateAngles || parsed.candidateAngles.length === 0) {
    throw new Error('[AngleSelectionWorkflow] IA a retourné aucun angle candidat');
  }

  logger.log('[AngleSelection] ✅ Angles générés', {
    count: parsed.candidateAngles.length,
    angles: parsed.candidateAngles.map(a => a.angle),
  });

  // Récupérer les topicClusters disponibles depuis seoBriefData
  const topicClusters = state.seoBriefData?.contentStrategy?.topicClusters ?? [];

  if (topicClusters.length === 0) {
    throw new Error('[AngleSelectionWorkflow] Aucun topicCluster disponible dans seoBriefData.contentStrategy.topicClusters');
  }

  // Mapper les DTOs vers domain en matchant le cluster complet
  const candidateAngles: CandidateAngle[] = parsed.candidateAngles.map(dto => {
    // ✨ Matcher par PILLAR ou SATELLITE
    // Note: les données n'ont pas de slug, on slugifie les labels pour matcher
    let matchedCluster: typeof topicClusters[0] | undefined;
    let matchedByPillar = false;

    // 1. Chercher d'abord dans les pillars
    matchedCluster = topicClusters.find(
      c => c.pillarTag?.label && slugifyKeyword(c.pillarTag.label) === dto.chosenClusterPillarSlug
    );

    if (matchedCluster) {
      matchedByPillar = true;
    } else {
      // 2. Chercher dans les satellites
      matchedCluster = topicClusters.find(c =>
        c.satelliteTags?.some(s => s?.label && slugifyKeyword(s.label) === dto.chosenClusterPillarSlug)
      );
    }

    if (!matchedCluster || !matchedCluster.pillarTag) {
      // ✨ Message d'erreur détaillé avec pillars ET satellites
      const availablePillars = topicClusters
        .filter(c => c.pillarTag?.label)
        .map(c => `"${slugifyKeyword(c.pillarTag!.label)}" (pillar: ${c.pillarTag!.label})`)
        .join(', ');

      const availableSatellites = topicClusters
        .flatMap(c =>
          (c.satelliteTags ?? [])
            .filter(s => s?.label)
            .map(s => `"${slugifyKeyword(s!.label)}" (satellite: ${s!.label})`)
        )
        .join(', ');

      throw new Error(
        `[AngleSelectionWorkflow] Slug invalide "${dto.chosenClusterPillarSlug}" pour l'angle "${dto.angle}". ` +
        `Pillars valides: [${availablePillars}]. ` +
        `Satellites valides: [${availableSatellites}]. ` +
        `L'IA a inventé un slug inexistant au lieu de choisir dans la liste fournie.`
      );
    }

    // ✨ Type assertion: on a déjà vérifié que pillarTag existe
    const pillarTag = matchedCluster.pillarTag!;

    // ✨ Déterminer automatiquement le selectionMode
    const actualSelectionMode: 'pillar' | 'satellite' = matchedByPillar ? 'pillar' : 'satellite';

    logger.debug('[AngleSelection] Cluster matché', {
      angle: dto.angle,
      slugFromAI: dto.chosenClusterPillarSlug,
      matchedBy: actualSelectionMode,
      pillarLabel: pillarTag.label,
      pillarSlug: pillarTag.slug,
      searchVolume: pillarTag.searchVolume,
      difficulty: pillarTag.difficulty,
    });

    return {
      angle: dto.angle,
      cluster: {
        ...matchedCluster,
        pillarTag, // Assurer que pillarTag est défini
        satelliteTags: matchedCluster.satelliteTags ?? [], // ✨ Toujours un tableau
      },
      contentType: dto.contentType,
      targetPersona: dto.targetPersona
        ? {
            category: dto.targetPersona.category,
            archetype: dto.targetPersona.archetype,
            emoji: undefined,
            profile: {
              demographics: '',
              psychographics: '',
              techSavviness: dto.targetPersona.profile.techSavviness,
            },
            painPoints: [],
            motivations: [],
            messagingAngle: '',
          }
        : undefined,
      selectionMode: actualSelectionMode, // ✨ Mode détecté automatiquement
      reasoning: dto.reasoning,
    };
  });

  return {
    candidateAngles,
    status: 'validating',
  };
}
