import { createLogger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

/**
 * Adapter dédié à la gestion de la hiérarchie des sections via relations Neo4j.
 *
 * Responsabilités:
 * - Créer/supprimer les relations (Section)-[:HAS_SUBSECTION]->(Section)
 * - Requêtes de traversée de la hiérarchie (enfants, descendants, ancêtres)
 * - Reconstruction de l'arbre complet d'une section
 *
 * Séparé de ArticleStructureAdapter pour:
 * - Réduire la complexité de l'adapter principal
 * - Isoler la logique de hiérarchie
 * - Faciliter les tests et la maintenance
 */
export class Neo4jSectionHierarchyAdapter {
  private readonly logger = createLogger('Neo4jSectionHierarchyAdapter');

  constructor(private readonly conn: Neo4jConnection) {}

  /**
   * Crée ou met à jour la relation de hiérarchie pour une section.
   * Si parentSectionId est fourni, crée (parent)-[:HAS_SUBSECTION]->(section).
   * Supprime les anciennes relations parent si elles existent.
   */
  async linkSectionToParent(params: {
    sectionId: string;
    parentSectionId: string | null;
    articleId: string;
    tenantId?: string;
  }): Promise<void> {
    const { sectionId, parentSectionId, articleId, tenantId } = params;

    if (!parentSectionId) {
      // Pas de parent → supprimer toute relation parent existante
      await this.conn.query(
        `MATCH (parent:Section)-[r:HAS_SUBSECTION]->(s:Section { id: $sectionId })
         WHERE s.article_id = $articleId ${tenantId ? 'AND parent.article_id = $articleId' : ''}
         DELETE r`,
        { sectionId, articleId, tenantId },
        'WRITE'
      );
      this.logger.debug('Parent link removed', { sectionId });
      return;
    }

    // Créer la nouvelle relation parent
    await this.conn.query(
      `MATCH (parent:Section { id: $parentSectionId })
       MATCH (child:Section { id: $sectionId })
       WHERE parent.article_id = $articleId AND child.article_id = $articleId
       ${tenantId ? 'AND parent.article_id = $articleId' : ''}
       // Supprimer l'ancienne relation si elle existe
       OPTIONAL MATCH (oldParent:Section)-[oldRel:HAS_SUBSECTION]->(child)
       DELETE oldRel
       // Créer la nouvelle relation
       MERGE (parent)-[:HAS_SUBSECTION]->(child)`,
      { parentSectionId, sectionId, articleId, tenantId },
      'WRITE'
    );

    this.logger.debug('Section linked to parent', { sectionId, parentSectionId });
  }

  /**
   * Récupère les enfants directs d'une section (niveau 1 seulement).
   */
  async getDirectChildren(params: {
    sectionId: string;
    articleId: string;
    tenantId?: string;
  }): Promise<{ id: string; title: string; level: number; position: number }[]> {
    const { sectionId, articleId, tenantId } = params;

    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (parent:Section { id: $sectionId })-[:HAS_SUBSECTION]->(child:Section)
       WHERE parent.article_id = $articleId AND child.article_id = $articleId
       ${tenantId ? 'AND parent.article_id = $articleId' : ''}
       RETURN child.id AS id,
              child.title AS title,
              child.level AS level,
              child.position AS position
       ORDER BY child.position`,
      { sectionId, articleId, tenantId },
      'READ'
    );

    return rows.map(r => ({
      id: String(r.id ?? ''),
      title: String(r.title ?? ''),
      level: typeof r.level === 'number' ? r.level : 0,
      position: typeof r.position === 'number' ? r.position : 0,
    }));
  }

  /**
   * Récupère tous les descendants d'une section (récursif, tous niveaux).
   */
  async getAllDescendants(params: {
    sectionId: string;
    articleId: string;
    tenantId?: string;
    maxDepth?: number;
  }): Promise<{ id: string; title: string; level: number; position: number; depth: number }[]> {
    const { sectionId, articleId, tenantId, maxDepth = 10 } = params;

    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH path = (root:Section { id: $sectionId })-[:HAS_SUBSECTION*1..${maxDepth}]->(descendant:Section)
       WHERE root.article_id = $articleId AND descendant.article_id = $articleId
       ${tenantId ? 'AND root.article_id = $articleId' : ''}
       WITH descendant, length(path) AS depth
       RETURN descendant.id AS id,
              descendant.title AS title,
              descendant.level AS level,
              descendant.position AS position,
              depth
       ORDER BY descendant.position`,
      { sectionId, articleId, tenantId },
      'READ'
    );

    return rows.map(r => ({
      id: String(r.id ?? ''),
      title: String(r.title ?? ''),
      level: typeof r.level === 'number' ? r.level : 0,
      position: typeof r.position === 'number' ? r.position : 0,
      depth: typeof r.depth === 'number' ? r.depth : 0,
    }));
  }

  /**
   * Récupère tous les ancêtres d'une section (parents, grands-parents, etc.).
   */
  async getAncestors(params: {
    sectionId: string;
    articleId: string;
    tenantId?: string;
  }): Promise<{ id: string; title: string; level: number; position: number; depth: number }[]> {
    const { sectionId, articleId, tenantId } = params;

    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH path = (ancestor:Section)-[:HAS_SUBSECTION*1..]->(child:Section { id: $sectionId })
       WHERE ancestor.article_id = $articleId AND child.article_id = $articleId
       ${tenantId ? 'AND ancestor.article_id = $articleId' : ''}
       WITH ancestor, length(path) AS depth
       RETURN ancestor.id AS id,
              ancestor.title AS title,
              ancestor.level AS level,
              ancestor.position AS position,
              depth
       ORDER BY depth DESC`,
      { sectionId, articleId, tenantId },
      'READ'
    );

    return rows.map(r => ({
      id: String(r.id ?? ''),
      title: String(r.title ?? ''),
      level: typeof r.level === 'number' ? r.level : 0,
      position: typeof r.position === 'number' ? r.position : 0,
      depth: typeof r.depth === 'number' ? r.depth : 0,
    }));
  }

  /**
   * Récupère l'arbre complet d'une section (elle-même + tous ses descendants).
   * Retourne une structure plate avec depth pour reconstruction côté client.
   */
  async getSectionTree(params: {
    sectionId: string;
    articleId: string;
    tenantId?: string;
    maxDepth?: number;
  }): Promise<{ id: string; title: string; level: number; position: number; depth: number }[]> {
    const { sectionId, articleId, tenantId, maxDepth = 10 } = params;

    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH path = (root:Section { id: $sectionId })-[:HAS_SUBSECTION*0..${maxDepth}]->(node:Section)
       WHERE root.article_id = $articleId AND node.article_id = $articleId
       ${tenantId ? 'AND root.article_id = $articleId' : ''}
       WITH node, length(path) AS depth
       RETURN node.id AS id,
              node.title AS title,
              node.level AS level,
              node.position AS position,
              depth
       ORDER BY node.position`,
      { sectionId, articleId, tenantId },
      'READ'
    );

    return rows.map(r => ({
      id: String(r.id ?? ''),
      title: String(r.title ?? ''),
      level: typeof r.level === 'number' ? r.level : 0,
      position: typeof r.position === 'number' ? r.position : 0,
      depth: typeof r.depth === 'number' ? r.depth : 0,
    }));
  }

  /**
   * Récupère toutes les sections racines d'un article (sections sans parent).
   */
  async getRootSections(params: {
    articleId: string;
    tenantId?: string;
  }): Promise<{ id: string; title: string; level: number; position: number }[]> {
    const { articleId, tenantId } = params;

    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (a:Article { id: $articleId ${tenantId ? ', tenant_id: $tenantId' : ''} })-[:HAS_SECTION]->(s:Section)
       WHERE NOT EXISTS { (parent:Section)-[:HAS_SUBSECTION]->(s) }
       RETURN s.id AS id,
              s.title AS title,
              s.level AS level,
              s.position AS position
       ORDER BY s.position`,
      { articleId, tenantId },
      'READ'
    );

    return rows.map(r => ({
      id: String(r.id ?? ''),
      title: String(r.title ?? ''),
      level: typeof r.level === 'number' ? r.level : 0,
      position: typeof r.position === 'number' ? r.position : 0,
    }));
  }

  /**
   * Supprime toutes les relations de hiérarchie pour un article.
   * Utile lors de la réindexation complète.
   */
  async clearHierarchyForArticle(params: { articleId: string; tenantId?: string }): Promise<void> {
    const { articleId, tenantId } = params;

    await this.conn.query(
      `MATCH (parent:Section)-[r:HAS_SUBSECTION]->(child:Section)
       WHERE parent.article_id = $articleId AND child.article_id = $articleId
       ${tenantId ? 'AND parent.article_id = $articleId' : ''}
       DELETE r`,
      { articleId, tenantId },
      'WRITE'
    );

    this.logger.log('Hierarchy cleared for article', { articleId });
  }
}
