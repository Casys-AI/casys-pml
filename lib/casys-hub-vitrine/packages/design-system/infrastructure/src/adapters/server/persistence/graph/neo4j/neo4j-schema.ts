import { createLogger } from '../../../../../utils/logger';
import type { Neo4jConnection } from './neo4j-connection';

/**
 * Initializes constraints and basic indexes for our graph model in Neo4j 5.x
 */
export class Neo4jSchema {
  private readonly logger = createLogger('Neo4jSchema');
  constructor(private readonly conn: Neo4jConnection) {}

  async initializeSchema(): Promise<void> {
    // Constraints (IF NOT EXISTS)
    const statements: string[] = [
      // Core ids
      'CREATE CONSTRAINT IF NOT EXISTS FOR (t:Tenant) REQUIRE t.id IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (b:SeoBrief) REQUIRE b.id IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (e:EditorialBrief) REQUIRE e.id IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (k:KeywordPlan) REQUIRE k.id IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (tp:Topic) REQUIRE tp.id IS UNIQUE',
    ];

    for (const cypher of statements) {
      try {
        await this.conn.query(cypher, {}, 'WRITE');
      } catch (e) {
        this.logger.warn(`Schema statement failed (ignored): ${cypher} → ${(e as Error).message}`);
      }
    }

    // Vector indexes (CRITICAL for Graph RAG)
    const criticalVectorIndexes: { name: string; cypher: string }[] = [
      {
        name: 'keyword_plan_embedding_index',
        cypher: "CREATE VECTOR INDEX keyword_plan_embedding_index IF NOT EXISTS FOR (k:KeywordPlan) ON (k.embedding) OPTIONS { indexConfig: { `vector.dimensions`: 1536, `vector.similarity_function`: 'cosine' } }",
      },
      {
        name: 'tag_embedding_index',
        cypher: "CREATE VECTOR INDEX tag_embedding_index IF NOT EXISTS FOR (kt:KeywordTag) ON (kt.embedding) OPTIONS { indexConfig: { `vector.dimensions`: 1536, `vector.similarity_function`: 'cosine' } }",
      },
    ];

    const optionalVectorIndexes: string[] = [
      // Article embedding vector index
      "CREATE VECTOR INDEX article_embedding_index IF NOT EXISTS FOR (a:Article) ON (a.embedding) OPTIONS { indexConfig: { `vector.dimensions`: 1536, `vector.similarity_function`: 'cosine' } }",
      // Section embedding vector index
      "CREATE VECTOR INDEX section_embedding_index IF NOT EXISTS FOR (s:Section) ON (s.embedding) OPTIONS { indexConfig: { `vector.dimensions`: 1536, `vector.similarity_function`: 'cosine' } }",
      // Component embedding vector index (Graph RAG)
      "CREATE VECTOR INDEX component_embedding_index IF NOT EXISTS FOR (c:Component) ON (c.embedding) OPTIONS { indexConfig: { `vector.dimensions`: 1536, `vector.similarity_function`: 'cosine' } }",
      // EditorialBrief embedding vector index
      "CREATE VECTOR INDEX brief_embedding_index IF NOT EXISTS FOR (e:EditorialBrief) ON (e.embedding) OPTIONS { indexConfig: { `vector.dimensions`: 1536, `vector.similarity_function`: 'cosine' } }",
    ];

    // Critical indexes: MUST succeed or fail-fast
    for (const { name, cypher } of criticalVectorIndexes) {
      try {
        await this.conn.query(cypher, {}, 'WRITE');
        this.logger.debug(`✅ Critical vector index created/verified: ${name}`);
      } catch (e) {
        const message = `❌ CRITICAL: Failed to create vector index '${name}'. Neo4j vector plugin may not be enabled or version < 5.11. Error: ${(e as Error).message}`;
        this.logger.error(message);
        throw new Error(message);
      }
    }

    // Optional indexes: best-effort
    for (const v of optionalVectorIndexes) {
      try {
        await this.conn.query(v, {}, 'WRITE');
      } catch (e) {
        this.logger.warn(`Optional vector index failed (ignored): ${v} → ${(e as Error).message}`);
      }
    }

    // Verify critical indexes exist
    try {
      const indexesResult = await this.conn.query<{ name: string; type: string }>(  
        'SHOW INDEXES YIELD name, type WHERE type = "VECTOR" RETURN name, type',
        {},
        'READ'
      );
      const indexNames = indexesResult.map(r => r.name);
      this.logger.log(`Neo4j schema ensured. Vector indexes found: [${indexNames.join(', ')}]`);
      
      // Final verification: critical indexes must exist
      const missingCritical = criticalVectorIndexes
        .filter(idx => !indexNames.includes(idx.name))
        .map(idx => idx.name);
      
      if (missingCritical.length > 0) {
        throw new Error(`❌ CRITICAL: Missing vector indexes after creation: [${missingCritical.join(', ')}]. Check Neo4j logs and vector plugin configuration.`);
      }
    } catch (e) {
      this.logger.error('Failed to verify vector indexes', e);
      throw e;
    }
    
    // Property indexes for frequent filters
    const propIndexes: string[] = [
      "CREATE INDEX IF NOT EXISTS FOR (a:Article) ON (a.tenant_id)",
      "CREATE INDEX IF NOT EXISTS FOR (a:Article) ON (a.project_id)",
      "CREATE INDEX IF NOT EXISTS FOR (kt:KeywordTag) ON (kt.tenant_id)",
      "CREATE INDEX IF NOT EXISTS FOR (kt:KeywordTag) ON (kt.project_id)",
      "CREATE INDEX IF NOT EXISTS FOR (k:KeywordPlan) ON (k.tenant_id)",
      "CREATE INDEX IF NOT EXISTS FOR (k:KeywordPlan) ON (k.project_id)",
      // Composite index to support fast sequential navigation within an article
      // Allows efficient lookup of previous/next sections by (article_id, position)
      "CREATE INDEX IF NOT EXISTS FOR (s:Section) ON (s.article_id, s.position)"
    ];
    for (const p of propIndexes) {
      try {
        await this.conn.query(p, {}, 'WRITE');
      } catch (e) {
        this.logger.warn(`Property index statement failed (ignored): ${p} → ${(e as Error).message}`);
      }
    }

    // Full-text index for Section (title, description, summary)
    // Useful for simple lexical searches without semantic embedding overhead
    const fullTextIndexes: string[] = [
      "CREATE FULLTEXT INDEX section_fulltext_index IF NOT EXISTS FOR (s:Section) ON EACH [s.title, s.description, s.summary]"
    ];
    for (const ft of fullTextIndexes) {
      try {
        await this.conn.query(ft, {}, 'WRITE');
        this.logger.debug('✅ Full-text index created/verified: section_fulltext_index');
      } catch (e) {
        this.logger.warn(`Full-text index statement failed (ignored): ${ft} → ${(e as Error).message}`);
      }
    }
  }
}
