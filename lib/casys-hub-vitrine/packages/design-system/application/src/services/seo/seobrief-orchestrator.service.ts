import type { BusinessContext, SeoBriefDataV3 } from '@casys/core';

import type { SeoBriefStorePort } from '../../ports/out';

export class SeoBriefOrchestrator {
  constructor(private readonly seoBriefStore: SeoBriefStorePort) {}

  async persistProjectBrief(params: {
    tenantId: string;
    projectId: string;
    seoBriefData: SeoBriefDataV3;
  }): Promise<{ seoBriefId: string; created: boolean }> {
    const { tenantId, projectId, seoBriefData } = params;

    // ✅ Idempotence: check if SeoBrief already exists for this project
    const existing = await this.seoBriefStore.getSeoBriefForProject({ tenantId, projectId });

    if (existing) {
      const seoBriefId = `seobrief_${tenantId}_${projectId}`;
      return { seoBriefId, created: false };
    }

    // 🆕 Create only if doesn't exist
    const res = await this.seoBriefStore.saveSeoBriefForProject({
      tenantId,
      projectId,
      seoBriefData,
    });
    return { seoBriefId: res.seoBriefId, created: true };
  }

  /**
   * V3: Lie SeoBrief à BusinessContext enrichi (siteType, personas)
   */
  async linkToBusinessContext(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
    businessContext: BusinessContext;
  }): Promise<void> {
    const { tenantId, projectId, seoBriefId, businessContext } = params;
    await this.seoBriefStore.linkSeoBriefToBusinessContext({
      tenantId,
      projectId,
      seoBriefId,
      businessContext,
    });
  }

  async linkToProject(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
  }): Promise<void> {
    const { tenantId, projectId, seoBriefId } = params;
    await this.seoBriefStore.linkSeoBriefToProject({ tenantId, projectId, seoBriefId });
  }

  async linkToEditorialBrief(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
    briefId: string;
  }): Promise<void> {
    const { tenantId, projectId, seoBriefId, briefId } = params;
    await this.seoBriefStore.linkSeoBriefToEditorialBrief({
      tenantId,
      projectId,
      seoBriefId,
      briefId,
    });
  }
}
