#!/usr/bin/env -S deno run --allow-all
/**
 * PML Benchmark Script
 *
 * Exécute des tâches prédéfinies via PML et collecte les métriques.
 * Pas besoin de LLM - on teste directement l'infrastructure PML.
 *
 * Usage: deno task test:pml:benchmark
 */

import { createDefaultClient } from "../../src/db/client.ts";
import { MigrationRunner, getAllMigrations } from "../../src/db/migrations.ts";
import { GatewayServer } from "../../src/mcp/gateway-server.ts";
import { load } from "@std/dotenv";

// Load env
await load({ export: true });

interface BenchmarkTask {
  intent: string;
  code: string;
  category: "file_ops" | "api" | "composite";
}

interface BenchmarkResult {
  task: string;
  phase: "seed" | "reuse";
  executionTimeMs: number;
  success: boolean;
  matchedCapabilities: number;
  semanticScore: number | null;
}

// Tâches de benchmark
const TASKS: BenchmarkTask[] = [
  // File Operations
  {
    intent: "list project files",
    code: `const dir = await mcp.filesystem.list_directory({ path: "/home/ubuntu/CascadeProjects/AgentCards/src" }); return dir;`,
    category: "file_ops",
  },
  {
    intent: "read configuration file",
    code: `const config = await mcp.filesystem.read_file({ path: "/home/ubuntu/CascadeProjects/AgentCards/deno.json" }); return config;`,
    category: "file_ops",
  },
  {
    intent: "get file metadata",
    code: `const info = await mcp.filesystem.get_file_info({ path: "/home/ubuntu/CascadeProjects/AgentCards/src/main.ts" }); return info;`,
    category: "file_ops",
  },
  {
    intent: "analyze directory structure",
    code: `const tree = await mcp.filesystem.directory_tree({ path: "/home/ubuntu/CascadeProjects/AgentCards/src/dag" }); return tree;`,
    category: "file_ops",
  },
  {
    intent: "read multiple source files",
    code: `const files = await mcp.filesystem.read_multiple_files({ paths: ["/home/ubuntu/CascadeProjects/AgentCards/src/main.ts", "/home/ubuntu/CascadeProjects/AgentCards/src/dag/mod.ts"] }); return files;`,
    category: "file_ops",
  },
  // API Operations
  {
    intent: "fetch API data",
    code: `const data = await mcp.fetch.fetch({ url: "https://jsonplaceholder.typicode.com/posts/1" }); return data;`,
    category: "api",
  },
  {
    intent: "get user from API",
    code: `const user = await mcp.fetch.fetch({ url: "https://jsonplaceholder.typicode.com/users/1" }); return user;`,
    category: "api",
  },
  {
    intent: "fetch list of items",
    code: `const posts = await mcp.fetch.fetch({ url: "https://jsonplaceholder.typicode.com/posts?userId=1" }); return posts;`,
    category: "api",
  },
  // Composite Operations
  {
    intent: "read config and extract info",
    code: `
      const config = await mcp.filesystem.read_file({ path: "/home/ubuntu/CascadeProjects/AgentCards/deno.json" });
      const parsed = JSON.parse(config);
      return { name: parsed.name, taskCount: Object.keys(parsed.tasks || {}).length };
    `,
    category: "composite",
  },
  {
    intent: "list and count files",
    code: `
      const dir = await mcp.filesystem.list_directory({ path: "/home/ubuntu/CascadeProjects/AgentCards/src/capabilities" });
      const files = dir.split("\\n").filter(l => l.includes("[FILE]"));
      return { count: files.length, files };
    `,
    category: "composite",
  },
];

// Variations pour test de reuse (même sémantique, formulation différente)
const REUSE_VARIATIONS: Record<string, string[]> = {
  "list project files": ["show directory contents", "enumerate files in folder", "get file listing"],
  "read configuration file": ["load config", "get deno.json contents", "fetch configuration"],
  "fetch API data": ["get data from API", "call REST endpoint", "retrieve JSON from URL"],
};

class PMLBenchmark {
  private gateway: GatewayServer | null = null;
  private results: BenchmarkResult[] = [];

  async setup(): Promise<void> {
    console.log("🔧 Setting up benchmark environment...");

    // Initialize database
    const db = createDefaultClient();
    await db.connect();

    // Run migrations
    const runner = new MigrationRunner(db);
    await runner.runUp(getAllMigrations());

    // Create gateway server
    this.gateway = new GatewayServer({
      configPath: ".mcp.json",
      dbPath: ".pml.db",
    });

    await this.gateway.initialize();
    console.log("✅ Setup complete\n");
  }

  async executeTask(intent: string, code: string, phase: "seed" | "reuse"): Promise<BenchmarkResult> {
    const startTime = performance.now();

    try {
      // Call the gateway's execute_code handler directly
      const response = await this.gateway!.callTool("pml:execute_code", {
        intent,
        code,
      });

      const endTime = performance.now();
      const result = JSON.parse((response as any).content[0].text);

      return {
        task: intent,
        phase,
        executionTimeMs: endTime - startTime,
        success: !result.result?.isError,
        matchedCapabilities: result.matched_capabilities?.length || 0,
        semanticScore: result.matched_capabilities?.[0]?.semantic_score || null,
      };
    } catch (error) {
      return {
        task: intent,
        phase,
        executionTimeMs: performance.now() - startTime,
        success: false,
        matchedCapabilities: 0,
        semanticScore: null,
      };
    }
  }

