import { useState, useEffect, useRef } from 'preact/hooks';
import { HexCanvas } from './components/HexCanvas';
import { SlidingSidebar, type SidebarNode } from './components/SlidingSidebar';
import { TerminalPanel } from './components/Terminal';
import { setMaxLevel, navigateToLevel, currentLevel } from './stores/navigation';
import type { HexCell } from './types';
import { hexSpiral } from './utils/hexMath';
import './App.css';

export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 16.0;

// API base URL - configurable for dev/prod
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3003';

function zoomToLevel(zoom: number, maxLevel: number): number {
  return Math.max(0, Math.min(maxLevel, Math.floor(Math.log2(zoom))));
}

function levelToZoom(level: number): number {
  return Math.pow(2, level);
}

const SERVER_COLORS: Record<string, [number, number, number, number]> = {
  std: [0.2, 0.5, 0.9, 1.0],
  playwright: [0.9, 0.4, 0.3, 1.0],
  filesystem: [0.3, 0.8, 0.4, 1.0],
  memory: [0.8, 0.6, 0.2, 1.0],
  fake: [0.6, 0.3, 0.8, 1.0],
  loop: [0.2, 0.7, 0.7, 1.0],
  code: [0.8, 0.3, 0.6, 1.0],
  pml: [0.5, 0.5, 0.9, 1.0],
  default: [0.4, 0.45, 0.55, 1.0],
};

function getServerFromTool(toolId: string): string {
  return toolId.split(':')[0] || 'default';
}

// API response types (snake_case from API)
interface ApiCapabilityNode {
  data: {
    id: string;
    type: 'capability';
    label: string;
    description?: string;
    hierarchy_level?: number;
    tools_used?: string[];
    parent?: string;
  };
}

interface ApiToolNode {
  data: {
    id: string;
    type: 'tool';
    label: string;
    server: string;
    parents: string[];
  };
}

interface ApiEdge {
  data: {
    source: string;
    target: string;
    edge_type: 'contains' | 'hierarchy' | 'sequence' | string;
  };
}

interface HypergraphResponse {
  nodes: Array<ApiCapabilityNode | ApiToolNode>;
  edges: ApiEdge[];
  capabilities_count: number;
  tools_count: number;
}

/**
 * Convert hypergraph API response to HexCell grid
 *
 * Hierarchy with parent-child relationships:
 * - Level 0: Meta-capabilities (hierarchy_level >= 1)
 * - Level 1: Leaf capabilities (children of meta-caps via "contains" edges)
 * - Level 2: Tools (children of leaf-caps via tools_used)
 */
function hypergraphToHexGrid(data: HypergraphResponse): HexCell[] {
  const cells: HexCell[] = [];

  // Build parent-child map from "contains" edges
  const childrenOf = new Map<string, string[]>(); // parent -> children IDs
  const parentOf = new Map<string, string>(); // child -> parent ID

  for (const edge of data.edges) {
    if (edge.data.edge_type === 'contains') {
      const parent = edge.data.source;
      const child = edge.data.target;
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(child);
      parentOf.set(child, parent);
    }
  }

  // Separate capabilities by hierarchy_level
  const metaCaps: ApiCapabilityNode[] = [];
  const leafCaps: ApiCapabilityNode[] = [];
  const toolsById = new Map<string, ApiToolNode>();

  for (const node of data.nodes) {
    if (node.data.type === 'capability') {
      const cap = node as ApiCapabilityNode;
      if (cap.data.hierarchy_level && cap.data.hierarchy_level >= 1) {
        metaCaps.push(cap);
      } else {
        leafCaps.push(cap);
      }
    } else if (node.data.type === 'tool') {
      const tool = node as ApiToolNode;
      toolsById.set(tool.data.id, tool);
    }
  }

  // Level 0: Meta-capabilities
  // Children = leaf-caps via "contains" edges OR tools via tools_used
  const level0Positions = hexSpiral(0, 0, Math.ceil(Math.sqrt(metaCaps.length)) || 1);
  for (let i = 0; i < metaCaps.length; i++) {
    const cap = metaCaps[i];
    const pos = level0Positions[i] || { q: i % 10, r: Math.floor(i / 10) };
    const toolIds = cap.data.tools_used || [];
    const containsChildren = childrenOf.get(cap.data.id) || [];
    const firstTool = toolIds[0] || '';
    const server = getServerFromTool(firstTool);

    cells.push({
      id: cap.data.id,
      q: pos.q,
      r: pos.r,
      level: 0,
      label: cap.data.label?.slice(0, 20) || cap.data.id.slice(0, 8),
      // Children: leaf-caps (via contains) or tools (via tools_used)
      children: containsChildren.length > 0 ? containsChildren : toolIds,
      color: SERVER_COLORS[server] || [0.3, 0.6, 0.8, 1.0],
    });
  }

  // Level 1: Leaf capabilities
  // Each has a parentId (meta-cap) and children (tools)
  const level1Positions = hexSpiral(0, 0, Math.ceil(Math.sqrt(leafCaps.length)) || 1);
  for (let i = 0; i < leafCaps.length; i++) {
    const cap = leafCaps[i];
    const pos = level1Positions[i] || { q: i % 10, r: Math.floor(i / 10) };
    const toolIds = cap.data.tools_used || [];
    const firstTool = toolIds[0] || '';
    const server = getServerFromTool(firstTool);
    const parent = parentOf.get(cap.data.id);

    cells.push({
      id: cap.data.id,
      q: pos.q,
      r: pos.r,
      level: 1,
      label: cap.data.label?.slice(0, 20) || cap.data.id.slice(0, 8),
      parentId: parent,
      children: toolIds,
      color: SERVER_COLORS[server] || SERVER_COLORS.default,
    });
  }

  // Level 2: Tools
  // Each has a parentId (the capability that uses it)
  const allTools = Array.from(toolsById.values());
  const level2Positions = hexSpiral(0, 0, Math.ceil(Math.sqrt(allTools.length)) || 1);
  for (let i = 0; i < allTools.length; i++) {
    const tool = allTools[i];
    const pos = level2Positions[i] || { q: i % 10, r: Math.floor(i / 10) };
    const server = tool.data.server || getServerFromTool(tool.data.id);
    // Parent = first capability that uses this tool
    const parent = tool.data.parents?.[0];

    cells.push({
      id: tool.data.id,
      q: pos.q,
      r: pos.r,
      level: 2,
      label: tool.data.label?.slice(0, 20) || tool.data.id.split(':').pop() || '',
      parentId: parent,
      color: SERVER_COLORS[server] || SERVER_COLORS.default,
    });
  }

  return cells;
}

