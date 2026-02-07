import type { ProjectSeoSettings } from '@casys/core';

/**
 * Port applicatif pour exposer un VO de domaine ProjectSettings (SEO uniquement).
 * Permet aux use cases de dépendre d'un contrat domaine, sans DTO @casys/shared.
 */
export interface ProjectSeoSettingsPort {
  getSeoProjectSettings(userId: string, projectId: string): Promise<ProjectSeoSettings>;
}
