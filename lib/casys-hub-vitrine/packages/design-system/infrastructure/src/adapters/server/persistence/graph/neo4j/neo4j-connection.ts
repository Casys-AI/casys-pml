import neo4j, { auth, type Driver, type QueryResult, type Session } from 'neo4j-driver';

import { createLogger } from '../../../../../utils/logger';

export interface Neo4jConnectionOptions {
  uri: string;
  user: string;
  password: string;
  database?: string; // optional, default neo4j
}

/**
 * Singleton wrapper around Neo4j Driver with simple helpers
 */
export class Neo4jConnection {
  private static instance: Neo4jConnection | null = null;
  private readonly logger = createLogger('Neo4jConnection');
  private driver: Driver | null = null;
  private database = 'neo4j';

  private constructor(private readonly options: Neo4jConnectionOptions) {}

  static getInstance(options?: Neo4jConnectionOptions): Neo4jConnection {
    if (!Neo4jConnection.instance) {
      if (!options) throw new Error('Neo4jConnectionOptions required for first initialization');
      Neo4jConnection.instance = new Neo4jConnection(options);
    }
    return Neo4jConnection.instance;
  }

  async initialize(): Promise<void> {
    if (this.driver) {
      this.logger.debug('Neo4jConnection already initialized, skipping...');
      return;
    }
    const { uri, user, password, database } = this.options;
    this.database = database ?? 'neo4j';

    this.logger.log('Connecting to Neo4j', { uri, database: this.database });
    this.driver = neo4j.driver(uri, auth.basic(user, password), {
      // reasonable defaults
      disableLosslessIntegers: true,
    });

    // Verify connectivity early
    await this.driver.verifyAuthentication();
    await this.driver.verifyConnectivity();
    this.logger.log('Connected to Neo4j');
  }

  getSession(mode: 'READ' | 'WRITE' = 'WRITE'): Session {
    if (!this.driver) throw new Error('Neo4j driver not initialized. Call initialize() first.');
    return this.driver.session({
      defaultAccessMode: mode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE,
      database: this.database,
    });
  }

  async query<T = Record<string, unknown>>(
    cypher: string,
    params: Record<string, unknown> = {},
    mode: 'READ' | 'WRITE' = 'WRITE'
  ): Promise<T[]> {
    const session = this.getSession(mode);
    const start = Date.now();
    try {
      const res: QueryResult = await session.run(cypher, params);
      const rows = res.records.map(r => r.toObject() as T);
      const took = Date.now() - start;
      this.logger.debug('Neo4j query ok', {
        tookMs: took,
        cypherPreview: cypher.trim().slice(0, 160),
      });
      return rows;
    } catch (err) {
      const code = (err as any)?.code as string | undefined;
      const message = (err as Error)?.message ?? String(err);
      const isParamMissing =
        code === 'Neo.ClientError.Statement.ParameterMissing' || /ParameterMissing/i.test(message);
      if (isParamMissing) {
        const cypherPreview = cypher.trim().slice(0, 200);
        const keys = Object.keys(params ?? {});
        const p: any = params ?? {};
        const embeddingInfo = {
          hasEmbedding: Object.prototype.hasOwnProperty.call(p, 'embedding'),
          embeddingIsArray: Array.isArray(p?.embedding),
          embeddingLength: Array.isArray(p?.embedding) ? p.embedding.length : null,
          hasQueryEmbedding: Object.prototype.hasOwnProperty.call(p, 'queryEmbedding'),
          queryEmbeddingIsArray: Array.isArray(p?.queryEmbedding),
          queryEmbeddingLength: Array.isArray(p?.queryEmbedding) ? p.queryEmbedding.length : null,
          hasQueryVector: Object.prototype.hasOwnProperty.call(p, 'query_vector'),
          queryVectorIsArray: Array.isArray(p?.query_vector),
          queryVectorLength: Array.isArray(p?.query_vector) ? p.query_vector.length : null,
        };
        this.logger.error('Neo4j ParameterMissing diagnostic', {
          code,
          message,
          cypherPreview,
          paramKeys: keys,
          embeddingInfo,
        });
      }
      throw err;
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    try {
      if (this.driver) {
        await this.driver.close();
        this.driver = null;
      }
      Neo4jConnection.instance = null;
      this.logger.log('Neo4j connection closed');
    } catch (e) {
      this.logger.warn('Error during Neo4j close:', e);
      this.driver = null;
      Neo4jConnection.instance = null;
    }
  }
}
