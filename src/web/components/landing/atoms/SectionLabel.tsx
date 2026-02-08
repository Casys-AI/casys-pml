/**
 * SectionLabel - Eyebrow text for sections
 *
 * Small uppercase label that introduces a section.
 *
 * @module web/components/landing/atoms/SectionLabel
 */

interface SectionLabelProps {
  children: string;
}

export function SectionLabel({ children }: SectionLabelProps) {
  return (
    <span class="inline-block font-mono text-[0.7rem] font-medium text-pml-accent uppercase tracking-widest px-4 py-2 bg-amber-500/10 rounded mb-6">
      {children}
    </span>
  );
}