function generateMockHive(): HexCell[] {
  const positions = hexSpiral(0, 0, 2);
  return positions.map((pos, i) => ({
    id: `mock-${i}`,
    q: pos.q,
    r: pos.r,
    level: 0,
    label: `Cell ${i}`,
    color: SERVER_COLORS.default,
  }));
}

function hexCellsToSidebarNodes(cells: HexCell[]): SidebarNode[] {
  return cells.map(c => ({
    id: c.id,
    label: c.label,
    level: c.level,
    parentId: c.parentId,
    children: c.children,
  }));
}

function App() {
  const [allCells, setAllCells] = useState<HexCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1); // zoom=1 -> level 0
  const [targetZoom, setTargetZoom] = useState<number | undefined>(undefined);
  const [focusedParentId, setFocusedParentId] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<HexCell | null>(null);
  const [lastClick, setLastClick] = useState<string>('(aucun)');
  const [terminalVisible, setTerminalVisible] = useState(true);
  const maxLevelRef = useRef(2); // 3 levels: meta-caps, caps, tools

  useEffect(() => {
    async function loadHypergraph() {
      try {
        // Try API first
        const apiUrl = `${API_BASE}/api/graph/hypergraph?include_tools=true`;
        console.log('[HexHive] Fetching hypergraph from:', apiUrl);

        const res = await fetch(apiUrl);
        if (res.ok) {
          const data: HypergraphResponse = await res.json();
          console.log('[HexHive] Received:', data.capabilities_count, 'capabilities,', data.tools_count, 'tools');
          const hexCells = hypergraphToHexGrid(data);

          setAllCells(hexCells);
          maxLevelRef.current = Math.max(0, ...hexCells.map(c => c.level));
          setMaxLevel(maxLevelRef.current);
        } else {
          // Fallback to traces.json
          console.warn('[HexHive] API failed, trying traces.json fallback');
          const fallbackRes = await fetch('/traces.json');
          if (fallbackRes.ok) {
            const data = await fallbackRes.json();
            // Simple fallback: treat as capabilities with tools
            const cells: HexCell[] = [];
            const caps = data.nodes?.capabilities || [];
            const positions = hexSpiral(0, 0, Math.ceil(Math.sqrt(caps.length)));

            for (let i = 0; i < caps.length; i++) {
              const cap = caps[i];
              const pos = positions[i] || { q: i % 10, r: Math.floor(i / 10) };
              const toolIds = cap.toolsUsed || [];
              const server = getServerFromTool(toolIds[0] || '');

              cells.push({
                id: cap.id,
                q: pos.q,
                r: pos.r,
                level: 0,
                label: cap.description?.slice(0, 20) || cap.id.slice(0, 8),
                children: toolIds.map((_: string, idx: number) => `${cap.id}:tool:${idx}`),
                color: SERVER_COLORS[server] || SERVER_COLORS.default,
              });

              const toolPositions = hexSpiral(0, 0, Math.ceil(Math.sqrt(toolIds.length)) || 1);
              for (let j = 0; j < toolIds.length; j++) {
                const toolId = toolIds[j];
                const toolPos = toolPositions[j] || { q: j % 5, r: Math.floor(j / 5) };
                const toolServer = getServerFromTool(toolId);
                cells.push({
                  id: `${cap.id}:tool:${j}`,
                  q: toolPos.q,
                  r: toolPos.r,
                  level: 1,
                  label: toolId.split(':').pop() || toolId,
                  parentId: cap.id,
                  color: SERVER_COLORS[toolServer] || SERVER_COLORS.default,
                });
              }
            }

            setAllCells(cells);
            maxLevelRef.current = Math.max(0, ...cells.map(c => c.level));
            setMaxLevel(maxLevelRef.current);
          } else {
            setAllCells(generateMockHive());
            setMaxLevel(0);
          }
        }
      } catch (err) {
        console.error('[HexHive] Failed to load data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load');
        setAllCells(generateMockHive());
        setMaxLevel(0);
      } finally {
        setLoading(false);
      }
    }
    loadHypergraph();
  }, []);

  // Filter cells based on current level and focused parent
  const currentLevelNum = zoomToLevel(zoomLevel, maxLevelRef.current);

  // Memoize level counts (avoid recalculating on every render)
  const levelCounts = { l0: 0, l1: 0, l2: 0 };
  for (const c of allCells) {
    if (c.level === 0) levelCounts.l0++;
    else if (c.level === 1) levelCounts.l1++;
    else if (c.level === 2) levelCounts.l2++;
  }

  // Filter by level AND parent (if drilling down)
  const visibleCells = allCells.filter(c => {
    if (c.level !== currentLevelNum) return false;
    // Level 0: always show all
    if (currentLevelNum === 0) return true;
    // Level 1+: if we have a focused parent, show only its children
    if (focusedParentId) {
      return c.parentId === focusedParentId;
    }
    // No parent focused: show all at this level
    return true;
  });

  const sidebarNodes = hexCellsToSidebarNodes(allCells);

  const handleZoomChange = (zoom: number) => {
    setZoomLevel(zoom);
    const newLevel = zoomToLevel(zoom, maxLevelRef.current);
    // If zooming back to level 0, clear parent filter
    if (newLevel === 0 && focusedParentId) {
      setFocusedParentId(null);
    }
    if (newLevel !== currentLevel.value) {
      navigateToLevel(newLevel);
    }
  };

  const handleCellClick = (cell: HexCell | null) => {
    if (cell) {
      setLastClick(cell.label);
      setFocusedCell(cell);
      // If cell has children, drill down into it
      if (cell.children && cell.children.length > 0) {
        setFocusedParentId(cell.id);
        const nextLevel = Math.min(cell.level + 1, maxLevelRef.current);
        setTargetZoom(levelToZoom(nextLevel));
        navigateToLevel(nextLevel, cell.id);
      }
    } else {
      setLastClick('(vide)');
    }
  };

  const handleNavigate = (level: number, nodeId?: string) => {
    navigateToLevel(level, nodeId);
    setTargetZoom(levelToZoom(level));
    if (nodeId) {
      const cell = allCells.find(c => c.id === nodeId);
      if (cell) setFocusedCell(cell);
    }
  };

  if (loading) {
    return (
      <main class="app-container">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' }}>
          <div>Chargement de l'hypergraphe...</div>
          <small style={{ marginTop: 8, opacity: 0.6 }}>{API_BASE}/api/graph/hypergraph</small>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main class="app-container">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#f66' }}>
          <div>Erreur: {error}</div>
          <small style={{ marginTop: 8, color: '#888' }}>Vérifiez que le serveur API est en cours d'exécution</small>
        </div>
      </main>
    );
  }

  return (
    <main class="app-container">
      <header class="app-header">
        <h1>🐝 Hex Hive</h1>
        <div class="zoom-indicator">
          Zoom: {(zoomLevel * 100).toFixed(0)}% | Niveau {currentLevelNum}/{maxLevelRef.current}
          {' | '}L0:{levelCounts.l0} L1:{levelCounts.l1} L2:{levelCounts.l2}
        </div>
      </header>
      <div class="main-content">
        <SlidingSidebar nodes={sidebarNodes} onNavigate={handleNavigate} />
        <div class="canvas-container">
          <HexCanvas
            cells={visibleCells}
            onZoomLevelChange={handleZoomChange}
            onCellClick={handleCellClick}
            targetZoom={targetZoom}
          />
        </div>
        {terminalVisible ? (
          <div class="terminal-panel">
            <div class="terminal-panel-header">
              <span>Terminal</span>
              <button onClick={() => setTerminalVisible(false)}>Hide</button>
            </div>
            <div class="terminal-panel-content">
              <TerminalPanel />
            </div>
          </div>
        ) : (
          <div class="terminal-collapsed" onClick={() => setTerminalVisible(true)}>
            Terminal
          </div>
        )}
      </div>
      <footer class="app-footer">
        <span>Visible: {visibleCells.length}</span>
        <span>L{currentLevelNum}/{maxLevelRef.current}</span>
        {focusedParentId && <span>Dans: {focusedCell?.label || focusedParentId.slice(0,8)}</span>}
        <span>Click: {lastClick}</span>
      </footer>
    </main>
  );
}

export default App;
