import type { EmbeddingPort } from '@casys/application';
import type { ArticleComment, TextFragment } from '@casys/core';

import { createLogger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

/**
 * Adapter dédié à la gestion des Comments dans Neo4j.
 * 
 * Responsabilités:
 * - Créer les nœuds Comment avec embeddings contextualisés
 * - Gérer les relations TextFragment -[:HAS_COMMENT]-> Comment
 * - Embedding = comment content + fragment context pour meilleur RAG
 */
export class Neo4jCommentAdapter {
  private readonly logger = createLogger('Neo4jCommentAdapter');

  constructor(
    private readonly conn: Neo4jConnection,
    private readonly embeddingService?: EmbeddingPort
  ) {}

  /**
   * Crée des Comments avec embeddings contextualisés (comment + fragment content).
   * Crée la relation TextFragment -[:HAS_COMMENT]-> Comment.
   */
  async createComments(
    comments: ArticleComment[],
    textFragments: TextFragment[]
  ): Promise<void> {
    // Build fragment map for quick lookup
    const fragmentMap = new Map(textFragments.map(f => [f.id, f]));

    for (const comment of comments) {
      try {
        if (!comment.textFragmentId) {
          this.logger.warn(`Comment ${comment.id} without textFragmentId, skipping`);
          continue;
        }

        // Check if fragment exists
        const fragmentCheck = await this.conn.query<Record<string, unknown>>(
          `MATCH (f:TextFragment { id: $fragmentId }) RETURN count(f) AS count`,
          { fragmentId: comment.textFragmentId },
          'READ'
        );
        if (fragmentCheck.length === 0 || Number(fragmentCheck[0].count) === 0) {
          this.logger.warn(
            `TextFragment ${comment.textFragmentId} not found for comment ${comment.id}, skipping`
          );
          continue;
        }

        // Generate contextualized embedding (comment + fragment content)
        let embedding: number[] | null = null;
        let embeddingText: string | null = null;
        if (this.embeddingService && comment.content) {
          try {
            const fragment = fragmentMap.get(comment.textFragmentId);
            // Contextualized: comment content + fragment content for better RAG
            embeddingText = fragment
              ? `${comment.content}\n\nContext: ${fragment.content}`
              : comment.content;
            embedding = await this.embeddingService.generateEmbedding(embeddingText);
          } catch (e) {
            this.logger.warn(`Failed to generate embedding for comment ${comment.id}: ${e}`);
          }
        }

        // Create comment node + relation
        await this.conn.query(
          `MATCH (f:TextFragment { id: $textFragmentId })
           CREATE (c:Comment {
             id: $id,
             content: $content,
             article_id: $articleId,
             text_fragment_id: $textFragmentId,
             position: $position,
             created_at: $createdAt,
             author_id: $authorId,
             metadata: $metadata,
             embedding: $embedding,
             embedding_text: $embeddingText
           })
           CREATE (f)-[:HAS_COMMENT]->(c)`,
          {
            id: comment.id,
            content: comment.content,
            articleId: comment.articleId,
            textFragmentId: comment.textFragmentId,
            position: comment.position ?? 0,
            createdAt: comment.createdAt ?? new Date().toISOString(),
            authorId: comment.authorId ?? null,
            metadata: comment.metadata ?? {},
            embedding,
            embeddingText,
          },
          'WRITE'
        );
      } catch (error) {
        this.logger.error(`Error creating comment ${comment.id}:`, error);
        // Continue with next comment
      }
    }

    this.logger.log(`Created ${comments.length} comments`);
  }
}
