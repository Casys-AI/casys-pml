import type { SectionGraphContextDTO } from '@casys/shared';
import type { SectionContextPort } from '@casys/application';

import { createLogger } from '../../../../../utils/logger';
import type { Neo4jConnection } from './neo4j-connection';

interface NeighborRaw {
  id?: string;
  title?: string;
  level?: number;
  position?: number;
  summary?: string;
  description?: string;
}

interface Row {
  aTitle?: string;
  aDesc?: string;
  curId?: string;
  curTitle?: string;
  curPos?: number;
  ancestors?: NeighborRaw[];
  siblings?: NeighborRaw[];
  previous?: NeighborRaw | null;
  nextPlanned?: { title?: string; description?: string } | null;
}

export class Neo4jSectionContextAdapter implements SectionContextPort {
  private readonly logger = createLogger('Neo4jSectionContextAdapter');

  constructor(private readonly conn: Neo4jConnection) {}

  async getContext(params: {
    articleId: string;
    sectionId: string;
    tenantId?: string;
    projectId?: string;
    maxAncestors?: number;
  }): Promise<SectionGraphContextDTO> {
    const { articleId, sectionId, tenantId, projectId, maxAncestors = 3 } = params;

    try {
      const rows = await this.conn.query<Row>(
        `MATCH (a:Article { id: $articleId ${tenantId ? ', tenant_id: $tenantId' : ''} ${projectId ? ', project_id: $projectId' : ''} })
         MATCH (cur:Section { id: $sectionId, article_id: $articleId })
         OPTIONAL MATCH (par:Section)-[:HAS_SUBSECTION]->(cur)
         OPTIONAL MATCH path=(anc:Section)-[:HAS_SUBSECTION*1..${maxAncestors}]->(cur)
         WHERE anc.article_id = $articleId
         WITH a, cur, par, collect(DISTINCT anc) AS ancestors
         OPTIONAL MATCH (par)-[:HAS_SUBSECTION]->(sib:Section)
         WHERE sib.article_id = $articleId AND sib.level = cur.level AND sib.position < cur.position
         WITH a, cur, par, ancestors, collect(DISTINCT sib) AS siblings
         OPTIONAL MATCH (prev:Section { article_id: $articleId, position: cur.position - 1 })
         OPTIONAL MATCH (next:Section { article_id: $articleId, position: cur.position + 1 })
         RETURN a.title AS aTitle,
                a.description AS aDesc,
                cur.id AS curId, cur.title AS curTitle, cur.position AS curPos,
                [x IN reverse(ancestors) | { id: x.id, title: x.title, level: x.level, position: x.position, summary: coalesce(x.summary, x.description, '') }] AS ancestors,
                [x IN (CASE WHEN size(siblings) > 2 THEN siblings[-2..] ELSE siblings END) | { id: x.id, title: x.title, position: x.position, summary: coalesce(x.summary, x.description, '') }] AS siblings,
                CASE WHEN prev IS NOT NULL AND (par IS NULL OR prev.id <> par.id)
                     THEN { id: prev.id, title: prev.title, position: prev.position, summary: coalesce(prev.summary, prev.description, '') }
                     ELSE NULL END AS previous,
                CASE WHEN next IS NOT NULL
                     THEN { title: next.title, description: coalesce(next.description, '') }
                     ELSE NULL END AS nextPlanned`,
        { articleId, sectionId, tenantId, projectId },
        'READ'
      );

      if (!rows || rows.length === 0) {
        return {
          article: { title: undefined, summary: undefined, description: undefined },
          current: { id: sectionId, title: '', position: 0 },
          ancestors: [],
          siblings: [],
          previous: null,
          nextPlanned: null,
        };
      }

      const r = rows[0];
      // Normalize siblings to last 2 if more than 2
      const rawSiblings: NeighborRaw[] = Array.isArray(r.siblings) ? r.siblings : [];
      const slicedSiblings = rawSiblings.length > 2 ? rawSiblings.slice(-2) : rawSiblings;

      return {
        article: {
          title: String(r.aTitle ?? ''),
          summary: undefined,
          description: String(r.aDesc ?? ''),
        },
        current: {
          id: String(r.curId ?? ''),
          title: String(r.curTitle ?? ''),
          position: typeof r.curPos === 'number' ? r.curPos : 0,
        },
        ancestors: Array.isArray(r.ancestors)
          ? r.ancestors.map((x: NeighborRaw) => {
              const sum = x?.summary ?? x?.description;
              return {
                id: String(x?.id ?? ''),
                title: String(x?.title ?? ''),
                level: typeof x?.level === 'number' ? x.level : undefined,
                position: typeof x?.position === 'number' ? x.position : 0,
                summary: sum != null ? String(sum) : undefined,
              };
            })
          : [],
        siblings: slicedSiblings.map((x: NeighborRaw) => {
          const sum = x?.summary ?? x?.description;
          return {
            id: String(x?.id ?? ''),
            title: String(x?.title ?? ''),
            position: typeof x?.position === 'number' ? x.position : 0,
            summary: sum != null ? String(sum) : undefined,
          };
        }),
        previous: r.previous
          ? {
              id: String(r.previous?.id ?? ''),
              title: String(r.previous?.title ?? ''),
              position: typeof r.previous?.position === 'number' ? r.previous.position : 0,
              summary:
                (r.previous?.summary ?? r.previous?.description) != null
                  ? String(r.previous?.summary ?? r.previous?.description)
                  : undefined,
            }
          : null,
        nextPlanned: r.nextPlanned
          ? {
              title: String(r.nextPlanned?.title ?? ''),
              description: String(r.nextPlanned?.description ?? ''),
            }
          : null,
      };
    } catch (error) {
      // Log the error without propagating it (follow the pattern from neo4j-topic-repository.adapter)
      this.logger.warn('[SectionContext] Query failed, returning empty context', {
        articleId,
        sectionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return safe default DTO - never return corrupted Cypher code
      return {
        article: { title: undefined, summary: undefined, description: undefined },
        current: { id: sectionId, title: '', position: 0 },
        ancestors: [],
        siblings: [],
        previous: null,
        nextPlanned: null,
      };
    }
  }
}
