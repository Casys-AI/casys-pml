import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

function highlightCode(code: string): preact.JSX.Element[] {
  const lines = code.split("\n");

  return lines.map((line, lineIndex) => {
    const elements: preact.JSX.Element[] = [];
    let remaining = line;
    let key = 0;

    while (remaining.length > 0) {
      const commentMatch = remaining.match(/^(\/\/.*)/);
      if (commentMatch) {
        elements.push(<span key={key++} class="text-stone-500 italic">{commentMatch[1]}</span>);
        remaining = remaining.slice(commentMatch[1].length);
        continue;
      }

      const doubleStringMatch = remaining.match(/^("[^"]*")/);
      if (doubleStringMatch) {
        elements.push(<span key={key++} class="text-green-300">{doubleStringMatch[1]}</span>);
        remaining = remaining.slice(doubleStringMatch[1].length);
        continue;
      }

      const singleStringMatch = remaining.match(/^('[^']*')/);
      if (singleStringMatch) {
        elements.push(<span key={key++} class="text-green-300">{singleStringMatch[1]}</span>);
        remaining = remaining.slice(singleStringMatch[1].length);
        continue;
      }

      const templateMatch = remaining.match(/^(`[^`]*`)/);
      if (templateMatch) {
        elements.push(<span key={key++} class="text-green-300">{templateMatch[1]}</span>);
        remaining = remaining.slice(templateMatch[1].length);
        continue;
      }

      const keywordMatch = remaining.match(
        /^(await|async|const|let|var|return|function|if|else|for|while|new|import|export|from|class|extends|type|interface)\b/,
      );
      if (keywordMatch) {
        elements.push(<span key={key++} class="text-purple-400 font-medium">{keywordMatch[1]}</span>);
        remaining = remaining.slice(keywordMatch[1].length);
        continue;
      }

      const builtinMatch = remaining.match(/^(true|false|null|undefined|JSON|console|Math)\b/);
      if (builtinMatch) {
        elements.push(<span key={key++} class="text-blue-400">{builtinMatch[1]}</span>);
        remaining = remaining.slice(builtinMatch[1].length);
        continue;
      }

      const numberMatch = remaining.match(/^(\d+\.?\d*)/);
      if (numberMatch) {
        elements.push(<span key={key++} class="text-orange-400">{numberMatch[1]}</span>);
        remaining = remaining.slice(numberMatch[1].length);
        continue;
      }

      const propMatch = remaining.match(
        /^(mcp|pml|fs|github|capability_captured|match|parameters|tools_used|intent|code|path|title|type|example|title_template|capability|similarity|success_rate|reuse_count|last_used)\b/,
      );
      if (propMatch) {
        elements.push(<span key={key++} class="text-cyan-300">{propMatch[1]}</span>);
        remaining = remaining.slice(propMatch[1].length);
        continue;
      }

      const funcMatch = remaining.match(
        /^(execute_code|execute_dag|read_file|create_issue|parse)\b/,
      );
      if (funcMatch) {
        elements.push(<span key={key++} class="text-yellow-300">{funcMatch[1]}</span>);
        remaining = remaining.slice(funcMatch[1].length);
        continue;
      }

      const levelMatch = remaining.match(/^(Level \d+:)/);
      if (levelMatch) {
        elements.push(<span key={key++} class="text-pml-accent font-semibold">{levelMatch[1]}</span>);
        remaining = remaining.slice(levelMatch[1].length);
        continue;
      }

      const treeMatch = remaining.match(/^([└├─│]+)/);
      if (treeMatch) {
        elements.push(<span key={key++} class="text-stone-500">{treeMatch[1]}</span>);
        remaining = remaining.slice(treeMatch[1].length);
        continue;
      }

      elements.push(<span key={key++}>{remaining[0]}</span>);
      remaining = remaining.slice(1);
    }

    if (lineIndex < lines.length - 1) {
      elements.push(<span key={key++}></span>);
    }

    return <span key={lineIndex}>{elements}</span>;
  });
}

const tabs = [
  { id: "execute", label: "Execute", icon: "▶" },
  { id: "learn", label: "Learn", icon: "◈" },
  { id: "compose", label: "Compose", icon: "⬡" },
  { id: "reuse", label: "Reuse", icon: "↻" },
] as const;

type TabId = typeof tabs[number]["id"];

interface TabContent {
  code: string;
  output: string[];
  status: "success" | "info" | "learn";
}

const tabContents: Record<TabId, TabContent> = {
  execute: {
    code: `// First execution - agent writes code
await pml.execute_code({
  intent: "read config and create github issue",
  code: \`
    const cfg = await mcp.fs.read_file({ path: "config.json" });
    const { version } = JSON.parse(cfg);
    await mcp.github.create_issue({
      title: \\\`Release v\\\${version}\\\`
    });
  \`
})`,
    output: [
      "⚙ Sandbox: Deno 2.5 isolated",
      "⚙ Tools injected: mcp.fs, mcp.github",
      "✓ Execution successful",
      "",
      '→ Issue #142 created: "Release v2.1.0"',
    ],
    status: "success",
  },
  learn: {
    code: `// PML captures automatically (eager learning)
// No configuration needed - just observes success

capability_captured: {
  intent: "read config and create github issue",
  tools_used: ["fs.read_file", "github.create_issue"],

  // Schema inferred via AST parsing
  parameters: {
    path: { type: "string", example: "config.json" },
    title_template: { type: "string" }
  }
}`,
    output: [
      "◈ Capability captured on first success",
      "◈ Schema inferred: 2 parameters detected",
      "◈ Embedding generated for semantic search",
      "",
      "→ Ready for reuse (no manual config needed)",
    ],
    status: "learn",
  },
  compose: {
    code: `// PML detects composition automatically
// Tools → Capabilities → Meta-capabilities

Level 0: Tools (atomic)
  └─ fs.read_file, github.create_issue

Level 1: Capability (learned)
  └─ "config_to_issue" (contains both tools)

Level 2: Meta-capability (emergent)
  └─ "release_workflow"
     ├─ config_to_issue
     ├─ run_tests
     └─ deploy_to_prod`,
    output: [
      "⬡ Composition detected: 2 tools → 1 capability",
      "⬡ Dependency graph updated",
      "⬡ Transitive reliability: 0.94 × 0.98 = 0.92",
      "",
      "→ Hierarchical learning (SECI model)",
    ],
    status: "info",
  },
  reuse: {
    code: `// Later: similar intent triggers suggestion
await pml.execute_dag({
  intent: "update changelog and open PR"
})

// PML finds matching capability
match: {
  capability: "config_to_issue",
  similarity: 0.89,
  success_rate: 0.94,
  reuse_count: 12,
  last_used: "2h ago"
}`,
    output: [
      "↻ Found capability: config_to_issue (89% match)",
      "↻ Success rate: 94% over 12 executions",
      "↻ Reusing learned code (not regenerating)",
      "",
      "→ 5x faster than vanilla execution",
    ],
    status: "success",
  },
};

export function HeroRepl() {
  const activeTab = useSignal<TabId>("execute");
  const isTyping = useSignal(false);
  const displayedCode = useSignal("");
  const showOutput = useSignal(false);
  const currentOutputLine = useSignal(0);

  useEffect(() => {
    const content = tabContents[activeTab.value];
    const fullCode = content.code;

    isTyping.value = true;
    showOutput.value = false;
    currentOutputLine.value = 0;
    displayedCode.value = "";

    let charIndex = 0;
    const typeInterval = setInterval(() => {
      if (charIndex < fullCode.length) {
        displayedCode.value = fullCode.slice(0, charIndex + 1);
        charIndex++;
      } else {
        clearInterval(typeInterval);
        isTyping.value = false;

        setTimeout(() => {
          showOutput.value = true;
          let lineIndex = 0;
          const outputInterval = setInterval(() => {
            if (lineIndex < content.output.length) {
              currentOutputLine.value = lineIndex + 1;
              lineIndex++;
            } else {
              clearInterval(outputInterval);
            }
          }, 120);
        }, 300);
      }
    }, 18);

    return () => clearInterval(typeInterval);
  }, [activeTab.value]);

  const content = tabContents[activeTab.value];

  return (
    <div class="w-full max-w-[580px] bg-stone-950 border border-pml-accent/15 rounded-xl overflow-hidden font-mono shadow-[0_0_0_1px_rgba(255,184,111,0.05),0_20px_50px_rgba(0,0,0,0.5),0_0_100px_rgba(255,184,111,0.03)] max-sm:max-w-full">
      <div class="flex items-center gap-3 px-4 py-3 bg-stone-900 border-b border-pml-accent/[0.08]">
        <div class="flex gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span class="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <span class="w-2.5 h-2.5 rounded-full bg-green-500" />
        </div>
        <div class="flex-1 text-[11px] text-stone-500 tracking-wider">pml-repl</div>
        <div class="text-[9px] font-semibold text-green-500 bg-green-500/10 px-2 py-0.5 rounded tracking-widest animate-pulse">
          LIVE
        </div>
      </div>

      <div class="flex gap-0.5 px-3 pt-2 bg-stone-900/80 border-b border-pml-accent/[0.08]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            class={`flex items-center gap-1.5 px-4 py-2.5 bg-transparent border-none border-b-2 font-mono text-[11px] font-medium cursor-pointer transition-all tracking-wide ${
              activeTab.value === tab.id
                ? "text-pml-accent border-b-pml-accent bg-pml-accent/5"
                : "text-stone-500 border-b-transparent hover:text-stone-400 hover:bg-pml-accent/[0.03]"
            }`}
            onClick={() => (activeTab.value = tab.id)}
          >
            <span class={`text-[10px] ${activeTab.value === tab.id ? "opacity-100" : "opacity-70"}`}>
              {tab.icon}
            </span>
            <span class="max-sm:hidden">{tab.label}</span>
          </button>
        ))}
      </div>

      <div class="p-5 min-h-[220px] bg-gradient-to-b from-stone-950 to-stone-950/95 max-sm:p-4 max-sm:min-h-[200px]">
        <div class="flex gap-3">
          <span class="text-pml-accent text-sm font-semibold leading-relaxed select-none">›</span>
          <pre class="flex-1 m-0 text-xs leading-relaxed text-stone-200 whitespace-pre-wrap break-words max-sm:text-[11px]">
            <code class="text-inherit">{highlightCode(displayedCode.value)}</code>
            {isTyping.value && <span class="text-pml-accent animate-blink ml-px">▋</span>}
          </pre>
        </div>

        {showOutput.value && (
          <div
            class={`mt-5 pt-4 border-t border-dashed border-pml-accent/10 ${
              content.status === "success"
                ? "[&>div]:text-stone-400 [&>div:first-child]:text-green-400"
                : content.status === "info"
                ? "[&>div]:text-blue-300 [&>div:first-child]:text-purple-400"
                : "[&>div]:text-amber-300 [&>div:first-child]:text-amber-500"
            }`}
          >
            {content.output.slice(0, currentOutputLine.value).map((line, i) => (
              <div key={i} class="text-[11px] leading-7 animate-fade-in empty:h-3">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      <div class="flex gap-5 px-4 py-2.5 bg-stone-900/80 border-t border-pml-accent/[0.08]">
        <span class="flex items-center gap-1.5 text-[10px] text-stone-600 tracking-wide">
          <span class="w-1.5 h-1.5 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.4)]" />
          {isTyping.value ? "typing..." : showOutput.value ? "complete" : "ready"}
        </span>
        <span class="text-[10px] text-stone-600 tracking-wide max-sm:hidden">capabilities: 23 learned</span>
        <span class="text-[10px] text-stone-600 tracking-wide max-sm:hidden">reuse rate: 67%</span>
      </div>

      <style>
        {`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 1s step-end infinite;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.15s ease-out;
        }
        `}
      </style>
    </div>
  );
}

export default HeroRepl;
