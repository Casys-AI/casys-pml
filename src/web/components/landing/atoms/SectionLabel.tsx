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
    <span class="section-label">
      {children}
      <style>
        {`
        .section-label {
          display: inline-block;
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          font-weight: 500;
          color: #FFB86F;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          padding: 0.5rem 1rem;
          background: rgba(255, 184, 111, 0.1);
          border-radius: 4px;
          margin-bottom: 1.5rem;
        }
        `}
      </style>
    </span>
  );
}
