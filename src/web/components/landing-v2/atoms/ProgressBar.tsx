/**
 * ProgressBar - Barre de progression animée
 *
 * Affiche une progression avec pourcentage et label optionnel.
 *
 * @module web/components/landing-v2/atoms/ProgressBar
 */

interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
  showPercent?: boolean;
  variant?: "default" | "success";
  class?: string;
}

export function ProgressBar({
  progress,
  label,
  showPercent = true,
  variant = "default",
  class: className = "",
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const isComplete = clampedProgress >= 100;
  const fillColor = variant === "success" || isComplete ? "bg-green-500" : "bg-pml-accent";

  return (
    <div class={`w-full ${className}`}>
      {/* Bar container */}
      <div class="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
        {/* Fill */}
        <div
          class={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out ${fillColor}`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>

      {/* Label row */}
      {(label || showPercent) && (
        <div class="flex justify-between items-center mt-1.5">
          {label && (
            <span class="font-sans text-[0.7rem] text-stone-500">{label}</span>
          )}
          {showPercent && (
            <span class={`font-mono text-[0.7rem] ${isComplete ? "text-green-400" : "text-stone-400"}`}>
              {isComplete ? "Complete ✓" : `${clampedProgress}%`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
