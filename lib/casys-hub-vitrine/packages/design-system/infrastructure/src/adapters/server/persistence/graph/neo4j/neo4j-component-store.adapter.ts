import {
  type ComponentDefinition,
  type ComponentListingGlobal,
  type ComponentListingTenant,
  type ComponentListingProject,
  type ComponentListingArticle,
} from '@casys/core';
import {
  type ComponentVectorStorePort,
  type ComponentListingReadPort,
} from '@casys/application';

import { createLogger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

export class Neo4jComponentStoreAdapter implements ComponentVectorStorePort, ComponentListingReadPort {
  private readonly logger = createLogger('Neo4jComponentStoreAdapter');

  constructor(private readonly conn: Neo4jConnection) {}

  async indexComponent(
    componentId: string,
    embedding: number[],
    metadata: Partial<ComponentDefinition>
  ): Promise<void> {
    const now = Date.now();
    const embeddingText = `${metadata.name ?? componentId}\n\n${metadata.description ?? ''}`;

    await this.conn.query(
      `MERGE (c:Component { id: $id })
       ON CREATE SET c.created_at = $now
       SET c.name = $name,
           c.path = $path,
           c.description = $description,
           c.category = $category,
           c.tags = $tags,
           c.props_json = $propsJson,
           c.embedding = $embedding,
           c.embedding_text = $embeddingText,
           c.updated_at = $now`,
      {
        id: componentId,
        name: metadata.name ?? componentId,
        path: metadata.path ?? null,
        description: metadata.description ?? '',
        category: metadata.category ?? null,
        tags: metadata.tags ?? [],
        propsJson: metadata.props ? JSON.stringify(metadata.props) : null,
        embedding,
        embeddingText,
        now,
      },
      'WRITE'
    );
    this.logger.debug(`Indexed component: ${componentId}`);
  }

  async getComponentById(componentId: string): Promise<ComponentDefinition | null> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (c:Component { id: $id })
       RETURN c.id AS id,
              c.name AS name,
              c.path AS path,
              c.description AS description,
              c.category AS category,
              c.tags AS tags,
              c.props_json AS propsJson
       LIMIT 1`,
      { id: componentId },
      'READ'
    );

    if (rows.length === 0) return null;

    const r = rows[0];
    let props = undefined;
    try {
      props = r.propsJson ? JSON.parse(String(r.propsJson)) : undefined;
    } catch {
      props = undefined;
    }

    return {
      id: String(r.id),
      name: String(r.name ?? r.id),
      path: (r.path as string) ?? undefined,
      description: (r.description as string) ?? undefined,
      category: (r.category as string) ?? undefined,
      tags: (r.tags as string[]) ?? [],
      props,
    };
  }

  async getAllComponents(limit = 100): Promise<ComponentListingGlobal> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (c:Component)
       RETURN c.id AS id,
              c.name AS name,
              c.path AS path,
              c.description AS description,
              c.category AS category,
              c.tags AS tags,
              c.props_json AS propsJson`,
      {},
      'READ'
    );

    const components = rows.slice(0, limit).map(r => {
      let props = undefined;
      try {
        props = r.propsJson ? JSON.parse(String(r.propsJson)) : undefined;
      } catch {
        props = undefined;
      }

      return {
        id: String(r.id),
        name: String(r.name ?? r.id),
        path: (r.path as string) ?? undefined,
        description: (r.description as string) ?? undefined,
        category: (r.category as string) ?? undefined,
        tags: (r.tags as string[]) ?? [],
        props,
      };
    });

    return {
      components,
      total: rows.length,
      scope: 'global',
    };
  }

  async getComponentsByTenant(tenantId: string, limit = 100): Promise<ComponentListingTenant> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (t:Tenant { id: $tenantId })-[:HAS_PROJECT]->(p:Project)-[:HAS_ARTICLE]->(a:Article)
             -[:HAS_SECTION]->(s:Section)-[:USES_COMPONENT]->(c:Component)
       WITH DISTINCT c
       RETURN c.id AS id,
              c.name AS name,
              c.path AS path,
              c.description AS description,
              c.category AS category,
              c.tags AS tags,
              c.props_json AS propsJson`,
      { tenantId },
      'READ'
    );

    const components = rows.slice(0, limit).map(r => ({
      id: String(r.id),
      name: String(r.name ?? r.id),
      path: (r.path as string) ?? undefined,
      description: (r.description as string) ?? undefined,
      category: (r.category as string) ?? undefined,
      tags: (r.tags as string[]) ?? [],
      props: r.propsJson ? JSON.parse(String(r.propsJson)) : undefined,
    }));

    return {
      components,
      total: rows.length,
      scope: 'tenant',
      tenantId,
    };
  }

  async getComponentsByProject(
    tenantId: string,
    projectId: string,
    limit = 100
  ): Promise<ComponentListingProject> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (t:Tenant { id: $tenantId })-[:HAS_PROJECT]->(p:Project { id: $projectId })
             -[:HAS_ARTICLE]->(a:Article)-[:HAS_SECTION]->(s:Section)-[:USES_COMPONENT]->(c:Component)
       WITH DISTINCT c
       RETURN c.id AS id,
              c.name AS name,
              c.path AS path,
              c.description AS description,
              c.category AS category,
              c.tags AS tags,
              c.props_json AS propsJson`,
      { tenantId, projectId },
      'READ'
    );

    const components = rows.slice(0, limit).map(r => ({
      id: String(r.id),
      name: String(r.name ?? r.id),
      path: (r.path as string) ?? undefined,
      description: (r.description as string) ?? undefined,
      category: (r.category as string) ?? undefined,
      tags: (r.tags as string[]) ?? [],
      props: r.propsJson ? JSON.parse(String(r.propsJson)) : undefined,
    }));

    return {
      components,
      total: rows.length,
      scope: 'project',
      tenantId,
      projectId,
    };
  }

  async getComponentsByArticle(
    tenantId: string,
    projectId: string,
    articleId: string,
    limit = 100
  ): Promise<ComponentListingArticle> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (a:Article { id: $articleId })-[:HAS_SECTION]->(s:Section)-[:USES_COMPONENT]->(c:Component)
       WITH DISTINCT c
       RETURN c.id AS id,
              c.name AS name,
              c.path AS path,
              c.description AS description,
              c.category AS category,
              c.tags AS tags,
              c.props_json AS propsJson`,
      { articleId },
      'READ'
    );

    const components = rows.slice(0, limit).map(r => ({
      id: String(r.id),
      name: String(r.name ?? r.id),
      path: (r.path as string) ?? undefined,
      description: (r.description as string) ?? undefined,
      category: (r.category as string) ?? undefined,
      tags: (r.tags as string[]) ?? [],
      props: r.propsJson ? JSON.parse(String(r.propsJson)) : undefined,
    }));

    return {
      components,
      total: rows.length,
      scope: 'article',
      tenantId,
      projectId,
      articleId,
    };
  }

  async getComponent(input: { componentId: string }): Promise<{
    success: boolean;
    component?: ComponentDefinition;
  }> {
    const row = await this.conn.query<Record<string, unknown>>(
      `MATCH (c:Component { id: $id })
       RETURN c.id AS id,
              c.name AS name,
              c.path AS path,
              c.description AS description,
              c.category AS category,
              c.tags AS tags,
              c.props_json AS propsJson
       LIMIT 1`,
      { id: input.componentId },
      'READ'
    );

    if (row.length === 0) {
      return { success: false };
    }

    const r = row[0];
    let props = undefined;
    try {
      props = r.propsJson ? JSON.parse(String(r.propsJson)) : undefined;
    } catch {
      props = undefined;
    }

    return {
      success: true,
      component: {
        id: String(r.id),
        name: String(r.name ?? r.id),
        path: (r.path as string) ?? undefined,
        description: (r.description as string) ?? undefined,
        category: (r.category as string) ?? undefined,
        tags: (r.tags as string[]) ?? [],
        props,
      },
    };
  }
}
