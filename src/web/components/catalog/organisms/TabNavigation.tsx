/**
 * TabNavigation - Tab bar for catalog sections
 *
 * Horizontal tab navigation for switching between:
 * - Components (UI components)
 * - Tools (MCP tools)
 * - Capabilities (Workflows)
 *
 * @module web/components/catalog/organisms/TabNavigation
 */

import { TabButton } from "../molecules/index.ts";

export type TabId = "components" | "tools" | "capabilities";

interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
  type: "components" | "tools" | "capabilities";
}

const TABS: TabConfig[] = [
  { id: "components", label: "Components", icon: "🎨", type: "components" },
  { id: "tools", label: "Tools", icon: "⚡", type: "tools" },
  { id: "capabilities", label: "Capabilities", icon: "🔗", type: "capabilities" },
];

interface TabNavigationProps {
  /** Currently active tab */
  activeTab: TabId;
  /** Tab change handler */
  onTabChange: (tab: TabId) => void;
  /** Count of items per tab */
  counts: {
    components: number;
    tools: number;
    capabilities: number;
  };
}

export default function TabNavigation({
  activeTab,
  onTabChange,
  counts,
}: TabNavigationProps) {
  return (
    <nav class="tab-navigation" role="tablist">
      <div class="tab-navigation__inner">
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            id={tab.id}
            label={tab.label}
            icon={tab.icon}
            count={counts[tab.id]}
            isActive={activeTab === tab.id}
            type={tab.type}
            onClick={() => onTabChange(tab.id)}
          />
        ))}
      </div>

      {/* Active indicator line */}
      <div
        class="tab-navigation__indicator"
        style={{
          transform: `translateX(${TABS.findIndex((t) => t.id === activeTab) * 100}%)`,
        }}
      />

      <style>
        {`
          .tab-navigation {
            display: flex;
            justify-content: center;
            padding: 4px;
            margin: 1.5rem auto;
            max-width: fit-content;
            background: #0c0c0e;
            border: 1px solid rgba(255, 184, 111, 0.08);
            border-radius: 12px;
            position: relative;
          }

          .tab-navigation__inner {
            display: flex;
            gap: 4px;
            position: relative;
            z-index: 1;
          }

          /* Subtle glow on hover */
          .tab-navigation::before {
            content: '';
            position: absolute;
            inset: -1px;
            border-radius: 13px;
            background: linear-gradient(
              135deg,
              rgba(255, 184, 111, 0.05) 0%,
              transparent 50%,
              rgba(78, 205, 196, 0.05) 100%
            );
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
          }

          .tab-navigation:hover::before {
            opacity: 1;
          }

          @media (max-width: 640px) {
            .tab-navigation {
              width: calc(100% - 2rem);
              margin: 1rem;
            }

            .tab-navigation__inner {
              width: 100%;
              justify-content: space-between;
            }
          }
        `}
      </style>
    </nav>
  );
}
