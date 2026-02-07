import type { Project, Tenant } from '@casys/core';
import type { TenantProjectStorePort } from '@casys/application';

import { type Neo4jConnection } from './neo4j-connection';

export class Neo4jTenantProjectStoreAdapter implements TenantProjectStorePort {
  constructor(private readonly conn: Neo4jConnection) {}

  async upsertTenant(tenant: Tenant): Promise<void> {
    const cypher = `
      MERGE (t:Tenant { id: $id })
      ON CREATE SET t.created_at = timestamp()
      SET t.name = COALESCE($name, t.name),
          t.updated_at = timestamp()
    `;
    await this.conn.query(cypher, { id: tenant.id, name: tenant.name ?? tenant.id }, 'WRITE');
  }

  async upsertProject(project: Project): Promise<void> {
    const cypher = `
      MERGE (p:Project { id: $id })
      ON CREATE SET p.created_at = timestamp()
      SET p.name = COALESCE($name, p.name),
          p.tenant_id = COALESCE(p.tenant_id, $tenantId),
          p.updated_at = timestamp()
    `;
    await this.conn.query(
      cypher,
      { id: project.id, name: project.name ?? project.id, tenantId: project.tenantId },
      'WRITE'
    );
  }

  async linkTenantToProject(params: { tenantId: string; projectId: string }): Promise<void> {
    const cypher = `
      MATCH (t:Tenant { id: $tenantId })
      MATCH (p:Project { id: $projectId })
      MERGE (t)-[:TENANT_HAS_PROJECT]->(p)
    `;
    await this.conn.query(cypher, params, 'WRITE');
  }
}
