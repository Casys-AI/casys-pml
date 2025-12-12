
/**
 * A force-directed edge bundling implementation compatible with D3.
 * Adapted from d3-ForceEdgeBundling (Holten & Van Wijk, 2009).
 */

interface Point {
  x: number;
  y: number;
}

interface BundledEdge {
  source: Point;
  target: Point;
  points: Point[]; // Subdivision points
}

export class EdgeBundler {
  private data_nodes: Record<string, Point>;
  private data_edges: { source: string; target: string }[];
  private stiffness: number;
  private initial_temperature: number;

  constructor() {
    this.data_nodes = {};
    this.data_edges = [];
    this.stiffness = 0.1;
    // this.iterations = 60; // Unused, local constant used instead
    this.initial_temperature = 0.5;
  }

  public setNodes(nodes: Record<string, Point>) {
    this.data_nodes = nodes;
    return this;
  }

  public setEdges(edges: { source: string; target: string }[]) {
    this.data_edges = edges;
    return this;
  }

  // Main execution of the bundling
  public bundle(): Point[][] {
    // 1. Initialize subdivisions
    // Increase control points for smoother curves
    const P = 6; 
    
    let edges: BundledEdge[] = this.data_edges.map(e => {
      const src = this.data_nodes[e.source];
      const tgt = this.data_nodes[e.target];
      
      const points: Point[] = [];
      points.push({ x: src.x, y: src.y }); // Start
      
      for (let i = 1; i <= P; i++) {
        const t = i / (P + 1);
        points.push({
          x: src.x + (tgt.x - src.x) * t,
          y: src.y + (tgt.y - src.y) * t
        });
      }
      
      points.push({ x: tgt.x, y: tgt.y }); // End
      
      return { source: src, target: tgt, points };
    });

    // 2. Run pseudo-physics simulation
    let K = this.stiffness;
    const ITERATIONS = 90; // Increased iterations
    
    for (let it = 0; it < ITERATIONS; it++) {
      // Temperature cools down
      const temp = this.initial_temperature * (1 - it / ITERATIONS);
      const isWarm = it < ITERATIONS / 2;
      
      // Calculate forces
      // For each edge i
      for (let i = 0; i < edges.length; i++) {
        const edgeI = edges[i];
        
        // Spring force (keep edge straight-ish)
        for (let p = 1; p < edgeI.points.length - 1; p++) {
          const prev = edgeI.points[p - 1];
          const curr = edgeI.points[p];
          const next = edgeI.points[p + 1];
          
          let fx = (prev.x - curr.x) + (next.x - curr.x);
          let fy = (prev.y - curr.y) + (next.y - curr.y);
          
          // Apply spring
          fx *= K;
          fy *= K;

          // Electrostatic force (attract to other edges)
          let electrostaticX = 0;
          let electrostaticY = 0;
          let count = 0;

          // Look at other edges j
          // Sample a subset for performance if needed, but for < 500 edges, loop is fine.
          for (let j = 0; j < edges.length; j++) {
            if (i === j) continue;
             const edgeJ = edges[j];
             
             // Relaxed Compatibility Check
             // In bipartite left-right, edges are compatible if they are vertically close.
             // const dySource = Math.abs(edgeI.source.y - edgeJ.source.y);
             // const dyTarget = Math.abs(edgeI.target.y - edgeJ.target.y);

             // If source OR target are close, they can bundle.
             // Or if they are simply "parallel-ish" and close.
             
             // Distance between points at index p
             const pJ = edgeJ.points[p];
             const pI = edgeI.points[p];
             
             const dx = pJ.x - pI.x;
             const dy = pJ.y - pI.y;
             const distSq = dx*dx + dy*dy;
             const dist = Math.sqrt(distSq);
             
             // Interaction range
             if (dist < 2) continue; // Too close
             if (dist > 150) continue; // Too far
             
             // Attraction strength: stronger if closer
             const force = 1 / dist;
             
             electrostaticX += dx * force; 
             electrostaticY += dy * force;
             count++;
          }
          
          if (count > 0) {
            // Normalize?
             const bundleStrength = isWarm ? 20 : 10; // Stronger at start
             fx += electrostaticX * bundleStrength / count; // Average it
             fy += electrostaticY * bundleStrength / count;
          }
          
          // Move point
          curr.x += fx * temp;
          curr.y += fy * temp;
        }
      }
    }

    // Return the point arrays for rendering SVG paths
    return edges.map(e => e.points);
  }
}
