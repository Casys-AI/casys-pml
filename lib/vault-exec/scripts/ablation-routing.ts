import { parseArgs } from "jsr:@std/cli/parse-args";
import { parse as parseCsv, stringify as stringifyCsv } from "jsr:@std/csv";
import { openVaultStore } from "../src/db/index.ts";
import { deserializeWeights } from "../src/gru/weights.ts";
import { GRUInference } from "../src/gru/inference.ts";
import { BGEEmbedder, EmbeddingModel } from "../src/embeddings/model.ts";
import { parseVault } from "../src/core/parser.ts";
import { DenoVaultReader } from "../src/infrastructure/fs/deno-vault-fs.ts";
import { buildGraph, topologicalSort } from "../src/core/graph.ts";
import type { GRUVocabulary } from "../src/gru/types.ts";

interface EvalRow {
  intent: string;
  target: string;
}

interface EvalResult {
  config: string;
  intent: string;
  target: string;
  targetLevel: number;
  predictedTop1: string;
  top1Correct: boolean;
  top3Hit: boolean;
  mrr: number;
  targetRank: number;
  top3: string;
}

interface Summary {
  config: string;
  samples: number;
  top1Accuracy: number;
  top3Recall: number;
  mrr: number;
  attractorNode: string;
  attractorRate: number;
  predictedCoverage: number;
  predictedUnique: number;
}

function usage(): never {
  console.error(
    "Usage: deno run --allow-read --allow-write --allow-env --allow-net --allow-ffi --unstable-kv --node-modules-dir=manual scripts/ablation-routing.ts --vault <path> --csv <intents.csv> [--out <results.csv>]",
  );
  Deno.exit(1);
}

function normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const n = Math.sqrt(sum) || 1;
  return vec.map((v) => v / n);
}

function blend(raw: number[], gnn: number[]): number[] {
  const n = Math.min(raw.length, gnn.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = (raw[i] + gnn[i]) / 2;
  }
  return normalize(out);
}

function cloneVocabWithEmbeddings(
  vocab: GRUVocabulary,
  byName: Map<string, number[]>,
): GRUVocabulary {
  const nodes = vocab.nodes.map((node) => ({
    ...node,
    embedding: byName.get(node.name) ?? node.embedding,
  }));

  const indexToName = [...vocab.indexToName];
  const nameToIndex = new Map<string, number>(vocab.nameToIndex);
  return { nodes, indexToName, nameToIndex };
}

function computeLevels(
  vaultPath: string,
  noteNames: Set<string>,
): Promise<Map<string, number>> {
  return (async () => {
    const reader = new DenoVaultReader();
    const notes = await parseVault(reader, vaultPath);
    const graph = buildGraph(notes);
    const order = topologicalSort(graph);

    const levels = new Map<string, number>();
    for (const name of order) {
      const deps = graph.edges.get(name) ?? [];
      if (deps.length === 0) {
        levels.set(name, 0);
        continue;
      }
      let maxDep = -1;
      for (const dep of deps) {
        maxDep = Math.max(maxDep, levels.get(dep) ?? 0);
      }
      levels.set(name, maxDep + 1);
    }

    for (const n of noteNames) {
      if (!levels.has(n)) levels.set(n, 0);
    }

    return levels;
  })();
}

async function readEvalRows(csvPath: string): Promise<EvalRow[]> {
  const raw = await Deno.readTextFile(csvPath);
  const rows = parseCsv(raw, {
    skipFirstRow: true,
    columns: ["intent", "target"],
  }) as Record<string, string>[];
  const evalRows: EvalRow[] = [];

  for (const row of rows) {
    const intent = row.intent?.trim();
    const target = row.target?.trim();
    if (!intent || !target) continue;
    evalRows.push({ intent, target });
  }

  if (evalRows.length === 0) {
    throw new Error(
      `No valid rows found in ${csvPath}. Expected columns: intent,target`,
    );
  }
  return evalRows;
}

