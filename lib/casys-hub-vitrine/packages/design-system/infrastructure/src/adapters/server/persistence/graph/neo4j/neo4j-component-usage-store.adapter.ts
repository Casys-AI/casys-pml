import { type ComponentUsage, type ComponentUsageStorePort } from '@casys/application';

import { createLogger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

export class Neo4jComponentUsageStoreAdapter implements ComponentUsageStorePort {
  private readonly logger = createLogger('Neo4jComponentUsageStoreAdapter');

  constructor(private readonly conn: Neo4jConnection) {}

  async createComponentUsages(componentUsages: ComponentUsage[], tenantId?: string): Promise<void> {
    if (!componentUsages || componentUsages.length === 0) return;

    const now = Date.now();
    for (const usage of componentUsages) {
      await this.conn.query(
        `MERGE (u:ComponentUsage { id: $id })
         ON CREATE SET u.created_at = $now
         SET u.component_id = $componentId,
             u.text_fragment_id = $textFragmentId,
             u.props_json = $propsJson,
             u.position = $position,
             u.is_section_header = $isSectionHeader,
             u.tenant_id = $tenantId,
             u.updated_at = $now`,
        {
          id: usage.id,
          componentId: usage.componentId,
          textFragmentId: usage.textFragmentId ?? null,
          propsJson: usage.props ? JSON.stringify(usage.props) : null,
          position: usage.position ?? 0,
          isSectionHeader: usage.isSectionHeader ?? false,
          tenantId: tenantId ?? null,
          now,
        },
        'WRITE'
      );

      // Link to Component
      await this.conn.query(
        `MATCH (u:ComponentUsage { id: $usageId })
         MATCH (c:Component { id: $componentId })
         MERGE (u)-[:USES_COMPONENT]->(c)`,
        { usageId: usage.id, componentId: usage.componentId },
        'WRITE'
      );

      // Link to TextFragment if present
      if (usage.textFragmentId) {
        await this.conn.query(
          `MATCH (u:ComponentUsage { id: $usageId })
           MATCH (tf:TextFragment { id: $textFragmentId })
           MERGE (u)-[:IN_TEXT_FRAGMENT]->(tf)`,
          { usageId: usage.id, textFragmentId: usage.textFragmentId },
          'WRITE'
        );
      }
    }

    this.logger.debug(`Created ${componentUsages.length} component usages`);
  }

  async getComponentUsageById(usageId: string, tenantId?: string): Promise<ComponentUsage | null> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (u:ComponentUsage { id: $usageId ${tenantId ? ', tenant_id: $tenantId' : ''} })
       RETURN u.id AS id,
              u.component_id AS componentId,
              u.text_fragment_id AS textFragmentId,
              u.props_json AS propsJson,
              u.position AS position,
              u.is_section_header AS isSectionHeader
       LIMIT 1`,
      { usageId, tenantId },
      'READ'
    );

    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async getComponentUsagesBySectionId(sectionId: string, tenantId?: string): Promise<ComponentUsage[]> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (s:Section { id: $sectionId })-[:HAS_TEXT_FRAGMENT]->(tf:TextFragment)<-[:IN_TEXT_FRAGMENT]-(u:ComponentUsage)
       WHERE $tenantId IS NULL OR u.tenant_id = $tenantId
       RETURN u.id AS id,
              u.component_id AS componentId,
              u.text_fragment_id AS textFragmentId,
              u.props_json AS propsJson,
              u.position AS position,
              u.is_section_header AS isSectionHeader`,
      { sectionId, tenantId },
      'READ'
    );

    return rows.map(r => this.mapRow(r));
  }

  async getComponentUsagesByArticleId(articleId: string, tenantId?: string): Promise<ComponentUsage[]> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (a:Article { id: $articleId })-[:HAS_SECTION]->(:Section)-[:HAS_TEXT_FRAGMENT]->(tf:TextFragment)<-[:IN_TEXT_FRAGMENT]-(u:ComponentUsage)
       WHERE $tenantId IS NULL OR u.tenant_id = $tenantId
       RETURN DISTINCT u.id AS id,
              u.component_id AS componentId,
              u.text_fragment_id AS textFragmentId,
              u.props_json AS propsJson,
              u.position AS position,
              u.is_section_header AS isSectionHeader`,
      { articleId, tenantId },
      'READ'
    );

    return rows.map(r => this.mapRow(r));
  }

  async getComponentUsagesByComponentId(componentId: string, tenantId?: string): Promise<ComponentUsage[]> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (u:ComponentUsage { component_id: $componentId ${tenantId ? ', tenant_id: $tenantId' : ''} })
       RETURN u.id AS id,
              u.component_id AS componentId,
              u.text_fragment_id AS textFragmentId,
              u.props_json AS propsJson,
              u.position AS position,
              u.is_section_header AS isSectionHeader`,
      { componentId, tenantId },
      'READ'
    );

    return rows.map(r => this.mapRow(r));
  }

  async updateComponentUsage(
    usageId: string,
    updates: Partial<Omit<ComponentUsage, 'id'>>,
    tenantId?: string
  ): Promise<void> {
    const setClauses: string[] = [];
    const params: Record<string, unknown> = { usageId, tenantId, now: Date.now() };

    if (updates.componentId !== undefined) {
      setClauses.push('u.component_id = $componentId');
      params.componentId = updates.componentId;
    }
    if (updates.textFragmentId !== undefined) {
      setClauses.push('u.text_fragment_id = $textFragmentId');
      params.textFragmentId = updates.textFragmentId;
    }
    if (updates.props !== undefined) {
      setClauses.push('u.props_json = $propsJson');
      params.propsJson = JSON.stringify(updates.props);
    }
    if (updates.position !== undefined) {
      setClauses.push('u.position = $position');
      params.position = updates.position;
    }
    if (updates.isSectionHeader !== undefined) {
      setClauses.push('u.is_section_header = $isSectionHeader');
      params.isSectionHeader = updates.isSectionHeader;
    }

    if (setClauses.length === 0) return;
    setClauses.push('u.updated_at = $now');

    await this.conn.query(
      `MATCH (u:ComponentUsage { id: $usageId ${tenantId ? ', tenant_id: $tenantId' : ''} })
       SET ${setClauses.join(', ')}`,
      params,
      'WRITE'
    );
  }

  async updateComponentUsageProps(
    usageId: string,
    props: Record<string, unknown>,
    tenantId?: string
  ): Promise<void> {
    await this.conn.query(
      `MATCH (u:ComponentUsage { id: $usageId ${tenantId ? ', tenant_id: $tenantId' : ''} })
       SET u.props_json = $propsJson, u.updated_at = $now`,
      { usageId, tenantId, propsJson: JSON.stringify(props), now: Date.now() },
      'WRITE'
    );
  }

  async deleteComponentUsageById(usageId: string, tenantId?: string): Promise<void> {
    await this.conn.query(
      `MATCH (u:ComponentUsage { id: $usageId ${tenantId ? ', tenant_id: $tenantId' : ''} })
       DETACH DELETE u`,
      { usageId, tenantId },
      'WRITE'
    );
  }

  async deleteComponentUsagesBySectionId(sectionId: string, tenantId?: string): Promise<void> {
    await this.conn.query(
      `MATCH (s:Section { id: $sectionId })-[:HAS_TEXT_FRAGMENT]->(tf:TextFragment)<-[:IN_TEXT_FRAGMENT]-(u:ComponentUsage)
       WHERE $tenantId IS NULL OR u.tenant_id = $tenantId
       DETACH DELETE u`,
      { sectionId, tenantId },
      'WRITE'
    );
  }

  async deleteComponentUsagesByArticleId(articleId: string, tenantId?: string): Promise<void> {
    await this.conn.query(
      `MATCH (a:Article { id: $articleId })-[:HAS_SECTION]->(:Section)-[:HAS_TEXT_FRAGMENT]->(tf:TextFragment)<-[:IN_TEXT_FRAGMENT]-(u:ComponentUsage)
       WHERE $tenantId IS NULL OR u.tenant_id = $tenantId
       DETACH DELETE u`,
      { articleId, tenantId },
      'WRITE'
    );
  }

  async countComponentUsages(componentId: string, tenantId?: string): Promise<number> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (u:ComponentUsage { component_id: $componentId ${tenantId ? ', tenant_id: $tenantId' : ''} })
       RETURN count(u) AS count`,
      { componentId, tenantId },
      'READ'
    );

    return rows.length > 0 ? Number(rows[0].count ?? 0) : 0;
  }

  async clearComponentUsages(tenantId?: string): Promise<void> {
    await this.conn.query(
      `MATCH (u:ComponentUsage ${tenantId ? '{ tenant_id: $tenantId }' : ''})
       DETACH DELETE u`,
      { tenantId },
      'WRITE'
    );
  }

  private mapRow(row: Record<string, unknown>): ComponentUsage {
    let props: Record<string, unknown> | undefined = undefined;
    try {
      const propsJson = row.propsJson;
      props = propsJson ? JSON.parse(String(propsJson)) : undefined;
    } catch {
      props = undefined;
    }

    return {
      id: String(row.id),
      componentId: String(row.componentId),
      textFragmentId: (row.textFragmentId as string) ?? undefined,
      props,
      position: Number(row.position ?? 0),
      isSectionHeader: Boolean(row.isSectionHeader ?? false),
    };
  }
}
