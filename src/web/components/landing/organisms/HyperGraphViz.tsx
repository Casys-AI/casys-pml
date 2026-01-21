/**
 * HyperGraphViz - Isometric 3D Knowledge Graph
 *
 * Clean isometric view showing:
 * - Super-nodes (namespaces) with child nodes (tools)
 * - Hierarchy links connecting parents to children
 * - Animated discovery particles
 *
 * @module web/components/landing/organisms/HyperGraphViz
 */

interface HyperGraphVizProps {
  width?: number;
  height?: number;
}

// Isometric projection
const ISO_ANGLE = Math.PI / 6;
const ISO_SCALE = 0.8;

function toIso(x: number, y: number, z: number): { x: number; y: number } {
  return {
    x: (x - z) * Math.cos(ISO_ANGLE) * ISO_SCALE,
    y: (x + z) * Math.sin(ISO_ANGLE) * ISO_SCALE - y * ISO_SCALE,
  };
}

const CENTER = { x: 260, y: 240 };

function project(x: number, y: number, z: number): { x: number; y: number } {
  const iso = toIso(x, y, z);
  return { x: CENTER.x + iso.x, y: CENTER.y + iso.y };
}

// Seeded random for consistent rendering
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Generate random points in 3D space
function generatePoints(count: number, seed: number, bounds: { x: [number, number]; y: [number, number]; z: [number, number] }) {
  const points: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: bounds.x[0] + seededRandom(seed + i * 3) * (bounds.x[1] - bounds.x[0]),
      y: bounds.y[0] + seededRandom(seed + i * 3 + 1) * (bounds.y[1] - bounds.y[0]),
      z: bounds.z[0] + seededRandom(seed + i * 3 + 2) * (bounds.z[1] - bounds.z[0]),
    });
  }
  return points;
}

// Meta-meta node (top level) - cyan
const metaMetaNode = {
  color: "#06b6d4",
  pos: { x: 0, y: 130, z: 0 },
};

// Meta nodes (middle level) - spread across 3D space with more height variation
const metaNodes = [
  { color: "#8b5cf6", pos: { x: -80, y: 95, z: -90 } },
  { color: "#f97316", pos: { x: 85, y: 75, z: -100 } },
  { color: "#ec4899", pos: { x: -95, y: 60, z: 85 } },
  { color: "#FFB86F", pos: { x: 80, y: 85, z: 80 } },
  { color: "#10b981", pos: { x: -15, y: 45, z: -110 } },
  { color: "#6366f1", pos: { x: 10, y: 55, z: 100 } },
  { color: "#ef4444", pos: { x: -85, y: 105, z: 0 } },
  { color: "#14b8a6", pos: { x: 90, y: 40, z: -5 } },
  { color: "#a855f7", pos: { x: 0, y: 70, z: -95 } },
  { color: "#eab308", pos: { x: -50, y: 30, z: 95 } },
];

// Generate lots of small points scattered throughout - more depth and height
const smallPoints = generatePoints(150, 42, {
  x: [-120, 120],
  y: [5, 80],
  z: [-120, 120],
});

// Assign each small point to nearest meta node
const pointsWithMeta = smallPoints.map((pt, i) => {
  let minDist = Infinity;
  let nearestMeta = 0;
  metaNodes.forEach((meta, mi) => {
    const dist = Math.sqrt(
      Math.pow(pt.x - meta.pos.x, 2) +
      Math.pow(pt.y - meta.pos.y, 2) +
      Math.pow(pt.z - meta.pos.z, 2)
    );
    if (dist < minDist) {
      minDist = dist;
      nearestMeta = mi;
    }
  });
  return { ...pt, metaIndex: nearestMeta, size: 1.5 + seededRandom(i * 7) * 2, id: i };
});

// Group points by their meta node for hyper-edge activation
const pointsByMeta: Record<number, number[]> = {};
pointsWithMeta.forEach((pt, i) => {
  if (!pointsByMeta[pt.metaIndex]) pointsByMeta[pt.metaIndex] = [];
  pointsByMeta[pt.metaIndex].push(i);
});

// Lightning color - single color like brain synapses
const LIGHTNING_COLOR = "#67e8f9"; // Cyan/electric blue

