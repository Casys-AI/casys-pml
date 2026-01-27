import { useState } from 'preact/hooks';
import { GraphCanvas } from './components/GraphCanvas';
import type { GraphNode, GraphEdge } from './types';
import './App.css';

// Test data: 15 nodes with random positions
const testNodes: GraphNode[] = [
  { id: '1', x: 150, y: 120, label: 'Node A', color: [0.3, 0.6, 0.9, 1.0] },
  { id: '2', x: 280, y: 180, label: 'Node B', color: [0.9, 0.4, 0.3, 1.0] },
  { id: '3', x: 420, y: 150, label: 'Node C', color: [0.3, 0.8, 0.4, 1.0] },
  { id: '4', x: 550, y: 220, label: 'Node D', color: [0.8, 0.6, 0.2, 1.0] },
  { id: '5', x: 200, y: 300, label: 'Node E', color: [0.6, 0.3, 0.8, 1.0] },
  { id: '6', x: 350, y: 350, label: 'Node F', color: [0.2, 0.7, 0.7, 1.0] },
  { id: '7', x: 480, y: 320, label: 'Node G', color: [0.9, 0.5, 0.6, 1.0] },
  { id: '8', x: 620, y: 380, label: 'Node H', color: [0.4, 0.5, 0.9, 1.0] },
  { id: '9', x: 130, y: 420, label: 'Node I', color: [0.7, 0.8, 0.3, 1.0] },
  { id: '10', x: 300, y: 480, label: 'Node J', color: [0.5, 0.4, 0.7, 1.0] },
  { id: '11', x: 450, y: 450, label: 'Node K', color: [0.8, 0.3, 0.5, 1.0] },
  { id: '12', x: 580, y: 500, label: 'Node L', color: [0.3, 0.9, 0.6, 1.0] },
  { id: '13', x: 700, y: 280, label: 'Node M', color: [0.6, 0.6, 0.4, 1.0] },
  { id: '14', x: 380, y: 80, label: 'Node N', color: [0.4, 0.8, 0.8, 1.0] },
  { id: '15', x: 520, y: 550, label: 'Node O', color: [0.9, 0.7, 0.4, 1.0] },
];

// Test edges connecting nodes
const testEdges: GraphEdge[] = [
  { id: 'e1', source: '1', target: '2' },
  { id: 'e2', source: '2', target: '3' },
  { id: 'e3', source: '3', target: '4' },
  { id: 'e4', source: '1', target: '5' },
  { id: 'e5', source: '5', target: '6' },
  { id: 'e6', source: '6', target: '7' },
  { id: 'e7', source: '7', target: '8' },
  { id: 'e8', source: '5', target: '9' },
  { id: 'e9', source: '9', target: '10' },
  { id: 'e10', source: '10', target: '11' },
  { id: 'e11', source: '11', target: '12' },
  { id: 'e12', source: '4', target: '13' },
  { id: 'e13', source: '3', target: '14' },
  { id: 'e14', source: '6', target: '11' },
  { id: 'e15', source: '2', target: '6' },
  { id: 'e16', source: '7', target: '13' },
  { id: 'e17', source: '12', target: '15' },
  { id: 'e18', source: '11', target: '15' },
];

function App() {
  const [zoomLevel, setZoomLevel] = useState(1);

  return (
    <main class="app-container">
      <header class="app-header">
        <h1>PML Graph Visualizer</h1>
        <div class="zoom-indicator">
          Zoom: {(zoomLevel * 100).toFixed(0)}%
        </div>
      </header>
      <div class="canvas-container">
        <GraphCanvas
          nodes={testNodes}
          edges={testEdges}
          onZoomLevelChange={setZoomLevel}
        />
      </div>
      <footer class="app-footer">
        <span>Nodes: {testNodes.length}</span>
        <span>Edges: {testEdges.length}</span>
        <span class="hint">Scroll to zoom, drag to pan</span>
      </footer>
    </main>
  );
}

export default App;