function summarize(results: EvalResult[], totalNotes: number): Summary[] {
  const byConfig = new Map<string, EvalResult[]>();
  for (const r of results) {
    const arr = byConfig.get(r.config) ?? [];
    arr.push(r);
    byConfig.set(r.config, arr);
  }

  const out: Summary[] = [];
  for (const [config, arr] of byConfig) {
    const n = arr.length;
    const top1 = arr.filter((r) => r.top1Correct).length / n;
    const top3 = arr.filter((r) => r.top3Hit).length / n;
    const mrr = arr.reduce((s, r) => s + r.mrr, 0) / n;

    const predCounts = new Map<string, number>();
    for (const r of arr) {
      predCounts.set(
        r.predictedTop1,
        (predCounts.get(r.predictedTop1) ?? 0) + 1,
      );
    }
    let attractorNode = "";
    let attractorCount = 0;
    for (const [name, count] of predCounts) {
      if (count > attractorCount) {
        attractorNode = name;
        attractorCount = count;
      }
    }

    out.push({
      config,
      samples: n,
      top1Accuracy: top1,
      top3Recall: top3,
      mrr,
      attractorNode,
      attractorRate: attractorCount / n,
      predictedCoverage: predCounts.size / Math.max(totalNotes, 1),
      predictedUnique: predCounts.size,
    });
  }

  out.sort((a, b) =>
    b.top1Accuracy - a.top1Accuracy || b.top3Recall - a.top3Recall ||
    b.mrr - a.mrr
  );
  return out;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, {
    string: ["vault", "csv", "out"],
    default: {},
  });

  const vaultPath = String(args.vault ?? "").trim();
  const csvPath = String(args.csv ?? "").trim();
  if (!vaultPath || !csvPath) usage();

  const dbPath = `${vaultPath.replace(/\/+$/, "")}/.vault-exec/vault.kv`;
  const store = await openVaultStore(dbPath);
  const embedder = new EmbeddingModel(new BGEEmbedder());

  try {
    const weightsRow = await store.getLatestWeights();
    if (!weightsRow) {
      throw new Error(
        `No GRU weights found in ${dbPath}. Run: deno task cli init ${vaultPath}`,
      );
    }

    const { weights, vocab, config } = await deserializeWeights(
      weightsRow.blob,
    );
    const notes = await store.getAllNotes();
    const noteNames = new Set(notes.map((n) => n.name));
    const levels = await computeLevels(vaultPath, noteNames);

    const rawByName = new Map<string, number[]>();
    const gnnByName = new Map<string, number[]>();
    const hybridByName = new Map<string, number[]>();

    for (const note of notes) {
      if (note.embedding) rawByName.set(note.name, normalize(note.embedding));
      const g = note.gnnEmbedding ?? note.embedding;
      if (g) gnnByName.set(note.name, normalize(g));

      if (note.embedding && g) {
        hybridByName.set(note.name, blend(note.embedding, g));
      } else if (g) {
        hybridByName.set(note.name, normalize(g));
      }
    }

    const configs = [
      { name: "raw", byName: rawByName },
      { name: "gnn", byName: gnnByName },
      { name: "hybrid", byName: hybridByName },
    ];

    const evalRows = await readEvalRows(csvPath);
    console.log(`Loaded ${evalRows.length} eval intents from ${csvPath}`);
    console.log(
      `Loaded ${notes.length} notes and GRU weights epoch=${weightsRow.epoch} acc=${
        (weightsRow.accuracy * 100).toFixed(1)
      }%`,
    );

    const intents = await Promise.all(
      evalRows.map(async (r) => ({
        ...r,
        embedding: await embedder.encode(r.intent),
      })),
    );

    const results: EvalResult[] = [];

    for (const cfg of configs) {
      const cfgVocab = cloneVocabWithEmbeddings(vocab, cfg.byName);
      const inference = new GRUInference(weights, cfgVocab, config);

      for (const row of intents) {
        const pred = inference.predictNext(row.embedding, []);
        const ranked = pred.ranked;
        const rank = ranked.findIndex((x) => x.name === row.target);
        const targetRank = rank >= 0 ? rank + 1 : 0;
        const top3 = ranked.slice(0, 3).map((x) => x.name);

        results.push({
          config: cfg.name,
          intent: row.intent,
          target: row.target,
          targetLevel: levels.get(row.target) ?? 0,
          predictedTop1: pred.name,
          top1Correct: pred.name === row.target,
          top3Hit: top3.includes(row.target),
          mrr: rank >= 0 ? 1 / (rank + 1) : 0,
          targetRank,
          top3: top3.join(" | "),
        });
      }
    }

    const summary = summarize(results, notes.length);

    console.log("\n=== Ablation Summary ===");
    console.table(summary.map((s) => ({
      config: s.config,
      samples: s.samples,
      top1: pct(s.top1Accuracy),
      top3: pct(s.top3Recall),
      mrr: s.mrr.toFixed(3),
      attractor: `${s.attractorNode} (${pct(s.attractorRate)})`,
      coverage: `${s.predictedUnique}/${notes.length} (${
        pct(s.predictedCoverage)
      })`,
    })));

    const outPath = args.out
      ? String(args.out)
      : `${vaultPath.replace(/\/+$/, "")}/.vault-exec/ablation-routing-${
        new Date().toISOString().replace(/[.:]/g, "-")
      }.csv`;

    const summaryRows = summary.map((s) => ({
      rowType: "summary",
      config: s.config,
      intent: "",
      target: "",
      targetLevel: "",
      predictedTop1: "",
      top1Correct: String(s.top1Accuracy),
      top3Hit: String(s.top3Recall),
      mrr: String(s.mrr),
      targetRank: "",
      top3:
        `attractor=${s.attractorNode};attractorRate=${s.attractorRate};coverage=${s.predictedUnique}/${notes.length}`,
    }));

    const detailRows = results.map((r) => ({
      rowType: "detail",
      config: r.config,
      intent: r.intent,
      target: r.target,
      targetLevel: String(r.targetLevel),
      predictedTop1: r.predictedTop1,
      top1Correct: String(r.top1Correct),
      top3Hit: String(r.top3Hit),
      mrr: r.mrr.toFixed(6),
      targetRank: String(r.targetRank),
      top3: r.top3,
    }));

    const csv = stringifyCsv([...summaryRows, ...detailRows], {
      columns: [
        "rowType",
        "config",
        "intent",
        "target",
        "targetLevel",
        "predictedTop1",
        "top1Correct",
        "top3Hit",
        "mrr",
        "targetRank",
        "top3",
      ],
    });
    await Deno.mkdir(outPath.replace(/\/[^/]+$/, ""), { recursive: true });
    await Deno.writeTextFile(outPath, csv);

    console.log(`Wrote results: ${outPath}`);
  } finally {
    store.close();
    await embedder.dispose();
  }
}

if (import.meta.main) {
  await main();
}
