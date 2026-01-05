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
    '<span class="code-comment">$1</span>'
  );

  // Strings (double quotes, single quotes, template literals)
  highlighted = highlighted.replace(
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
    '<span class="code-string">$1</span>'
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
    '<span class="code-keyword">$1</span>'
  );

  // Numbers
  highlighted = highlighted.replace(
    /\b(\d+\.?\d*)\b/g,
    '<span class="code-number">$1</span>'
  );

  // Function calls (word followed by parenthesis)
  highlighted = highlighted.replace(
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    '<span class="code-function">$1</span>('
  );

  // MCP namespace (mcp.xxx.xxx)
  highlighted = highlighted.replace(
    /\b(mcp)\.([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
    '<span class="code-mcp">$1</span>.<span class="code-namespace">$2</span>.<span class="code-function">$3</span>'
  );

  return highlighted;
}

export default function CodeBlock({ code, class: className }: CodeBlockProps) {
  const highlightedCode = highlightCode(code);

  return (
    <div class={`code-block ${className || ""}`}>
      <pre class="code-pre">
        <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
      </pre>

      <style>
        {`
        .code-block {
          background: #0d0d10;
          border-radius: 8px;
          overflow: hidden;
        }

        .code-pre {
          margin: 0;
          padding: 1.25rem;
          overflow-x: auto;
          font-family: 'Geist Mono', monospace;
          font-size: 0.8125rem;
          line-height: 1.7;
          color: #a8a29e;
        }

        .code-pre code {
          white-space: pre-wrap;
          word-break: break-word;
        }

        .code-keyword {
          color: #c792ea;
          font-weight: 500;
        }

        .code-string {
          color: #c3e88d;
        }

        .code-comment {
          color: #546e7a;
          font-style: italic;
        }

        .code-number {
          color: #f78c6c;
        }

        .code-function {
          color: #82aaff;
        }

        .code-mcp {
          color: #ffcb6b;
          font-weight: 600;
        }

        .code-namespace {
          color: #89ddff;
        }

        .code-block::-webkit-scrollbar {
          height: 6px;
        }

        .code-block::-webkit-scrollbar-track {
          background: transparent;
        }

        .code-block::-webkit-scrollbar-thumb {
          background: rgba(255, 184, 111, 0.2);
          border-radius: 3px;
        }
        `}
      </style>
    </div>
  );
}
