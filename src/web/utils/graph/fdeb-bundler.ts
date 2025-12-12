/**
 * Force-Directed Edge Bundling (FDEB) Algorithm
 * Based on Holten & van Wijk, 2009 - Section 3.3
 *
 * Iterative refinement scheme:
 * - Start with coarse subdivision
 * - Double subdivision points each cycle
 * - Halve step size each cycle
 * - Run physics simulation to bundle compatible edges
 */

import {
  type Point,
  type Edge,
  edgeCompatibility,
  isCompatible,
} from "./edge-compatibility.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FDEBConfig {
  /** Global spring constant (default: 0.1) */
  K: number;
  /** Initial step size (default: 0.04) */
  S0: number;
  /** Initial iterations per cycle (default: 50) */
  I0: number;
  /** Number of refinement cycles (default: 6) */
  cycles: number;
  /** Minimum compatibility to consider bundling (default: 0.05) */
  compatibilityThreshold: number;
}

export interface BundledEdge {
  sourceId: string;
  targetId: string;
  subdivisionPoints: Point[]; // Includes source and target as first/last
}

interface InternalEdge {
  sourceId: string;
  targetId: string;
  source: Point;
  target: Point;
  points: Point[]; // Subdivision points (mutable during algorithm)
  compatibleEdges: number[]; // Indices of compatible edges (cached)
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: FDEBConfig = {
  K: 0.1, // Spring constant
  S0: 0.04, // Initial step size (as fraction of average edge length)
  I0: 50, // Initial iterations
  cycles: 6, // Number of cycles
  compatibilityThreshold: 0.05, // Minimum Ce to consider
};

// Iterative refinement scheme from paper
// P: subdivision points, S: step size, I: iterations
const SCHEME = {
  // Cycle:     0      1      2      3       4       5
  P: [1, 2, 4, 8, 16, 32], // Doubles each cycle
  S: [0.04, 0.02, 0.01, 0.005, 0.0025, 0.00125], // Halves each cycle
  I: [50, 33, 22, 15, 9, 7], // Reduces by ~2/3 each cycle
};

// ─────────────────────────────────────────────────────────────────────────────
// FDEB Bundler Class
// ─────────────────────────────────────────────────────────────────────────────

export class FDEBBundler {
  private config: FDEBConfig;
  private nodes: Map<string, Point> = new Map();
  private edgeData: Array<{ source: string; target: string }> = [];