  async runPhase1Seeding(): Promise<void> {
    console.log("📦 Phase 1: Seeding (creating capabilities)...\n");

    for (const task of TASKS) {
      const result = await this.executeTask(task.intent, task.code, "seed");
      this.results.push(result);

      const status = result.success ? "✅" : "❌";
      console.log(`  ${status} ${task.intent} (${result.executionTimeMs.toFixed(0)}ms)`);
    }
    console.log("");
  }

  async runPhase2Reuse(): Promise<void> {
    console.log("🔄 Phase 2: Reuse (testing capability matching)...\n");

    // Re-run exact same tasks
    for (const task of TASKS) {
      const result = await this.executeTask(task.intent, task.code, "reuse");
      this.results.push(result);

      const status = result.matchedCapabilities > 0 ? "♻️" : "🆕";
      const score = result.semanticScore ? ` (score: ${result.semanticScore.toFixed(2)})` : "";
      console.log(`  ${status} ${task.intent}${score} (${result.executionTimeMs.toFixed(0)}ms)`);
    }
    console.log("");
  }

  async runPhase3Variations(): Promise<void> {
    console.log("🎯 Phase 3: Semantic variations...\n");

    for (const [original, variations] of Object.entries(REUSE_VARIATIONS)) {
      const originalTask = TASKS.find(t => t.intent === original);
      if (!originalTask) continue;

      for (const variant of variations) {
        const result = await this.executeTask(variant, originalTask.code, "reuse");
        this.results.push(result);

        const status = result.matchedCapabilities > 0 ? "♻️" : "🆕";
        const score = result.semanticScore ? ` (score: ${result.semanticScore.toFixed(2)})` : "";
        console.log(`  ${status} "${variant}" → matched: ${result.matchedCapabilities}${score}`);
      }
    }
    console.log("");
  }

  generateReport(): void {
    console.log("📊 BENCHMARK REPORT\n");
    console.log("=".repeat(60));

    const seedResults = this.results.filter(r => r.phase === "seed");
    const reuseResults = this.results.filter(r => r.phase === "reuse");

    // Success rate
    const seedSuccess = seedResults.filter(r => r.success).length / seedResults.length;
    const reuseSuccess = reuseResults.filter(r => r.success).length / reuseResults.length;

    // Reuse rate
    const reuseRate = reuseResults.filter(r => r.matchedCapabilities > 0).length / reuseResults.length;

    // Latency comparison
    const avgSeedLatency = seedResults.reduce((a, r) => a + r.executionTimeMs, 0) / seedResults.length;
    const avgReuseLatency = reuseResults.reduce((a, r) => a + r.executionTimeMs, 0) / reuseResults.length;
    const latencyReduction = (avgSeedLatency - avgReuseLatency) / avgSeedLatency;

    // Average semantic score
    const scores = reuseResults.filter(r => r.semanticScore !== null).map(r => r.semanticScore!);
    const avgSemanticScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    console.log(`
📈 METRICS vs TARGETS (from paper):

| Metric              | Result    | Target  | Status |
|---------------------|-----------|---------|--------|
| Reuse Rate          | ${(reuseRate * 100).toFixed(1)}%    | > 40%   | ${reuseRate > 0.4 ? "✅" : "❌"} |
| Latency Reduction   | ${(latencyReduction * 100).toFixed(1)}%    | > 50%   | ${latencyReduction > 0.5 ? "✅" : "❌"} |
| Success Rate (seed) | ${(seedSuccess * 100).toFixed(1)}%    | > 85%   | ${seedSuccess > 0.85 ? "✅" : "❌"} |
| Success Rate (reuse)| ${(reuseSuccess * 100).toFixed(1)}%    | > 85%   | ${reuseSuccess > 0.85 ? "✅" : "❌"} |
| Avg Semantic Score  | ${avgSemanticScore.toFixed(2)}      | > 0.70  | ${avgSemanticScore > 0.7 ? "✅" : "❌"} |

📊 RAW NUMBERS:
- Seed tasks: ${seedResults.length}
- Reuse tasks: ${reuseResults.length}
- Capabilities matched: ${reuseResults.filter(r => r.matchedCapabilities > 0).length}
- Avg seed latency: ${avgSeedLatency.toFixed(0)}ms
- Avg reuse latency: ${avgReuseLatency.toFixed(0)}ms
`);
  }

  async cleanup(): Promise<void> {
    if (this.gateway) {
      await this.gateway.shutdown();
    }
  }
}

// Main
async function main() {
  console.log("\n🚀 PML BENCHMARK\n");
  console.log("Testing Procedural Memory Layer capabilities\n");

  const benchmark = new PMLBenchmark();

  try {
    await benchmark.setup();
    await benchmark.runPhase1Seeding();
    await benchmark.runPhase2Reuse();
    await benchmark.runPhase3Variations();
    benchmark.generateReport();
  } catch (error) {
    console.error("❌ Benchmark failed:", error);
  } finally {
    await benchmark.cleanup();
  }
}

if (import.meta.main) {
  main();
}