// Complete workflow paths for DR-DSP exploration
// Fast lightning-like pulses through the workflow - rapid fire!
// Workflows don't have to go through registry - can be direct tool->meta->tool paths
const workflowPaths = [
  // === DIRECT PATHS (no registry) ===
  // Workflow 1: tool → meta → tool (within same capability)
  { id: 'wf1', delay: 0, duration: 10, edges: [
    { from: 'tool', fromMeta: 2, fromTool: 1, to: 'meta', toMeta: 2, delay: 0 },
    { from: 'meta', fromMeta: 2, to: 'tool', toMeta: 2, toTool: 5, delay: 0.1 },
  ]},
  // Workflow 2: tool → meta → meta → tool (cross-capability)
  { id: 'wf2', delay: 0.8, duration: 10, edges: [
    { from: 'tool', fromMeta: 0, fromTool: 3, to: 'meta', toMeta: 0, delay: 0 },
    { from: 'meta', fromMeta: 0, to: 'meta', toMeta: 7, delay: 0.1 },
    { from: 'meta', fromMeta: 7, to: 'tool', toMeta: 7, toTool: 2, delay: 0.2 },
  ]},
  // Workflow 3: tool → meta → meta → meta → tool (long chain)
  { id: 'wf3', delay: 1.6, duration: 10, edges: [
    { from: 'tool', fromMeta: 5, fromTool: 0, to: 'meta', toMeta: 5, delay: 0 },
    { from: 'meta', fromMeta: 5, to: 'meta', toMeta: 9, delay: 0.1 },
    { from: 'meta', fromMeta: 9, to: 'meta', toMeta: 3, delay: 0.2 },
    { from: 'meta', fromMeta: 3, to: 'tool', toMeta: 3, toTool: 4, delay: 0.3 },
  ]},
  // Workflow 4: short hop between neighbors
  { id: 'wf4', delay: 2.4, duration: 10, edges: [
    { from: 'tool', fromMeta: 8, fromTool: 2, to: 'meta', toMeta: 8, delay: 0 },
    { from: 'meta', fromMeta: 8, to: 'tool', toMeta: 8, toTool: 6, delay: 0.1 },
  ]},
  // Workflow 5: diagonal cross without registry
  { id: 'wf5', delay: 3.2, duration: 10, edges: [
    { from: 'tool', fromMeta: 4, fromTool: 1, to: 'meta', toMeta: 4, delay: 0 },
    { from: 'meta', fromMeta: 4, to: 'meta', toMeta: 1, delay: 0.1 },
    { from: 'meta', fromMeta: 1, to: 'tool', toMeta: 1, toTool: 3, delay: 0.2 },
  ]},

  // === THROUGH REGISTRY (full path) ===
  // Workflow 6: full registry path
  { id: 'wf6', delay: 4, duration: 10, edges: [
    { from: 'tool', fromMeta: 6, fromTool: 0, to: 'meta', toMeta: 6, delay: 0 },
    { from: 'meta', fromMeta: 6, to: 'registry', delay: 0.1 },
    { from: 'registry', to: 'meta', toMeta: 2, delay: 0.2 },
    { from: 'meta', fromMeta: 2, to: 'tool', toMeta: 2, toTool: 2, delay: 0.3 },
  ]},
  // Workflow 7: registry bounce
  { id: 'wf7', delay: 4.8, duration: 10, edges: [
    { from: 'tool', fromMeta: 1, fromTool: 5, to: 'meta', toMeta: 1, delay: 0 },
    { from: 'meta', fromMeta: 1, to: 'registry', delay: 0.1 },
    { from: 'registry', to: 'meta', toMeta: 9, delay: 0.2 },
    { from: 'meta', fromMeta: 9, to: 'tool', toMeta: 9, toTool: 1, delay: 0.3 },
  ]},

  // === MORE DIRECT PATHS ===
  // Workflow 8: zigzag through metas
  { id: 'wf8', delay: 5.6, duration: 10, edges: [
    { from: 'tool', fromMeta: 3, fromTool: 2, to: 'meta', toMeta: 3, delay: 0 },
    { from: 'meta', fromMeta: 3, to: 'meta', toMeta: 0, delay: 0.1 },
    { from: 'meta', fromMeta: 0, to: 'meta', toMeta: 6, delay: 0.2 },
    { from: 'meta', fromMeta: 6, to: 'tool', toMeta: 6, toTool: 3, delay: 0.3 },
  ]},
  // Workflow 9: quick direct hop
  { id: 'wf9', delay: 6.4, duration: 10, edges: [
    { from: 'tool', fromMeta: 7, fromTool: 4, to: 'meta', toMeta: 7, delay: 0 },
    { from: 'meta', fromMeta: 7, to: 'meta', toMeta: 4, delay: 0.1 },
    { from: 'meta', fromMeta: 4, to: 'tool', toMeta: 4, toTool: 2, delay: 0.2 },
  ]},
  // Workflow 10: long traverse
  { id: 'wf10', delay: 7.2, duration: 10, edges: [
    { from: 'tool', fromMeta: 9, fromTool: 3, to: 'meta', toMeta: 9, delay: 0 },
    { from: 'meta', fromMeta: 9, to: 'meta', toMeta: 5, delay: 0.1 },
    { from: 'meta', fromMeta: 5, to: 'meta', toMeta: 1, delay: 0.2 },
    { from: 'meta', fromMeta: 1, to: 'meta', toMeta: 8, delay: 0.3 },
    { from: 'meta', fromMeta: 8, to: 'tool', toMeta: 8, toTool: 0, delay: 0.4 },
  ]},
  // Workflow 11: compact loop
  { id: 'wf11', delay: 8, duration: 10, edges: [
    { from: 'tool', fromMeta: 2, fromTool: 4, to: 'meta', toMeta: 2, delay: 0 },
    { from: 'meta', fromMeta: 2, to: 'meta', toMeta: 6, delay: 0.1 },
    { from: 'meta', fromMeta: 6, to: 'tool', toMeta: 6, toTool: 5, delay: 0.2 },
  ]},
  // Workflow 12: far diagonal
  { id: 'wf12', delay: 8.8, duration: 10, edges: [
    { from: 'tool', fromMeta: 0, fromTool: 6, to: 'meta', toMeta: 0, delay: 0 },
    { from: 'meta', fromMeta: 0, to: 'meta', toMeta: 3, delay: 0.1 },
    { from: 'meta', fromMeta: 3, to: 'tool', toMeta: 3, toTool: 0, delay: 0.2 },
  ]},
];

