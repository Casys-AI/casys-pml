import {
  type AITextModelPort,
  type AITopicSelectionResponse,
  buildTopicSelectorPoml,
  mapCommandToTopicSelectorPromptDTO,
  mapSelectedTopicsDTOToDomain,
  type PromptTemplatePort,
} from '@casys/application';

import type { Logger } from '../../../../utils/logger';
import type { TopicSelectorState } from './topic-selector.types';

export interface TopicSelectorNodeDeps {
  aiModel: AITextModelPort;
  promptTemplate: PromptTemplatePort;
  logger: Logger;
}

/**
 * Node unique: Filtrage et scoring des topics pour l'angle/cluster FOURNI
 *
 * ⚠️ REFACTORISATION v2:
 * - Reçoit angle et chosenCluster en INPUT (déjà sélectionnés par AngleSelectionWorkflow)
 * - Focus sur le filtrage et scoring des topics pertinents
 * - Ne génère PLUS l'angle ni le seoSummary
 */
export async function filterTopicsNode(
  state: TopicSelectorState,
  deps: TopicSelectorNodeDeps
): Promise<Partial<TopicSelectorState>> {
  const { aiModel, promptTemplate, logger } = deps;

  if (!state.angle) {
    throw new Error('[TopicSelector] filterTopicsNode: angle manquant (doit être fourni en INPUT)');
  }

  if (!state.chosenCluster) {
    throw new Error(
      '[TopicSelector] filterTopicsNode: chosenCluster manquant (doit être fourni en INPUT)'
    );
  }

  logger.log('[TopicSelector] 🎯 Filtrage des topics pour angle/cluster fournis', {
    angle: state.angle,
    chosenClusterPillar: state.chosenCluster?.pillarTag?.label,
    chosenClusterSatellites: state.chosenCluster?.satelliteTags?.length,
    contentType: state.contentType,
    selectionMode: state.selectionMode,
    maxTopics: state.maxTopics,
    articlesCount: state.articles.length,
  });

  // Mapper les données: construire un SelectTopicCommand conforme pour le mapper
  // ✅ V3: Utilise les vraies valeurs depuis le state (passées par le workflow depuis input)
  const promptParams = mapCommandToTopicSelectorPromptDTO(
    {
      tenantId: state.tenantId,
      projectId: state.projectId,
      language: state.language,
      articles: state.articles,
      seoBriefData: state.seoBriefData,
      // ✅ FIX: Inclure angle et chosenCluster dans le command (requis par assertions v3)
      angle: state.angle,
      chosenCluster: state.chosenCluster,
      // ✅ FIX v2: Utiliser les vraies valeurs depuis le state au lieu de valeurs en dur
      tags: state.tags,
      contentType: state.contentType,
      selectionMode: state.selectionMode,
      targetPersona: state.targetPersona,
    },
    {
      maxTopics: state.maxTopics,
    }
  );

  logger.debug('[TopicSelector] Prompt params (v3 fixed)', {
    hasAngle: !!promptParams.angle,
    hasChosenCluster: !!promptParams.chosenCluster,
    contentType: state.contentType,
    selectionMode: state.selectionMode,
    articlesCount: state.articles.length,
    promptParamsArticlesCount: (promptParams as any).articles?.length ?? 0,
  });

  // Construire POML (v3: angle et cluster fournis, focus sur filtrage)
  const poml = await buildTopicSelectorPoml(promptTemplate, state.templatePath, promptParams);

  // ✅ DEBUG: Vérifier que le POML contient les articles
  const articleMentionCount = (poml.match(/article|Article|ARTICLE/gi) || []).length;
  const hasArticleDataSection = poml.includes('"articles"') || poml.includes("'articles'");

  logger.debug('[TopicSelector] POML Structure Analysis', {
    pomlLength: poml.length,
    articleMentionCount,
    hasArticleDataSection,
    pomlFirstKb: poml.substring(0, 1000),
    pomlMiddleKb: poml.substring(Math.max(0, poml.length / 2 - 500), Math.max(0, poml.length / 2 + 500)),
    pomlLastKb: poml.substring(Math.max(0, poml.length - 1000)),
  });

  logger.debug('[TopicSelector] POML rendu avant appel LLM', {
    pomlLength: poml.length,
    pomlPreview: poml.substring(0, 300),
  });

  // Appel IA via generateText
  const raw = await aiModel.generateText(poml);

  // ✅ DEBUG: Analyse détaillée de la réponse brute
  logger.debug('[TopicSelector] Analyse byte-level de la réponse LLM', {
    rawLength: raw.length,
    firstChars: raw.substring(0, 50),
    firstCharCodes: [...raw.substring(0, 20)].map(c => c.charCodeAt(0)),
    lastChars: raw.substring(Math.max(0, raw.length - 50)),
    lastCharCodes: [...raw.substring(Math.max(0, raw.length - 20))].map(c => c.charCodeAt(0)),
    hasLeadingWhitespace: /^\s+/.test(raw),
    hasTrailingWhitespace: /\s+$/.test(raw),
  });

  logger.debug('[TopicSelector] Réponse brute du LLM', {
    rawLength: raw.length,
    rawPreview: raw.substring(0, 500),
    rawFull: raw, // Log the full response for analysis
  });

  // Parse réponse (v3: seulement topics[], pas d'angle/seoSummary)
  let parsed: AITopicSelectionResponse;
  try {
    const trimmedRaw = raw.trim();
    
    logger.debug('[TopicSelector] Avant JSON.parse', {
      trimmedLength: trimmedRaw.length,
      trimmedPreview: trimmedRaw.substring(0, 200),
      trimmedStart: trimmedRaw.charCodeAt(0),
      trimmedEnd: trimmedRaw.charCodeAt(trimmedRaw.length - 1),
    });

    parsed = JSON.parse(trimmedRaw) as AITopicSelectionResponse;

    logger.debug('[TopicSelector] Parsing JSON réussi', {
      parsedKeys: Object.keys(parsed),
      topicsCount: parsed.topics?.length ?? 0,
      topicsPreview: parsed.topics?.slice(0, 2),
    });
  } catch (parseError) {
    const parseMsg = parseError instanceof Error ? parseError.message : String(parseError);
    logger.error('[TopicSelector] Erreur parsing JSON de la réponse IA', {
      errorMessage: parseMsg,
      rawContent: raw.substring(0, 1000),
      rawLength: raw.length,
    });
    throw new Error(`[TopicSelector] Invalid JSON response from LLM: ${parseMsg}`);
  }

  // ✅ ALLOW EMPTY ARRAY: Si aucun topic ne matche l'angle, c'est une réponse valide
  // Le workflow amont peut décider quoi faire (retry, reangle, etc.)
  if (!parsed.topics) {
    logger.warn('[TopicSelector] IA a retourné topics: undefined (setting to [])', {
      parsedObject: parsed,
    });
    parsed.topics = [];
  }

  if (parsed.topics.length === 0) {
    logger.warn('[TopicSelector] ⚠️ Aucun topic ne matche l\'angle fourni', {
      angle: state.angle,
      articlesInState: state.articles.length,
      pomlSizeKb: (poml.length / 1024).toFixed(2),
      reason: 'Articles et angle ne sont pas alignés - c\'est une réponse valide',
    });
  }

  // Limiter à maxTopics
  const limitedTopics = parsed.topics.slice(0, state.maxTopics);
  const topics = mapSelectedTopicsDTOToDomain(limitedTopics);

  logger.log('[TopicSelector] ✅ Filtrage terminé', {
    topicsCount: topics.length,
    angle: state.angle,
  });

  return {
    topics,
    status: 'completed',
  };
}
