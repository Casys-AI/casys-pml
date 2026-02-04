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
  transition: PhaseTransition;
  onDismiss: () => void;
}

export function PhaseTransitionBanner({
  transition,
  onDismiss,
}: PhaseTransitionBannerProps) {
  useEffect(() => {
    if (!transition.detected) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 10000);
    return () => clearTimeout(timer);
  }, [transition.detected, onDismiss]);

  if (!transition.detected) return null;

  const isExpansion = transition.type === "expansion";
  const icon = isExpansion ? "🌱" : "🔮";

  return (
    <div
      class={`p-3 rounded-lg mb-4 flex items-center justify-between animate-pulse border ${
        isExpansion
          ? "bg-green-400/15 border-green-400/30"
          : "bg-pml-accent/15 border-pml-accent/30"
      }`}
    >
      <div class="flex items-center gap-2">
        <span class="text-lg">{icon}</span>
        <div>
          <div class="font-semibold text-sm text-stone-100">
            Phase Transition:{" "}
            {transition.type.charAt(0).toUpperCase() + transition.type.slice(1)}
          </div>
          <div class="text-xs text-stone-400">
            {transition.description} ({(transition.confidence * 100).toFixed(0)}
            % confidence)
          </div>
        </div>
      </div>
      <button
        type="button"
        class="p-1 rounded hover:bg-white/10 transition-colors text-stone-500"
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}

export default PhaseTransitionBanner;
