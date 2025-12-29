/**
 * TimelineSeparator - Atomic component for timeline period dividers
 *
 * Displays a horizontal line with a centered label indicating a time period.
 * Used in CapabilityTimeline to separate capabilities by recency.
 *
 * @module web/components/ui/atoms/TimelineSeparator
 */

interface TimelineSeparatorProps {
  /** Label to display (e.g., "Aujourd'hui", "Cette semaine") */
  label: string;
  /** Optional additional CSS classes */
  class?: string;
}

export function TimelineSeparator({ label, class: className = "" }: TimelineSeparatorProps) {
  return (
    <div
      class={`flex items-center gap-3 py-4 px-2 sticky top-0 z-10 ${className}`}
      style={{ background: "var(--bg, #0a0908)" }}
    >
      <div
        class="h-px flex-1"
        style={{
          background:
            "linear-gradient(to right, transparent, var(--border, #3a3631) 30%, var(--border, #3a3631))",
        }}
      />
      <span
        class="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap uppercase tracking-wide"
        style={{
          background: "var(--bg-elevated, #12110f)",
          color: "var(--text-muted, #8a8078)",
          border: "1px solid var(--border, #3a3631)",
        }}
      >
        {label}
      </span>
      <div
        class="h-px flex-1"
        style={{
          background:
            "linear-gradient(to left, transparent, var(--border, #3a3631) 30%, var(--border, #3a3631))",
        }}
      />
    </div>
  );
}
