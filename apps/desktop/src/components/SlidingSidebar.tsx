/**
 * SlidingSidebar - Hierarchical navigation sidebar
 * Simplified version without excessive inline styles
 */

import { useState } from 'preact/hooks';
import { currentLevel, focusedNodeId, zoomOut } from '../stores/navigation';

export interface SidebarNode {
  id: string;
  label: string;
  level: number;
  parentId?: string;
  children?: string[];
}

interface SlidingSidebarProps {
  nodes: SidebarNode[];
  onNavigate: (level: number, nodeId?: string) => void;
}

export function SlidingSidebar({ nodes, onNavigate }: SlidingSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Read signal values
  const level = currentLevel.value;
  const focusedId = focusedNodeId.value;

  // Filter to visible window
  const visibleNodes = nodes.filter(
    (n) => n.level >= level - 1 && n.level <= level + 1
  );

  // Find parent for breadcrumb
  const findParent = (): SidebarNode | null => {
    if (focusedId) {
      const focused = nodes.find((n) => n.id === focusedId);
      if (focused?.parentId) {
        return nodes.find((n) => n.id === focused.parentId) || null;
      }
    }
    const currentNodes = nodes.filter((n) => n.level === level);
    if (currentNodes[0]?.parentId) {
      return nodes.find((n) => n.id === currentNodes[0].parentId) || null;
    }
    return null;
  };

  const parentNode = level > 0 ? findParent() : null;

  const handleZoomOut = () => {
    zoomOut();
    onNavigate(level - 1);
  };

  if (collapsed) {
    return (
      <div
        class="sidebar-collapsed"
        onClick={() => setCollapsed(false)}
      >
        ▶
      </div>
    );
  }

  return (
    <div class="sliding-sidebar">
      <div class="sidebar-header">
        <span>Hierarchy</span>
        <button onClick={() => setCollapsed(true)}>◀</button>
      </div>

      {parentNode && (
        <div class="sidebar-breadcrumb" onClick={handleZoomOut}>
          ← {parentNode.label}
        </div>
      )}

      <div class="sidebar-level">Level {level}</div>

      <div class="sidebar-content">
        {visibleNodes.map((node) => (
          <div
            key={node.id}
            class={`sidebar-node ${focusedId === node.id ? 'focused' : ''} ${node.level !== level ? 'muted' : ''}`}
            onClick={() => onNavigate(node.level, node.id)}
          >
            {node.children?.length ? '📁' : '○'} {node.label}
          </div>
        ))}
      </div>

      <div class="sidebar-footer">
        {nodes.filter((n) => n.level === level).length} nodes
      </div>
    </div>
  );
}
