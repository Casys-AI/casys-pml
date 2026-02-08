/**
 * SchemaViewer - JSON Schema visualization component
 *
 * Displays input schema properties with types, descriptions,
 * enums, defaults, and nested structures.
 *
 * @module web/components/shared/SchemaViewer
 */

import { useState } from "preact/hooks";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SchemaProperty {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  oneOf?: SchemaProperty[];
  anyOf?: SchemaProperty[];
}

interface SchemaViewerProps {
  schema: Record<string, unknown>;
}

interface PropertyRowProps {
  name: string;
  property: SchemaProperty;
  required: boolean;
  depth?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getTypeLabel(property: SchemaProperty): string {
  if (property.oneOf || property.anyOf) {
    return "union";
  }
  if (property.type === "array") {
    const itemType = property.items?.type || "any";
    return `${itemType}[]`;
  }
  return property.type || "any";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROPERTY ROW COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PropertyRow({ name, property, required, depth = 0 }: PropertyRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasNested =
    property.properties ||
    property.items?.properties ||
    property.oneOf ||
    property.anyOf;

  const typeLabel = getTypeLabel(property);

  return (
    <div class="schema-prop-row" style={{ "--depth": depth } as any}>
      <div class="schema-prop-main">
        <div class="schema-prop-left">
          {hasNested && (
            <button
              type="button"
              class={`schema-prop-expand ${expanded ? "open" : ""}`}
              onClick={() => setExpanded(!expanded)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12">
                <path strokeWidth="2" strokeLinecap="round" d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
          <code class="schema-prop-name">{name}</code>
          {required && <span class="schema-prop-req">*</span>}
        </div>
        <div class="schema-prop-right">
          {property.enum && <span class="schema-prop-enum-badge">enum</span>}
          <span class="schema-prop-type">{typeLabel}</span>
        </div>
      </div>

      {property.description && (
        <p class="schema-prop-desc">{property.description}</p>
      )}

      {property.enum && property.enum.length <= 6 && (
        <div class="schema-prop-enum-vals">
          {property.enum.map((v, i) => (
            <code key={i} class="schema-prop-enum-val">{JSON.stringify(v)}</code>
          ))}
        </div>
      )}

      {property.default !== undefined && (
        <div class="schema-prop-default">
          default: <code>{JSON.stringify(property.default)}</code>
        </div>
      )}

      {expanded && hasNested && (
        <div class="schema-prop-nested">
          {property.properties &&
            Object.entries(property.properties).map(([n, p]) => (
              <PropertyRow
                key={n}
                name={n}
                property={p}
                required={(property.required || []).includes(n)}
                depth={depth + 1}
              />
            ))}
          {property.items?.properties &&
            Object.entries(property.items.properties).map(([n, p]) => (
              <PropertyRow
                key={n}
                name={`[].${n}`}
                property={p}
                required={(property.items?.required || []).includes(n)}
                depth={depth + 1}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function SchemaViewer({ schema }: SchemaViewerProps) {
  const properties = (schema.properties || {}) as Record<string, SchemaProperty>;
  const required = (schema.required || []) as string[];

  if (Object.keys(properties).length === 0) {
    return <div class="schema-empty">No parameters</div>;
  }

  return (
    <>
      <div class="schema-props">
        {Object.entries(properties).map(([name, prop]) => (
          <PropertyRow
            key={name}
            name={name}
            property={prop}
            required={required.includes(name)}
          />
        ))}
      </div>

      <style>
        {`
        .schema-props {
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: rgba(255, 184, 111, 0.03);
          border-radius: 6px;
          overflow: hidden;
        }

        .schema-empty {
          padding: 1rem;
          text-align: center;
          font-size: 0.75rem;
          color: #6b6560;
          background: rgba(255, 184, 111, 0.02);
          border-radius: 6px;
        }

        .schema-prop-row {
          background: #141418;
          padding: 0.5rem 0.75rem;
          padding-left: calc(0.75rem + var(--depth, 0) * 1rem);
        }

        .schema-prop-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .schema-prop-left {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          min-width: 0;
        }

        .schema-prop-expand {
          width: 16px;
          height: 16px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          cursor: pointer;
          color: #6b6560;
          transition: transform 0.12s, color 0.12s;
          flex-shrink: 0;
        }

        .schema-prop-expand:hover {
          color: #FFB86F;
        }

        .schema-prop-expand.open {
          transform: rotate(90deg);
        }

        .schema-prop-name {
          font-family: 'Geist Mono', monospace;
          font-size: 0.75rem;
          font-weight: 500;
          color: #f0ede8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .schema-prop-req {
          color: #f87171;
          font-weight: 600;
          font-size: 0.75rem;
        }

        .schema-prop-right {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          flex-shrink: 0;
        }

        .schema-prop-enum-badge {
          font-size: 0.5625rem;
          font-weight: 500;
          text-transform: uppercase;
          padding: 0.0625rem 0.25rem;
          background: rgba(74, 222, 128, 0.1);
          color: #4ade80;
          border-radius: 2px;
        }

        .schema-prop-type {
          font-family: 'Geist Mono', monospace;
          font-size: 0.625rem;
          color: #FFB86F;
          background: rgba(255, 184, 111, 0.06);
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
        }

        .schema-prop-desc {
          margin-top: 0.25rem;
          font-size: 0.6875rem;
          line-height: 1.4;
          color: #6b6560;
        }

        .schema-prop-enum-vals {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
          margin-top: 0.25rem;
        }

        .schema-prop-enum-val {
          font-family: 'Geist Mono', monospace;
          font-size: 0.5625rem;
          padding: 0.0625rem 0.25rem;
          background: rgba(74, 222, 128, 0.06);
          color: #4ade80;
          border-radius: 2px;
        }

        .schema-prop-default {
          margin-top: 0.25rem;
          font-size: 0.625rem;
          color: #6b6560;
        }

        .schema-prop-default code {
          font-family: 'Geist Mono', monospace;
          color: #60a5fa;
        }

        .schema-prop-nested {
          margin: 0.375rem -0.75rem -0.5rem;
          border-top: 1px solid rgba(255, 184, 111, 0.03);
        }
        `}
      </style>
    </>
  );
}
