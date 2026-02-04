/**
 * CodeBlock Atom - Syntax highlighted code display
 * Uses simple regex-based highlighting for TypeScript/JavaScript
 */

interface CodeBlockProps {
  code: string;
  language?: "typescript" | "javascript";
  class?: string;
}

/**
 * Simple syntax highlighter for TypeScript/JavaScript
 * Highlights: keywords, strings, comments, numbers, functions
 */
function highlightCode(code: string): string {
  // Escape HTML first
  let highlighted = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Comments (single line)
  highlighted = highlighted.replace(
    /(\/\/.*$)/gm,
    '<span class="text-slate-500 italic">$1</span>'
  );

  // Strings (double quotes, single quotes, template literals)
  highlighted = highlighted.replace(
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
    '<span class="text-lime-300">$1</span>'
  );

  // Keywords
  const keywords = [
    "const", "let", "var", "function", "async", "await", "return",
    "if", "else", "for", "while", "do", "switch", "case", "break",
    "continue", "try", "catch", "finally", "throw", "new", "class",
    "extends", "import", "export", "from", "default", "typeof",
    "instanceof", "in", "of", "true", "false", "null", "undefined"
  ];
  const keywordPattern = new RegExp(`\\b(${keywords.join("|")})\\b`, "g");
  highlighted = highlighted.replace(
    keywordPattern,
    '<span class="text-violet-400 font-medium">$1</span>'
  );

  // Numbers
  highlighted = highlighted.replace(
    /\b(\d+\.?\d*)\b/g,
    '<span class="text-orange-400">$1</span>'
  );

  // Function calls (word followed by parenthesis)
  highlighted = highlighted.replace(
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    '<span class="text-blue-400">$1</span>('
  );

  // MCP namespace (mcp.xxx.xxx)
  highlighted = highlighted.replace(
    /\b(mcp)\.([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
    '<span class="text-amber-300 font-semibold">$1</span>.<span class="text-cyan-300">$2</span>.<span class="text-blue-400">$3</span>'
  );

  return highlighted;
}

export default function CodeBlock({ code, class: className }: CodeBlockProps) {
  const highlightedCode = highlightCode(code);

  return (
    <div class={`bg-stone-950 rounded-lg overflow-hidden [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-amber-500/20 [&::-webkit-scrollbar-thumb]:rounded ${className || ""}`}>
      <pre class="m-0 p-5 overflow-x-auto font-mono text-[0.8125rem] leading-[1.7] text-stone-400">
        <code class="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
      </pre>
    </div>
  );
}
