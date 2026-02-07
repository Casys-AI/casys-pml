import type {
  AngleSelectionState,
  AngleSelectionNodeDeps,
} from '../angle-selection.types';

/**
 * Node 3: Sélection du premier angle valide
 *
 * Responsabilités:
 * - Prendre le premier angle parmi les validatedAngles
 * - Extraire ses propriétés (angle, cluster, contentType, persona, selectionMode)
 * - Marquer le workflow comme completed si succès, failed si aucun angle valide
 */
export async function selectAngleNode(
  state: AngleSelectionState,
  deps: Pick<AngleSelectionNodeDeps, 'logger'>
): Promise<Partial<AngleSelectionState>> {
  const { logger } = deps;

  if (!state.validatedAngles || state.validatedAngles.length === 0) {
    logger.error('[AngleSelection] ❌ Aucun angle valide après validation', {
      candidatesCount: state.candidateAngles?.length ?? 0,
      rejectedCount: state.rejectedAngles?.length ?? 0,
    });

    return {
      status: 'failed',
      failureReason: `Aucun angle valide trouvé après ${state.attempts + 1} tentative(s). Tous les angles générés sont des doublons d'angles existants.`,
    };
  }

  // Sélectionner le premier angle valide
  const selected = state.validatedAngles[0];

  logger.log('[AngleSelection] 🎯 Angle sélectionné', {
    angle: selected.angle,
    contentType: selected.contentType,
    pillarTag: selected.cluster.pillarTag.label,
    satellitesCount: selected.cluster.satelliteTags.length,
    targetPersona: selected.targetPersona?.archetype,
    selectionMode: selected.selectionMode,
  });

  return {
    selectedAngle: selected.angle,
    chosenCluster: selected.cluster,
    contentType: selected.contentType,
    targetPersona: selected.targetPersona,
    selectionMode: selected.selectionMode,
    status: 'completed',
  };
}
