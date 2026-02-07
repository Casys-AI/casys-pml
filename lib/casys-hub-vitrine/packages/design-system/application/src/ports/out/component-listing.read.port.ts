import type {
  ComponentDefinition,
  ComponentListingArticle,
  ComponentListingGlobal,
  ComponentListingProject,
  ComponentListingTenant,
} from '@casys/core';

export interface ComponentListingReadPort {
  getAllComponents(limit?: number): Promise<ComponentListingGlobal>;
  getComponentsByTenant(tenantId: string, limit?: number): Promise<ComponentListingTenant>;
  getComponentsByProject(
    tenantId: string,
    projectId: string,
    limit?: number
  ): Promise<ComponentListingProject>;
  getComponentsByArticle(
    tenantId: string,
    projectId: string,
    articleId: string,
    limit?: number
  ): Promise<ComponentListingArticle>;
  getComponent(input: { componentId: string }): Promise<{
    success: boolean;
    component?: ComponentDefinition;
  }>;
}

export type IComponentListingReadPort = ComponentListingReadPort;
