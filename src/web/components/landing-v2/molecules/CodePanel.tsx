/**
 * CodePanel - Panel de code avec syntax highlighting
 *
 * Affiche le code MCP workflow de façon lisible.
 * Utilisé sur le "dos" du flip animation.
 *
 * @module web/components/landing-v2/molecules/CodePanel
 */

interface CodePanelProps {
  code: string;
  tools?: string[];
  class?: string;
}

/**
 * Simple syntax highlighter for TypeScript
 */
function highlightCode(code: string): string {
  return code
    .replace(/`([^`]*)`/g, '<span class="hl-str">`$1`</span>')
    .replace(/"([^"]*)"/g, '<span class="hl-str">"$1"</span>')
    .replace(/'([^']*)'/g, "<span class=\"hl-str\">'$1'</span>")
    .replace(/\b(const|let|var|await|async|return|for|if|of|in)\b/g, '<span class="hl-kw">$1</span>')
    .replace(/(\w+)\s*\(/g, '<span class="hl-fn">$1</span>(')
    .replace(/(\w+):/g, '<span class="hl-key">$1</span>:')
    .replace(/\b(\d+)\b/g, '<span class="hl-num">$1</span>')
    .replace(/(\/\/.*)/g, '<span class="hl-cm">$1</span>');
}

export function CodePanel({ code, tools = [], class: className = "" }: CodePanelProps) {
  const highlightedCode = highlightCode(code);

  return (
    <div class={`flex flex-col h-full bg-[#050506] ${className}`}>
      {/* Header */}
      <div class="flex items-center justify-between px-3 py-2 bg-[#0c0c0e] border-b border-white/[0.06]">
        <span class="font-mono text-[0.6rem] text-stone-500">workflow.ts</span>
        <span class="font-mono text-[0.55rem] text-stone-600">MCP Workflow</span>
      </div>

      {/* Code */}
      <pre class="flex-1 overflow-auto p-3 m-0">
        <code
          class="font-mono text-[0.6rem] leading-relaxed text-stone-400"
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>

      {/* Tools used */}
      {tools.length > 0 && (
        <div class="flex flex-wrap gap-1.5 px-3 py-2 bg-[#08080a] border-t border-white/[0.06]">
          {tools.map((tool) => (
            <span
              key={tool}
              class="inline-flex items-center gap-1 font-mono text-[0.5rem] text-stone-500 bg-pml-accent/10 px-1.5 py-0.5 rounded border border-pml-accent/15"
            >
              <span class="text-green-400">✓</span>
              {tool}
            </span>
          ))}
        </div>
      )}

      {/* Syntax highlighting styles */}
      <style>
        {`
          .hl-kw { color: #c792ea; }
          .hl-fn { color: #82aaff; }
          .hl-str { color: #c3e88d; }
          .hl-key { color: #ffcb6b; }
          .hl-num { color: #f78c6c; }
          .hl-cm { color: #6a9955; font-style: italic; }
        `}
      </style>
    </div>
  );
}