  constructor(config?: Partial<FDEBConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set node positions (needed for edge endpoints)
   */
  setNodes(nodes: Map<string, Point>): this {
    this.nodes = nodes;
    return this;
  }

  /**
   * Set edges to bundle
   */
  setEdges(edges: Array<{ source: string; target: string }>): this {
    this.edgeData = edges;
    return this;
  }

  /**
   * Run FDEB algorithm and return bundled edges
   */
  bundle(): BundledEdge[] {
    // Build internal edge representation
    const edges = this.buildInternalEdges();

    if (edges.length === 0) {
      return [];
    }

    // Compute edge compatibilities (cached for performance)
    this.computeCompatibilities(edges);

    // Calculate average edge length for step size scaling
    const avgLength = this.calculateAverageLength(edges);

    // Run iterative refinement
    const numCycles = Math.min(this.config.cycles, SCHEME.P.length);

    for (let cycle = 0; cycle < numCycles; cycle++) {
      // Subdivide edges (except first cycle where P=1)
      if (cycle > 0) {
        this.subdivideEdges(edges);
      }

      // Get cycle parameters
      const stepSize = SCHEME.S[cycle] * avgLength;
      const iterations = SCHEME.I[cycle];
      const numPoints = SCHEME.P[cycle];

      // Spring constant scaled by number of segments
      const kP = this.config.K / numPoints;

      // Run force simulation for this cycle
      this.runSimulation(edges, stepSize, iterations, kP);
    }

    // Convert to output format
    return edges.map((e) => ({
      sourceId: e.sourceId,
      targetId: e.targetId,
      subdivisionPoints: e.points,
    }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ───────────────────────────────────────────────────────────────────────────

  private buildInternalEdges(): InternalEdge[] {
    const edges: InternalEdge[] = [];

    for (const e of this.edgeData) {
      const source = this.nodes.get(e.source);
      const target = this.nodes.get(e.target);

      if (!source || !target) continue;

      // Initialize with just source and target (will be subdivided)
      edges.push({
        sourceId: e.source,
        targetId: e.target,
        source: { ...source },
        target: { ...target },
        points: [{ ...source }, { ...target }],
        compatibleEdges: [],
      });
    }

    return edges;
  }

  private computeCompatibilities(edges: InternalEdge[]): void {
    const threshold = this.config.compatibilityThreshold;

    for (let i = 0; i < edges.length; i++) {
      const edgeI: Edge = { source: edges[i].source, target: edges[i].target };

      for (let j = i + 1; j < edges.length; j++) {
        const edgeJ: Edge = {
          source: edges[j].source,
          target: edges[j].target,
        };

        if (isCompatible(edgeI, edgeJ, threshold)) {
          edges[i].compatibleEdges.push(j);
          edges[j].compatibleEdges.push(i);
        }
      }
    }
  }

  private calculateAverageLength(edges: InternalEdge[]): number {
    if (edges.length === 0) return 100;

    let total = 0;
    for (const e of edges) {
      const dx = e.target.x - e.source.x;
      const dy = e.target.y - e.source.y;
      total += Math.sqrt(dx * dx + dy * dy);
    }

    return total / edges.length;
  }

  private subdivideEdges(edges: InternalEdge[]): void {
    for (const edge of edges) {
      const oldPoints = edge.points;
      const newPoints: Point[] = [oldPoints[0]]; // Keep source

      // Add midpoints between consecutive points
      for (let i = 0; i < oldPoints.length - 1; i++) {
        const p1 = oldPoints[i];
        const p2 = oldPoints[i + 1];

        // Add midpoint
        newPoints.push({
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2,
        });

        // Add next point (except for last iteration where target is added below)
        if (i < oldPoints.length - 2) {
          newPoints.push(p2);
        }
      }

      newPoints.push(oldPoints[oldPoints.length - 1]); // Keep target
      edge.points = newPoints;
    }
  }

  private runSimulation(
    edges: InternalEdge[],
    stepSize: number,
    iterations: number,
    kP: number
  ): void {
    // Pre-calculate edge compatibilities as floats for force calculation
    const compatibilityCache = new Map<string, number>();

    for (let i = 0; i < edges.length; i++) {
      const edgeI: Edge = { source: edges[i].source, target: edges[i].target };

      for (const j of edges[i].compatibleEdges) {
        if (j > i) {
          const edgeJ: Edge = {
            source: edges[j].source,
            target: edges[j].target,
          };
          const compat = edgeCompatibility(edgeI, edgeJ);
          const key = `${i}-${j}`;
          compatibilityCache.set(key, compat.total);
        }
      }
    }

    // Run iterations
    for (let iter = 0; iter < iterations; iter++) {
      // Calculate forces for all subdivision points
      const forces: Point[][] = edges.map((e) =>
        e.points.map(() => ({ x: 0, y: 0 }))
      );

      for (let i = 0; i < edges.length; i++) {
        const edgeI = edges[i];
        const pointsI = edgeI.points;

        // For each subdivision point (skip source and target)
        for (let p = 1; p < pointsI.length - 1; p++) {
          const pi = pointsI[p];

          // Spring force (pulls toward neighbors on same edge)
          const prev = pointsI[p - 1];
          const next = pointsI[p + 1];

          const springFx = kP * (prev.x - pi.x + next.x - pi.x);
          const springFy = kP * (prev.y - pi.y + next.y - pi.y);

          forces[i][p].x += springFx;
          forces[i][p].y += springFy;

          // Electrostatic force (attracts compatible edges)
          for (const j of edgeI.compatibleEdges) {
            const edgeJ = edges[j];
            const pointsJ = edgeJ.points;

            // Get compatibility (use cached value)
            const key = i < j ? `${i}-${j}` : `${j}-${i}`;
            const Ce = compatibilityCache.get(key) || 0;

            if (Ce === 0) continue;

            // Find corresponding point on edge J
            // Use same proportional index
            const pJ = Math.min(p, pointsJ.length - 2);
            const qj = pointsJ[pJ];

            // Direction from pi to qj
            const dx = qj.x - pi.x;
            const dy = qj.y - pi.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Avoid division by zero and very strong forces
            if (dist < 1) continue;

            // Attraction force weighted by compatibility
            const force = Ce / dist;

            forces[i][p].x += dx * force;
            forces[i][p].y += dy * force;
          }
        }
      }

      // Apply forces with step size
      for (let i = 0; i < edges.length; i++) {
        const pointsI = edges[i].points;

        for (let p = 1; p < pointsI.length - 1; p++) {
          pointsI[p].x += forces[i][p].x * stepSize;
          pointsI[p].y += forces[i][p].y * stepSize;
        }
      }
    }
  }
}

/**
 * Convenience function for quick bundling
 */
export function bundleEdges(
  nodes: Map<string, Point>,
  edges: Array<{ source: string; target: string }>,
  config?: Partial<FDEBConfig>
): BundledEdge[] {
  return new FDEBBundler(config).setNodes(nodes).setEdges(edges).bundle();
}
