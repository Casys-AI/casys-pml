/**
 * DemoSelector - Barre de sélection des use-cases
 *
 * Groupe de DemoPills pour naviguer entre les démos.
 *
 * @module web/components/landing-v2/molecules/DemoSelector
 */

import { DemoPill } from "../atoms/DemoPill.tsx";

export interface DemoOption {
  id: string;
  icon: string;
  label: string;
}

interface DemoSelectorProps {
  demos: DemoOption[];
  activeIndex: number;
  onSelect: (index: number) => void;
  class?: string;
}

export function DemoSelector({
  demos,
  activeIndex,
  onSelect,
  class: className = "",
}: DemoSelectorProps) {
  return (
    <div
      class={`
        flex items-center gap-1
        p-2
        bg-white/[0.02]
        border-t border-white/[0.06]
        ${className}
      `.trim()}
    >
      {demos.map((demo, i) => (
        <DemoPill
          key={demo.id}
          icon={demo.icon}
          label={demo.label}
          isActive={i === activeIndex}
          onClick={() => onSelect(i)}
        />
      ))}
    </div>
  );
}
