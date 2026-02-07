import type { ProjectConfig } from '@casys/shared';
import type { ArticleStructure } from '@casys/core';

import type { ArticlePublisherPort, PublicationResult, UserProjectConfigPort } from '../ports/out';

/**
 * Service d'orchestration pour la publication d'articles.
 * Décide quelles cibles publier (FS, GitHub) en fonction de la configuration projet.
 */
export class ArticlePublicationService {
  constructor(
    private readonly configReader: UserProjectConfigPort,
    private readonly fsPublisher?: ArticlePublisherPort,
    private readonly githubPublisher?: ArticlePublisherPort
  ) {}

  async publishToConfiguredTargets(
    article: ArticleStructure,
    tenantId: string,
    projectId: string
  ): Promise<PublicationResult[]> {
    if (!tenantId?.trim()) throw new Error('[ArticlePublicationService] tenantId requis');
    if (!projectId?.trim()) throw new Error('[ArticlePublicationService] projectId requis');

    const projectConfig: ProjectConfig = await this.configReader.getProjectConfig(
      tenantId,
      projectId
    );

    const fsCfg = projectConfig.publication?.file_system;
    const ghCfg = projectConfig.publication?.github;

    const wantsFs = !!fsCfg?.enabled;
    const wantsGh = !!ghCfg?.enabled;

    if (!wantsFs && !wantsGh) {
      throw new Error(
        '[ArticlePublicationService] Aucune cible de publication activée dans la configuration'
      );
    }

    const tasks: Promise<PublicationResult>[] = [];

    if (wantsFs) {
      if (!this.fsPublisher) {
        throw new Error(
          '[ArticlePublicationService] FS activé dans la config mais aucun fsPublisher injecté'
        );
      }
      tasks.push(
        this.fsPublisher
          .publishArticle(article, tenantId, projectId)
          .then(
            (r: {
              url: string;
              path: string;
              success: boolean;
              commitSha?: string;
            }): PublicationResult => ({ target: 'file_system' as const, ...r })
          )
      );
    }

    if (wantsGh) {
      if (!this.githubPublisher) {
        throw new Error(
          '[ArticlePublicationService] GitHub activé dans la config mais aucun githubPublisher injecté'
        );
      }
      tasks.push(
        this.githubPublisher
          .publishArticle(article, tenantId, projectId)
          .then(
            (r: {
              url: string;
              path: string;
              success: boolean;
              commitSha?: string;
            }): PublicationResult => ({ target: 'github' as const, ...r })
          )
      );
    }

    const results = await Promise.all(tasks);
    return results;
  }
}
