/**
 * Trace Loader - Converts PML production traces to HexCell format
 *
 * Expected input format (from tools/export-traces-for-benchmark.ts):
 * {
 *   nodes: {
 *     capabilities: [{ id, embedding, toolsUsed, successRate, description }],
 *     tools: [{ id, embedding }]
 *   },
 *   episodicEvents: [{ intent, selectedCapability, outcome }]
 * }
 */

import type { HexCell } from '../types';
import { hexSpiral } from './hexMath';

/** Production trace export format */
export interface ProductionTraceExport {
  metadata: {
    exportedAt: string;
    stats: {
      capabilities: number;
      tools: number;
    };
  };
  nodes: {
    capabilities: Array<{
      id: string;
      embedding?: number[];
      toolsUsed: string[];
      successRate: number;
      description?: string;
    }>;
    tools: Array<{
      id: string;
      embedding: number[];
    }>;
  };
  episodicEvents: Array<{
    intent: string;
    selectedCapability: string;
    outcome: string;
  }>;
}

/** Color palette for different categories */
const CATEGORY_COLORS: Record<string, [number, number, number, number]> = {
  filesystem: [0.3, 0.5, 0.9, 1.0],    // Blue
  database: [0.9, 0.6, 0.2, 1.0],       // Orange
  ai: [0.6, 0.3, 0.8, 1.0],             // Purple
  ml: [0.6, 0.3, 0.8, 1.0],             // Purple
  http: [0.8, 0.3, 0.6, 1.0],           // Pink
  git: [0.3, 0.8, 0.4, 1.0],            // Green
  shell: [0.2, 0.7, 0.7, 1.0],          // Teal
  default: [0.5, 0.5, 0.6, 1.0],        // Gray
};

/**
 * Infer category from tool/capability ID
 */
function inferCategory(id: string): string {
  const lower = id.toLowerCase();
  if (lower.includes('file') || lower.includes('read') || lower.includes('write') || lower.includes('fs')) {
    return 'filesystem';
  }
  if (lower.includes('sql') || lower.includes('db') || lower.includes('query') || lower.includes('psql') || lower.includes('pglite')) {
    return 'database';
  }
  if (lower.includes('ai') || lower.includes('llm') || lower.includes('embed') || lower.includes('ml')) {
    return 'ai';
  }
  if (lower.includes('http') || lower.includes('fetch') || lower.includes('request') || lower.includes('api')) {
    return 'http';
  }
  if (lower.includes('git') || lower.includes('commit') || lower.includes('branch')) {
    return 'git';
  }
  if (lower.includes('shell') || lower.includes('exec') || lower.includes('bash')) {
    return 'shell';
  }
  return 'default';
}

/**
 * Get color for a tool/capability based on its category
 */
function getColorForId(id: string): [number, number, number, number] {
  const category = inferCategory(id);
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
}

/**
 * Convert production traces to HexCell array
 */
export function tracesToHexCells(data: ProductionTraceExport): HexCell[] {
  const cells: HexCell[] = [];

  // Group capabilities by category
  const capsByCategory = new Map<string, typeof data.nodes.capabilities>();
  for (const cap of data.nodes.capabilities) {
    const category = inferCategory(cap.id);
    if (!capsByCategory.has(category)) {
      capsByCategory.set(category, []);
    }
    capsByCategory.get(category)!.push(cap);
  }

  // Level 0: Category hexes
  const categoryPositions = hexSpiral(0, 0, 2);
  const categories = Array.from(capsByCategory.keys());

  for (let i = 0; i < categories.length && i < categoryPositions.length; i++) {
    const category = categories[i];
    const pos = categoryPositions[i];
    const caps = capsByCategory.get(category)!;

    cells.push({
      id: `cat:${category}`,
      q: pos.q,
      r: pos.r,
      level: 0,
      label: category.charAt(0).toUpperCase() + category.slice(1),
      children: caps.map((c) => c.id),
      color: CATEGORY_COLORS[category] || CATEGORY_COLORS.default,
    });

    // Level 1: Capability hexes within each category
    const capPositions = hexSpiral(0, 0, Math.ceil(Math.sqrt(caps.length)));
    for (let j = 0; j < caps.length && j < capPositions.length; j++) {
      const cap = caps[j];
      const capPos = capPositions[j];

      // Extract tool IDs for children
      const toolIds = cap.toolsUsed.map((t) => `tool:${t}`);

      cells.push({
        id: cap.id,
        q: capPos.q + pos.q * 3, // Offset by category position
        r: capPos.r + pos.r * 3,
        level: 1,
        label: cap.description || cap.id.split(':').pop() || cap.id,
        parentId: `cat:${category}`,
        children: toolIds.length > 0 ? toolIds : undefined,
        color: adjustColor(CATEGORY_COLORS[category] || CATEGORY_COLORS.default, 0.1),
      });

      // Level 2: Tool hexes within each capability
      if (cap.toolsUsed.length > 0) {
        const toolPositions = hexSpiral(0, 0, 1);
        for (let k = 0; k < cap.toolsUsed.length && k < toolPositions.length * 7; k++) {
          const toolId = cap.toolsUsed[k];
          const toolPos = toolPositions[k % toolPositions.length];

          cells.push({
            id: `tool:${toolId}:${cap.id}`,
            q: toolPos.q + capPos.q * 2 + pos.q * 6,
            r: toolPos.r + capPos.r * 2 + pos.r * 6,
            level: 2,
            label: toolId.split(':').pop() || toolId,
            parentId: cap.id,
            color: adjustColor(CATEGORY_COLORS[category] || CATEGORY_COLORS.default, 0.2),
          });
        }
      }
    }
  }

  return cells;
}

/**
 * Adjust color brightness
 */
function adjustColor(
  color: [number, number, number, number],
  amount: number
): [number, number, number, number] {
  return [
    Math.min(1, color[0] + amount),
    Math.min(1, color[1] + amount),
    Math.min(1, color[2] + amount),
    color[3],
  ];
}

/**
 * Load traces from a JSON file path
 */
export async function loadTracesFromFile(path: string): Promise<HexCell[]> {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load traces: ${response.status}`);
    }
    const data: ProductionTraceExport = await response.json();
    return tracesToHexCells(data);
  } catch (error) {
    console.error('Error loading traces:', error);
    return [];
  }
}
