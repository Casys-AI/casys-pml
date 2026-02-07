import type { CandidateAngle } from '@casys/core';

import type {
  AngleSelectionState,
  AngleSelectionNodeDeps,
} from '../angle-selection.types';

/**
 * Node 2: Validation anti-doublons avec LLM Judge batch
 *
 * Responsabilités:
 * - Pour chaque angle candidat, vérifier s'il n'existe pas déjà un brief similaire
 * - Utiliser LLM Judge pour détecter les VRAIS doublons (même sujet + même format + même perspective)
 * - Retourner les angles validés et les angles rejetés avec raisons
 */
export async function validateAnglesNode(
  state: AngleSelectionState,
  deps: Pick<AngleSelectionNodeDeps, 'aiModel' | 'logger'>
): Promise<Partial<AngleSelectionState>> {
  const { aiModel, logger } = deps;

  if (!state.candidateAngles || state.candidateAngles.length === 0) {
    throw new Error('[AngleSelectionWorkflow] validateAnglesNode: aucun angle candidat à valider');
  }

  logger.log('[AngleSelection] 🔍 Validation anti-doublons (LLM Judge batch)', {
    candidatesCount: state.candidateAngles.length,
    existingBriefsCount: state.existingBriefs.length,
  });

  // Si aucun brief existant, tous les angles sont valides
  if (state.existingBriefs.length === 0) {
    logger.log('[AngleSelection] ✅ Aucun brief existant, tous les angles acceptés');
    return {
      validatedAngles: state.candidateAngles,
      rejectedAngles: [],
      status: 'selecting',
    };
  }

  // Validation batch: vérifier tous les candidats contre tous les briefs existants
  const validatedAngles: CandidateAngle[] = [];
  const rejectedAngles: Array<{ angle: string; reason: string; conflictingBriefId?: string }> =
    [];

  for (const candidate of state.candidateAngles) {
    // LLM Judge: est-ce un doublon d'un brief existant ?
    const duplicateResult = await checkDuplicateWithLLM(
      candidate,
      state.existingBriefs,
      aiModel
    );

    if (duplicateResult.isDuplicate) {
      logger.log('[AngleSelection] ⚠️  Angle rejeté (doublon détecté)', {
        angle: candidate.angle,
        conflictingBriefId: duplicateResult.conflictingBriefId,
        reason: duplicateResult.reason,
      });

      rejectedAngles.push({
        angle: candidate.angle,
        reason: duplicateResult.reason,
        conflictingBriefId: duplicateResult.conflictingBriefId,
      });
    } else {
      logger.log('[AngleSelection] ✅ Angle accepté', {
        angle: candidate.angle,
      });

      validatedAngles.push(candidate);
    }
  }

  logger.log('[AngleSelection] Validation terminée', {
    validated: validatedAngles.length,
    rejected: rejectedAngles.length,
  });

  return {
    validatedAngles,
    rejectedAngles,
    status: 'selecting',
  };
}

/**
 * LLM Judge pour détecter un vrai doublon
 * Retourne { isDuplicate: true/false, reason, conflictingBriefId? }
 */
async function checkDuplicateWithLLM(
  candidate: CandidateAngle,
  existingBriefs: import('@casys/core').EditorialBrief[],
  aiModel: { generateText(prompt: string): Promise<string> }
): Promise<{ isDuplicate: boolean; reason: string; conflictingBriefId?: string }> {
  // Liste des briefs existants (numérotés)
  // EditorialBrief.angle est un ValueObject, donc on accède via .value
  const briefsList = existingBriefs.map((b, i) => `${i + 1}. "${b.angle.value}" (ID: ${b.id})`).join('\n');

  const prompt = `Tu es un expert éditorial. Détermine si le NOUVEL ANGLE est un DOUBLON d'un angle existant.

NOUVEL ANGLE:
"${candidate.angle}"
Format: ${candidate.contentType}

ANGLES EXISTANTS:
${briefsList}

CRITÈRES DE DOUBLON (les 3 conditions DOIVENT être vraies):
1. Même SUJET/THÈME général
2. Même FORMAT/TYPE (guide vs guide, checklist vs checklist, top N vs top N)
3. Même PERSPECTIVE (technique vs technique, business vs business, pratique vs stratégique)

CONTRE-EXEMPLES (PAS des doublons - angles VALIDES):
- "Guide conformité BTP 2025" vs "Checklist conformité BTP 2025" → formats différents ✓
- "Guide technique rénovation" vs "Guide business rénovation" → perspectives différentes ✓
- "Top 5 erreurs SEO" vs "Top 10 erreurs SEO" → nombres/portées différents ✓
- "Mettez en conformité vos chantiers" vs "Approche pratique conformité" → tons différents ✓

Réponds UNIQUEMENT par "oui" ou "non", suivi d'un espace et du numéro du brief en conflit (si oui).

Exemples de réponses valides:
- "non" (aucun doublon)
- "oui 2" (doublon du brief #2)
- "oui 1" (doublon du brief #1)

Réponse:`;

  try {
    const response = await aiModel.generateText(prompt);
    const trimmed = response.trim().toLowerCase();

    // Parse la réponse
    if (trimmed.startsWith('oui')) {
      // Extraire le numéro du brief en conflit
      const match = trimmed.match(/oui\s+(\d+)/);
      const briefIndex = match ? parseInt(match[1]) - 1 : 0;
      const conflictingBrief = existingBriefs[briefIndex];

      return {
        isDuplicate: true,
        reason: `Doublon détecté avec "${conflictingBrief?.angle.value ?? 'brief existant'}" (même sujet + même format + même perspective)`,
        conflictingBriefId: conflictingBrief?.id,
      };
    } else {
      return {
        isDuplicate: false,
        reason: 'Angle différencié (format, perspective ou sujet différent)',
      };
    }
  } catch (error) {
    // En cas d'erreur LLM, fallback conservative: accepter l'angle
    // (mieux vaut un faux positif qu'un faux négatif)
    return {
      isDuplicate: false,
      reason: 'Validation LLM échouée, accepté par défaut',
    };
  }
}
