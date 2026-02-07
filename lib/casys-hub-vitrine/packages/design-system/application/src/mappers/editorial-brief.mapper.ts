import type {
  EditorialBriefAgentParams,
} from '../ports/out/editorial-brief.agent.port';
import type {
  EditorialBriefPromptDTO,
  EditorialBriefTopicDTO,
  EditorialBriefArticleDTO,
} from '@casys/shared';
import { toSeoBriefDataDTO, mapTopicClusterToDTO } from './seo-brief-data.mapper';

/**
 * Mapper les paramètres de l'agent vers le DTO de prompt POML
 * Pattern: passer les objets structurés, le flattening se fait dans le builder POML
 */
export function mapParamsToEditorialBriefPromptDTO(
  params: EditorialBriefAgentParams
): EditorialBriefPromptDTO {
  const {
    angle,
    chosenCluster,
    contentType,
    targetPersona,
    selectionMode,
    seoBriefData,
    businessContext,
    selectedTopics,
    sourceArticles,
    language,
  } = params;

  // Cluster: utilise le mapper existant TopicCluster → TopicClusterDTO
  const clusterDTO = mapTopicClusterToDTO(chosenCluster);

  // Topics structurés (pour JSON stringify)
  // Filter out topics without sourceUrl as they're required for the template
  const topicsDTO: EditorialBriefTopicDTO[] = selectedTopics
    .filter(t => !!t.sourceUrl)
    .map(t => ({
      title: t.title,
      sourceUrl: t.sourceUrl!,
    }));

  // Articles structurés (pour JSON stringify)
  const articlesDTO: EditorialBriefArticleDTO[] = sourceArticles.map(a => ({
    title: a.title,
    summary: a.summary,
    url: a.sourceUrl, // SourceArticleInput uses 'sourceUrl', not 'url'
  }));

  // Convert SeoBriefDataV3 → SeoBriefDataDTO
  const seoBriefDTO = toSeoBriefDataDTO(seoBriefData);

  return {
    angle,
    contentType,
    selectionMode,
    targetPersona,
    businessContext,
    chosenCluster: clusterDTO,
    seoBriefData: seoBriefDTO,
    selectedTopicsJson: JSON.stringify(topicsDTO),
    sourceArticlesJson: JSON.stringify(articlesDTO),
    language,
  };
}
