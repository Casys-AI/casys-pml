/**
 * MetricsRow - Groupe de métriques côte à côte
 *
 * Affiche plusieurs MetricBox dans une rangée.
 *
 * @module web/components/landing-v2/molecules/MetricsRow
 */

import { MetricBox } from "../atoms/MetricBox.tsx";

interface Metric {
  value: string;
  label: string;
  variant?: "default" | "success" | "warning" | "accent";
}

interface MetricsRowProps {
  metrics: Metric[];
  class?: string;
}

export function MetricsRow({ metrics, class: className = "" }: MetricsRowProps) {
  return (
    <div class={`flex gap-3 ${className}`}>
      {metrics.map((metric, i) => (
        <MetricBox
          key={i}
          value={metric.value}
          label={metric.label}
          variant={metric.variant}
          class="flex-1"
        />
      ))}
    </div>
  );
}