// Isometric grid data
const gridSize = 130;
const gridStep = 30;
const gridHeight = 140;

// Floor grid (XZ plane at y=0)
const floorLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
for (let i = -gridSize; i <= gridSize; i += gridStep) {
  const xStart = toIso(i, 0, -gridSize);
  const xEnd = toIso(i, 0, gridSize);
  floorLines.push({
    x1: CENTER.x + xStart.x, y1: CENTER.y + xStart.y,
    x2: CENTER.x + xEnd.x, y2: CENTER.y + xEnd.y,
  });
  const zStart = toIso(-gridSize, 0, i);
  const zEnd = toIso(gridSize, 0, i);
  floorLines.push({
    x1: CENTER.x + zStart.x, y1: CENTER.y + zStart.y,
    x2: CENTER.x + zEnd.x, y2: CENTER.y + zEnd.y,
  });
}

// Back wall (XY plane at z=-gridSize)
const backWallLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
for (let i = -gridSize; i <= gridSize; i += gridStep) {
  // Vertical lines
  const vStart = toIso(i, 0, -gridSize);
  const vEnd = toIso(i, gridHeight, -gridSize);
  backWallLines.push({
    x1: CENTER.x + vStart.x, y1: CENTER.y + vStart.y,
    x2: CENTER.x + vEnd.x, y2: CENTER.y + vEnd.y,
  });
}
for (let y = 0; y <= gridHeight; y += gridStep) {
  // Horizontal lines
  const hStart = toIso(-gridSize, y, -gridSize);
  const hEnd = toIso(gridSize, y, -gridSize);
  backWallLines.push({
    x1: CENTER.x + hStart.x, y1: CENTER.y + hStart.y,
    x2: CENTER.x + hEnd.x, y2: CENTER.y + hEnd.y,
  });
}

// Side wall (YZ plane at x=-gridSize)
const sideWallLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
for (let i = -gridSize; i <= gridSize; i += gridStep) {
  // Vertical lines
  const vStart = toIso(-gridSize, 0, i);
  const vEnd = toIso(-gridSize, gridHeight, i);
  sideWallLines.push({
    x1: CENTER.x + vStart.x, y1: CENTER.y + vStart.y,
    x2: CENTER.x + vEnd.x, y2: CENTER.y + vEnd.y,
  });
}
for (let y = 0; y <= gridHeight; y += gridStep) {
  // Horizontal lines
  const hStart = toIso(-gridSize, y, -gridSize);
  const hEnd = toIso(-gridSize, y, gridSize);
  sideWallLines.push({
    x1: CENTER.x + hStart.x, y1: CENTER.y + hStart.y,
    x2: CENTER.x + hEnd.x, y2: CENTER.y + hEnd.y,
  });
}

