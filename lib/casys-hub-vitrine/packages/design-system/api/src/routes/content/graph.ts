import { type ContextVariableMap, Hono } from 'hono';
import { z } from 'zod';

import { createLogger } from '../../utils/logger';

const logger = createLogger('GraphRoutes');

interface GraphBindings {
  Variables: Pick<ContextVariableMap, 'createApiResponse'>;
}

// Schema pour la réponse du graphe
const graphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['article', 'topic', 'keyword']).default('article'),
  size: z.number().default(1), // Nombre de liens entrants/sortants
  color: z.string().optional(),
});

const graphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  weight: z.number().default(1),
  type: z.string().default('links_to'),
});

const graphDataSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  stats: z.object({
    nodeCount: z.number(),
    edgeCount: z.number(),
    density: z.number(),
  }),
});

type GraphData = z.infer<typeof graphDataSchema>;

export const graphRoutes = new Hono<GraphBindings>();

/**
 * GET /graph - Récupère le graphe des articles et leurs liens
 * Query params:
 * - limit: nombre max de nœuds (default: 100)
 * - skip: offset pour pagination (default: 0)
 * - minConnections: filtrer par minimum de connections (default: 0)
 * - projectId: filtrer par projet (optionnel)
 */
graphRoutes.get('/graph', async c => {
  try {
    const createApiResponse = c.get('createApiResponse');

    // Récupérer les paramètres de query
    const limit = Math.min(parseInt(c.req.query('limit') || '250', 10), 1000); // Max 1000, default 250
    const skip = Math.max(parseInt(c.req.query('skip') || '0', 10), 0);
    const minConnections = Math.max(parseInt(c.req.query('minConnections') || '0', 10), 0);
    const projectId = c.req.query('projectId');

    // Récupérer la Neo4jConnection du contexte
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const infraServices: any = (c as unknown as { get: (k: string) => unknown }).get(
      'infraServices'
    );
    const neo4jConnection = infraServices?.neo4jConnection;

    if (!neo4jConnection) {
      logger.warn('Neo4j connection not available');
      return c.json(
        createApiResponse(
          false,
          null,
          'Neo4j connection non disponible pour récupérer le graphe'
        ),
        503
      );
    }

    // Requête Cypher optimisée avec pagination et filtrage
    // ⚠️ ADR 0011: Utiliser toInteger() pour tous les paramètres numériques
    const cypher = `
      MATCH (a:Article)${projectId ? ' WHERE a.project_id = $projectId' : ''}
      OPTIONAL MATCH (a)-[r:LINKS_TO]->(b:Article)
      WITH a, collect(DISTINCT {target: b.id, targetTitle: b.title, type: type(r)}) as outgoing_links
      OPTIONAL MATCH (a)<-[r:LINKS_TO]-(b:Article)
      WITH a, outgoing_links, collect(DISTINCT {source: b.id, sourceTitle: b.title, type: type(r)}) as incoming_links
      WITH a, outgoing_links, incoming_links,
           (size(outgoing_links) + size(incoming_links)) as link_count
      WHERE link_count >= toInteger($minConnections)
      RETURN
        a.id as id,
        a.title as title,
        a.slug as slug,
        link_count,
        outgoing_links,
        incoming_links
      ORDER BY link_count DESC
      SKIP toInteger($skip)
      LIMIT toInteger($limit)
    `;

    const params = {
      limit,
      skip,
      minConnections,
      ...(projectId ? { projectId } : {}),
    };

    const rows = await neo4jConnection.query<Record<string, unknown>>(cypher, params, 'READ');

    // Construire la réponse du graphe
    const nodes = rows.map(row => ({
      id: String(row.id || ''),
      title: String(row.title || 'Sans titre'),
      type: 'article' as const,
      size: Math.max(3, Math.min(15, Number(row.link_count || 1))), // Taille basée sur nombre de liens
      color: generateColorFromId(String(row.id || '')),
    }));

    // Construire les arêtes à partir des liens
    const edges: { source: string; target: string; weight: number; type: string }[] = [];
    const addedEdges = new Set<string>();

    rows.forEach(row => {
      const sourceId = String(row.id || '');
      const outgoingLinks = Array.isArray(row.outgoing_links)
        ? row.outgoing_links
        : [];

      outgoingLinks.forEach((link: Record<string, unknown>) => {
        const targetId = String(link.target || '');
        const edgeKey = `${sourceId}-${targetId}`;

        if (targetId && !addedEdges.has(edgeKey)) {
          edges.push({
            source: sourceId,
            target: targetId,
            weight: 1,
            type: String(link.type || 'links_to'),
          });
          addedEdges.add(edgeKey);
        }
      });
    });

    // Calculer les statistiques
    const density = nodes.length > 0 ? edges.length / (nodes.length * (nodes.length - 1)) : 0;

    const graphData: GraphData = {
      nodes: nodes.filter(n => n.id), // Filtrer les nœuds sans ID
      edges,
      stats: {
        nodeCount: nodes.filter(n => n.id).length,
        edgeCount: edges.length,
        density: Math.round(density * 10000) / 10000,
      },
    };

    // Validation Zod
    const validated = graphDataSchema.parse(graphData);

    logger.log(`✅ Graphe chargé: ${validated.nodes.length} nœuds, ${validated.edges.length} arêtes`);

    const response = createApiResponse(true, validated);

    // Cache headers: 5 minutes pour réduire charge Neo4j
    c.header('Cache-Control', 'public, max-age=300');
    c.header('ETag', `"graph-${validated.stats.nodeCount}-${validated.stats.edgeCount}"`);

    return c.json(response, 200);
  } catch (error) {
    logger.error('❌ Erreur lors du chargement du graphe:', error);

    const createApiResponse = c.get('createApiResponse');
    const response = createApiResponse(
      false,
      null,
      `Erreur lors du chargement du graphe: ${error instanceof Error ? error.message : String(error)}`
    );

    return c.json(response, 500);
  }
});

/**
 * Génère une couleur déterministe basée sur l'ID
 */
function generateColorFromId(id: string): string {
  const hash = Array.from(id).reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);

  const colors = [
    '#FF6B6B', // Red
    '#4ECDC4', // Teal
    '#45B7D1', // Blue
    '#96CEB4', // Green
    '#FFEAA7', // Yellow
    '#DDA15E', // Orange
    '#BC6C25', // Brown
    '#8E44AD', // Purple
  ];

  return colors[Math.abs(hash) % colors.length];
}

export default graphRoutes;
