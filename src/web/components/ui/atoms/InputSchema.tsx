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
      <div class={`font-mono text-xs p-4 text-center ${className || ""}`}>
        <span class="text-stone-500 italic">No parameters required</span>
      </div>
    );
  }

  return (
    <div class={`font-mono text-xs ${className || ""}`}>
      <div class="flex flex-col">
        {propEntries.map(([name, prop]) => (
          <div key={name} class="px-4 py-3 border-b border-green-500/[0.06] last:border-b-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-green-400 font-semibold">{name}</span>
              {required.has(name) && (
                <span class="text-[0.625rem] px-1.5 py-0.5 bg-orange-400/15 text-orange-400 rounded-[3px] uppercase tracking-wide">required</span>
              )}
            </div>
            <div class="flex items-center gap-3 text-stone-500">
              <span class="text-violet-400">{prop.type}</span>
              {prop.examples?.[0] !== undefined && (
                <span class="text-stone-500 italic">
                  e.g. {formatExample(prop.examples[0])}
                </span>
              )}
            </div>
            {prop.description && (
              <div class="mt-1.5 text-stone-400 text-[0.6875rem] leading-snug">{prop.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
