/**
 * PhaseTransitionBanner - Displays phase transition alerts
 *
 * Shows expansion/consolidation phase transitions detected by SYMBIOSIS/ODI
 * analysis. Auto-dismisses after 10 seconds per AC10.
 *
 * @module web/components/ui/molecules/PhaseTransitionBanner
 */

import { useEffect } from "preact/hooks";
import type { PhaseTransition } from "../../../../shared/emergence.types.ts";

interface PhaseTransitionBannerProps {
  /** Phase transition data */
  transition: PhaseTransition;
  /** Callback when dismissed (manual or auto) */
  onDismiss: () => void;
}

/**
 * Animated banner for phase transition alerts
 * Auto-dismisses after 10 seconds
 */
export function PhaseTransitionBanner({
  transition,
  onDismiss,
}: PhaseTransitionBannerProps) {
  // Auto-dismiss after 10 seconds (AC10)
  useEffect(() => {
    if (!transition.detected) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 10000);
    return () => clearTimeout(timer);
  }, [transition.detected, onDismiss]);

  if (!transition.detected) return null;

  const bgColor =
    transition.type === "expansion"
      ? "rgba(74, 222, 128, 0.15)"
      : "rgba(251, 191, 36, 0.15)";
  const borderColor =
    transition.type === "expansion"
      ? "rgba(74, 222, 128, 0.3)"
      : "rgba(251, 191, 36, 0.3)";
  const icon = transition.type === "expansion" ? "🌱" : "🔮";

  return (
    <div
      class="p-3 rounded-lg mb-4 flex items-center justify-between animate-pulse"
      style={{ background: bgColor, border: `1px solid ${borderColor}` }}
    >
      <div class="flex items-center gap-2">
        <span class="text-lg">{icon}</span>
        <div>
          <div class="font-semibold text-sm" style={{ color: "var(--text)" }}>
            Phase Transition:{" "}
            {transition.type.charAt(0).toUpperCase() + transition.type.slice(1)}
          </div>
          <div class="text-xs" style={{ color: "var(--text-muted)" }}>
            {transition.description} ({(transition.confidence * 100).toFixed(0)}
            % confidence)
          </div>
        </div>
      </div>
      <button
        type="button"
        class="p-1 rounded hover:bg-white/10 transition-colors"
        style={{ color: "var(--text-dim)" }}
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}

export default PhaseTransitionBanner;
