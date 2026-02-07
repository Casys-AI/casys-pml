import type { Project, Tenant } from '@casys/core';

/**
 * Port pour la persistance des entités Tenant et Project
 */
export interface TenantProjectStorePort {
  /**
   * Upsert un Tenant (création ou mise à jour)
   */
  upsertTenant(tenant: Tenant): Promise<void>;

  /**
   * Upsert un Project (création ou mise à jour)
   */
  upsertProject(project: Project): Promise<void>;

  /**
   * Lier un Tenant à un Project (relation TENANT_HAS_PROJECT)
   */
  linkTenantToProject(params: { tenantId: string; projectId: string }): Promise<void>;
}
