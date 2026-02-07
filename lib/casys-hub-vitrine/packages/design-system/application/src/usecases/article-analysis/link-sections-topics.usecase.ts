import type { TopicRelationsPort } from '../../ports/out';
import type {
  LinkSectionsToTopicsCommand,
  LinkSectionsToTopicsResult,
  LinkSectionsToTopicsPort,
} from '@casys/core';
import { extractDomain } from '../../utils/domain.utils';
import { applicationLogger as logger } from '../../utils/logger';

/**
 * Heuristique: si la section mentionne l'URL complète du Topic
 * ou le domaine, alors on crée (Section)-[:BASED_ON]->(Topic)
 */
export class LinkSectionsToTopicsUseCase implements LinkSectionsToTopicsPort {
  constructor(private readonly relations: TopicRelationsPort) {}

  async execute(cmd: LinkSectionsToTopicsCommand): Promise<LinkSectionsToTopicsResult> {
    const { tenantId, projectId, articleId, sections, topics, dryRun = false } = cmd;

    if (!Array.isArray(sections) || sections.length === 0) return { linksCreated: 0 };
    if (!Array.isArray(topics) || topics.length === 0) return { linksCreated: 0 };

    let count = 0;

    for (const section of sections) {
      const content = (section.content ?? '').toLowerCase();
      if (!content) continue;
      for (const t of topics) {
        const domain = extractDomain(t.sourceUrl ?? '');
        if (!domain) continue;
        if (content.includes(String(t.sourceUrl ?? '').toLowerCase()) || content.includes(domain)) {
          if (!dryRun) {
            await this.relations.linkSectionToTopic({
              tenantId,
              projectId,
              sectionId: section.id,
              topicId: t.id,
              articleId,
            });
          }
          count += 1;
        }
      }
    }

    logger.debug?.('[LinkSectionsToTopicsUseCase] links created', { count });
    return { linksCreated: count };
  }
}
