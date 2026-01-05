/**
 * InputSchema Atom - Display capability input parameters
 * Shows property names, types, required status, and examples
 */

interface SchemaProperty {
  type: string;
  examples?: unknown[];
  description?: string;
}

interface InputSchemaProps {
  schema: {
    type: string;
    properties?: Record<string, SchemaProperty>;
    required?: string[];
  };
  class?: string;
}

/** Format example value for display */
function formatExample(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

export default function InputSchema({ schema, class: className }: InputSchemaProps) {
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);
  const propEntries = Object.entries(properties);

  if (propEntries.length === 0) {
    return (
      <div class={`input-schema empty ${className || ""}`}>
        <span class="input-schema-empty">No parameters required</span>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div class={`input-schema ${className || ""}`}>
      <div class="input-schema-list">
        {propEntries.map(([name, prop]) => (
          <div key={name} class="input-schema-prop">
            <div class="input-schema-header">
              <span class="input-schema-name">{name}</span>
              {required.has(name) && (
                <span class="input-schema-required">required</span>
              )}
            </div>
            <div class="input-schema-meta">
              <span class="input-schema-type">{prop.type}</span>
              {prop.examples?.[0] !== undefined && (
                <span class="input-schema-example">
                  e.g. {formatExample(prop.examples[0])}
                </span>
              )}
            </div>
            {prop.description && (
              <div class="input-schema-desc">{prop.description}</div>
            )}
          </div>
        ))}
      </div>
      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .input-schema {
    font-family: 'Geist Mono', monospace;
    font-size: 0.75rem;
  }

  .input-schema.empty {
    padding: 1rem;
    text-align: center;
  }

  .input-schema-empty {
    color: #6b6560;
    font-style: italic;
  }

  .input-schema-list {
    display: flex;
    flex-direction: column;
  }

  .input-schema-prop {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(74, 222, 128, 0.06);
  }

  .input-schema-prop:last-child {
    border-bottom: none;
  }

  .input-schema-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .input-schema-name {
    color: #4ade80;
    font-weight: 600;
  }

  .input-schema-required {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: rgba(251, 146, 60, 0.15);
    color: #fb923c;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .input-schema-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: #6b6560;
  }

  .input-schema-type {
    color: #a78bfa;
  }

  .input-schema-example {
    color: #6b6560;
    font-style: italic;
  }

  .input-schema-desc {
    margin-top: 0.375rem;
    color: #a8a29e;
    font-size: 0.6875rem;
    line-height: 1.4;
  }
`;
