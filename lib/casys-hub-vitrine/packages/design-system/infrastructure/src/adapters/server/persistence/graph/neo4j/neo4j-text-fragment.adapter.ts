import type { EmbeddingPort } from '@casys/application';
import type { TextFragment } from '@casys/core';

import { createLogger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

/**
 * Adapter dédié à la gestion des TextFragments dans Neo4j.
 * 
 * Responsabilités:
 * - Créer/mettre à jour les nœuds TextFragment
 * - Générer et stocker les embeddings
 * - Gérer les relations Section -[:HAS_TEXT_FRAGMENT]-> TextFragment
 */
export class Neo4jTextFragmentAdapter {
  private readonly logger = createLogger('Neo4jTextFragmentAdapter');

  constructor(
    private readonly conn: Neo4jConnection,
    private readonly embeddingService?: EmbeddingPort
  ) {}

  /**
   * Crée ou met à jour des TextFragments avec embeddings.
   * Crée la relation Section -[:HAS_TEXT_FRAGMENT]-> TextFragment.
   */
  async createTextFragments(textFragments: TextFragment[]): Promise<void> {
    for (const fragment of textFragments) {
      try {
        // Check if section exists
        const sectionCheck = await this.conn.query<Record<string, unknown>>(
          `MATCH (s:Section { id: $sectionId }) RETURN count(s) AS count`,
          { sectionId: fragment.sectionId },
          'READ'
        );
        if (sectionCheck.length === 0 || Number(sectionCheck[0].count) === 0) {
          this.logger.warn(
            `Section ${fragment.sectionId} not found for fragment ${fragment.id}, skipping`
          );
          continue;
        }

        // Generate embedding if service available
        let embedding: number[] | null = null;
        let embeddingText: string | null = null;
        if (this.embeddingService && fragment.content) {
          try {
            embeddingText = fragment.content;
            embedding = await this.embeddingService.generateEmbedding(embeddingText);
          } catch (e) {
            this.logger.warn(`Failed to generate embedding for fragment ${fragment.id}: ${e}`);
          }
        }

        // Upsert fragment (ON CREATE SET for embedding to respect insert-only)
        await this.conn.query(
          `MATCH (s:Section { id: $sectionId })
           MERGE (f:TextFragment { id: $id })
           ON CREATE SET f.created_at = $now,
                         f.embedding = $embedding,
                         f.embedding_text = $embeddingText
           SET f.content = $content,
               f.section_id = $sectionId,
               f.position = $position,
               f.start_offset = $startOffset,
               f.end_offset = $endOffset,
               f.updated_at = $now
           MERGE (s)-[:HAS_TEXT_FRAGMENT]->(f)`,
          {
            id: fragment.id,
            sectionId: fragment.sectionId,
            content: fragment.content,
            position: fragment.position,
            startOffset: fragment.startOffset ?? null,
            endOffset: fragment.endOffset ?? null,
            embedding,
            embeddingText,
            now: Date.now(),
          },
          'WRITE'
        );
      } catch (error) {
        this.logger.error(`Error creating fragment ${fragment.id}:`, error);
        // Continue with next fragment
      }
    }

    this.logger.log(`Created/updated ${textFragments.length} text fragments`);
  }
}
