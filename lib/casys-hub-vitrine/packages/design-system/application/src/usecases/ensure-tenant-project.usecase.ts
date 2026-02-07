import { Project, Tenant } from '@casys/core';

import type {
  ProjectSeoSettingsPort,
  TenantProjectStorePort,
  UserProjectConfigPort,
} from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

export interface EnsureTenantProjectCommand {
  tenantId: string;
  projectId: string;
}

/**
 * Use case pour créer/enrichir les nœuds Tenant et Project depuis la config
 * 
 * Responsabilité:
 * - Lire ProjectSeoSettings et UserProjectConfig
 * - Créer les entités Tenant et Project avec métadonnées
 * - Persister via TenantProjectStorePort
 * - Créer la relation TENANT_HAS_PROJECT
 * 
 * Utilisation:
 * - Appeler en début de IndexArticleFromRepoUseCase
 * - Appeler en début de AnalyzeExistingArticleUseCase
 */
export class EnsureTenantProjectUseCase {
  constructor(
    private readonly configReader: UserProjectConfigPort,
    private readonly projectSettings: ProjectSeoSettingsPort,
    private readonly tenantProjectStore: TenantProjectStorePort
  ) {}

  async execute(cmd: EnsureTenantProjectCommand): Promise<void> {
    const { tenantId, projectId } = cmd;

    if (!tenantId?.trim() || !projectId?.trim()) {
      throw new Error('[EnsureTenantProject] tenantId et projectId requis');
    }

    try {
      // Lire configs
      const projectConfig = await this.configReader.getProjectConfig(tenantId, projectId);
      const seoSettings = await this.projectSettings.getSeoProjectSettings(tenantId, projectId);

      // Créer entité Tenant (nom par défaut = tenantId; peut être enrichi plus tard via UserConfig)
      const tenant = Tenant.create({
        id: tenantId,
        name: tenantId,
        createdAt: new Date().toISOString(),
      });

      // Créer entité Project avec métadonnées enrichies depuis ProjectSeoSettings (VO)
      const project = Project.create({
        id: projectId,
        tenantId,
        name: projectConfig.name,
        description: seoSettings.businessDescription,
        language: seoSettings.language,
        siteUrl: seoSettings.siteUrl,
        industry: seoSettings.industry,
        targetAudience: seoSettings.targetAudience,
        contentType: seoSettings.contentType,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Persister
      await this.tenantProjectStore.upsertTenant(tenant);
      await this.tenantProjectStore.upsertProject(project);
      await this.tenantProjectStore.linkTenantToProject({ tenantId, projectId });

      logger.debug?.('[EnsureTenantProject] Tenant/Project enrichis', {
        tenantId,
        projectId,
        tenantName: tenant.name,
        projectName: project.name,
      });
    } catch (e) {
      logger.warn?.('[EnsureTenantProject] Échec partiel (non bloquant)', e);
    }
  }
}
