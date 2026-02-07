import type { ProjectConfig } from '@casys/shared';
import type { ProjectSeoSettingsPort, UserProjectConfigPort } from '@casys/application';
import { ProjectSeoSettings } from '@casys/core';

/**
 * Adaptateur Infrastructure qui compose le lecteur YAML existant (UserProjectConfigPort)
 * pour fournir un VO de domaine ProjectSeoSettings.
 */
export class ProjectSeoSettingsAdapter implements ProjectSeoSettingsPort {
  constructor(private readonly configReader: UserProjectConfigPort) {}

  async getSeoProjectSettings(userId: string, projectId: string): Promise<ProjectSeoSettings> {
    const cfg: ProjectConfig = await this.configReader.getProjectConfig(userId, projectId);

    const seo = cfg?.generation?.seoAnalysis as {
      keywords?: unknown;
      industry?: unknown;
      contentType?: unknown;
      targetAudience?: unknown;
      businessDescription?: unknown;
    } | undefined;

    // On passe des valeurs brutes, la factory ProjectSeoSettings.create() se charge de la sanitation/validation
    return ProjectSeoSettings.create({
      tenantId: userId,
      projectId,
      language: String((cfg as any)?.language ?? '').trim(),
      siteUrl: undefined,
      seoAnalysis: {
        keywords: Array.isArray(seo?.keywords) ? (seo?.keywords as unknown[]).map(String) : undefined,
        industry: typeof seo?.industry === 'string' ? seo?.industry : undefined,
        contentType: typeof seo?.contentType === 'string' ? seo?.contentType : undefined,
        targetAudience: typeof seo?.targetAudience === 'string' ? seo?.targetAudience : undefined,
        businessDescription: typeof seo?.businessDescription === 'string' ? seo?.businessDescription : undefined,
      },
    });
  }
}