export function HyperGraphViz(_props: HyperGraphVizProps) {
  // Fixed viewBox coordinates, SVG scales responsively
  const viewBoxWidth = 520;
  const viewBoxHeight = 480;

  return (
    <div class="hgv">
      <svg
        class="hgv__svg"
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Subtle glow filter for lightning edges */}
          <filter id="lightning-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Subtle glow for nodes */}
          <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Layer 0: Isometric grids (floor + walls) */}
        <g class="hgv__grid">
          {/* Back wall - lighter, more distant */}
          {backWallLines.map((line, i) => (
            <line
              key={`bw${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="rgba(139, 92, 246, 0.08)"
              stroke-width="0.5"
            />
          ))}
          {/* Side wall - medium contrast */}
          {sideWallLines.map((line, i) => (
            <line
              key={`sw${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="rgba(139, 92, 246, 0.15)"
              stroke-width="0.5"
            />
          ))}
          {/* Floor - strongest, closest to viewer */}
          {floorLines.map((line, i) => (
            <line
              key={`f${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="rgba(139, 92, 246, 0.35)"
              stroke-width="0.8"
            />
          ))}
        </g>

        {/* Layer 1: Links from meta-meta to meta nodes */}
        <g class="hgv__meta-links">
          {metaNodes.map((meta, i) => {
            const from = project(metaMetaNode.pos.x, metaMetaNode.pos.y, metaMetaNode.pos.z);
            const to = project(meta.pos.x, meta.pos.y, meta.pos.z);
            return (
              <line
                key={`mm-${i}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#444"
                stroke-width="1"
                opacity="0.4"
              />
            );
          })}
        </g>

        {/* Layer 2: Links from meta nodes to small points */}
        <g class="hgv__hierarchy-links">
          {pointsWithMeta.map((pt, i) => {
            const meta = metaNodes[pt.metaIndex];
            const from = project(meta.pos.x, meta.pos.y, meta.pos.z);
            const to = project(pt.x, pt.y, pt.z);
            return (
              <line
                key={`h-${i}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#555"
                stroke-width="0.5"
                opacity="0.3"
              />
            );
          })}
        </g>

        {/* Layer 3: Small points (lots of them) */}
        <g class="hgv__points">
          {pointsWithMeta.map((pt, i) => {
            const pos = project(pt.x, pt.y, pt.z);
            const meta = metaNodes[pt.metaIndex];
            return (
              <circle
                key={`pt-${i}`}
                cx={pos.x}
                cy={pos.y}
                r={pt.size}
                fill={meta.color}
                opacity="0.7"
              />
            );
          })}
        </g>

        {/* Layer 4: Meta nodes */}
        <g class="hgv__meta-nodes">
          {metaNodes.map((meta, i) => {
            const pos = project(meta.pos.x, meta.pos.y, meta.pos.z);
            return (
              <circle key={`meta-${i}`} cx={pos.x} cy={pos.y} r="5" fill={meta.color} />
            );
          })}
        </g>

        {/* Layer 5: Meta-meta node (top level) */}
        <g class="hgv__meta-meta">
          {(() => {
            const pos = project(metaMetaNode.pos.x, metaMetaNode.pos.y, metaMetaNode.pos.z);
            return <circle cx={pos.x} cy={pos.y} r="7" fill={metaMetaNode.color} />;
          })()}
        </g>

        {/* Layer 6: DR-DSP Lightning - Complete workflow paths */}
        <g class="hgv__lightning">
          {workflowPaths.map((workflow) => {
            const regPos = project(metaMetaNode.pos.x, metaMetaNode.pos.y, metaMetaNode.pos.z);

            return (
              <g key={workflow.id} class="hgv__workflow">
                {workflow.edges.map((edge, edgeIdx) => {
                  const edgeDelay = workflow.delay + edge.delay;
                  const duration = workflow.duration;
                  const elements: preact.JSX.Element[] = [];

                  // Determine start and end positions
                  let startPos = regPos;
                  let endPos = regPos;

                  if (edge.from === 'registry') {
                    startPos = regPos;
                  } else if (edge.from === 'meta' && edge.fromMeta !== undefined) {
                    const meta = metaNodes[edge.fromMeta];
                    startPos = project(meta.pos.x, meta.pos.y, meta.pos.z);
                  } else if (edge.from === 'tool' && edge.fromMeta !== undefined) {
                    const toolIndices = pointsByMeta[edge.fromMeta] || [];
                    const toolIdx = toolIndices[edge.fromTool || 0];
                    if (toolIdx !== undefined) {
                      const tool = pointsWithMeta[toolIdx];
                      startPos = project(tool.x, tool.y, tool.z);
                    }
                  }

                  if (edge.to === 'registry') {
                    endPos = regPos;
                  } else if (edge.to === 'meta' && edge.toMeta !== undefined) {
                    const meta = metaNodes[edge.toMeta];
                    endPos = project(meta.pos.x, meta.pos.y, meta.pos.z);
                  } else if (edge.to === 'tool' && edge.toMeta !== undefined) {
                    const toolIndices = pointsByMeta[edge.toMeta] || [];
                    const toolIdx = toolIndices[edge.toTool || 0];
                    if (toolIdx !== undefined) {
                      const tool = pointsWithMeta[toolIdx];
                      endPos = project(tool.x, tool.y, tool.z);
                    }
                  }

                  {
                    // Main chosen edge
                    elements.push(
                      <line
                        key={`${workflow.id}-${edgeIdx}-edge`}
                        x1={startPos.x}
                        y1={startPos.y}
                        x2={endPos.x}
                        y2={endPos.y}
                        stroke={LIGHTNING_COLOR}
                        stroke-width="1"
                        class="hgv__flash-edge"
                        style={{ animationDelay: `${edgeDelay}s`, animationDuration: `${duration}s` }}
                      />
                    );

                    // If this edge goes TO a tool FROM a meta, show hyper-edge ghost
                    // (all other tools of that meta, faint and quick to fade)
                    if (edge.from === 'meta' && edge.to === 'tool' && edge.fromMeta !== undefined) {
                      const metaIdx = edge.fromMeta;
                      const toolIndices = pointsByMeta[metaIdx] || [];
                      const chosenToolIdx = toolIndices[edge.toTool || 0];

                      toolIndices.forEach((toolIdx, ti) => {
                        if (toolIdx === chosenToolIdx) return; // Skip chosen one
                        const tool = pointsWithMeta[toolIdx];
                        const toolPos = project(tool.x, tool.y, tool.z);
                        const meta = metaNodes[metaIdx];
                        const metaPos = project(meta.pos.x, meta.pos.y, meta.pos.z);

                        elements.push(
                          <line
                            key={`${workflow.id}-${edgeIdx}-ghost-${ti}`}
                            x1={metaPos.x}
                            y1={metaPos.y}
                            x2={toolPos.x}
                            y2={toolPos.y}
                            stroke={LIGHTNING_COLOR}
                            stroke-width="0.5"
                            class="hgv__ghost-edge"
                            style={{ animationDelay: `${edgeDelay}s`, animationDuration: `${duration}s` }}
                          />
                        );
                      });
                    }
                  }

                  return elements;
                })}
              </g>
            );
          })}
        </g>

      </svg>

      <style>
        {`
        .hgv {
          width: 100%;
          opacity: 0;
          animation: hgvFadeIn 0.6s ease 0.3s forwards;
        }

        @keyframes hgvFadeIn {
          to { opacity: 1; }
        }

        .hgv__svg {
          display: block;
          width: 100%;
          height: auto;
        }

        /* Lightning flash - rapid fire through workflow */
        .hgv__flash-edge {
          opacity: 0;
          animation: lightning 10s linear infinite;
        }

        /* Ghost hyper-edge - faint alternatives that fade quickly */
        .hgv__ghost-edge {
          opacity: 0;
          animation: ghostFlash 10s linear infinite;
        }

        @keyframes lightning {
          0% { opacity: 0; }
          1.5% { opacity: 1; }
          4% { opacity: 1; }
          6% { opacity: 0; }
          100% { opacity: 0; }
        }

        @keyframes ghostFlash {
          0% { opacity: 0; }
          1.5% { opacity: 0.25; }
          2.5% { opacity: 0.15; }
          3.5% { opacity: 0; }
          100% { opacity: 0; }
        }

        @media (max-width: 768px) {
          .hgv {
            max-width: 100%;
          }
        }
        `}
      </style>
    </div>
  );
}
