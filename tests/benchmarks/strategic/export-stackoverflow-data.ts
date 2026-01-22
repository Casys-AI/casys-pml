/**
 * Export Stack Overflow dataset for PyG benchmark
 *
 * Creates benchmark-data-stackoverflow.json with:
 * - Tag embeddings (nodes)
 * - Question hyperedges (each question links multiple tags)
 * - Train/test queries (predict co-occurring tags)
 *
 * Run: deno run --allow-all tests/benchmarks/strategic/export-stackoverflow-data.ts
 */

const DATASET_PATH = "./tests/benchmarks/datasets/tags-stack-overflow";
const OUTPUT_PATH = "./tests/benchmarks/strategic/benchmark-data-stackoverflow.json";

// Limit for manageable benchmark size
const MAX_QUESTIONS = 100_000; // Use 100k questions (out of 14M)
const MIN_TAG_FREQUENCY = 50;  // Only tags that appear in at least 50 questions

console.log("=" .repeat(70));
console.log("Stack Overflow Dataset Export for Benchmark");
console.log("=" .repeat(70));

// 1. Load tag embeddings (streaming for large file)
console.log("\n📦 Loading tag embeddings (streaming)...");
const tagEmbeddings: Map<number, { name: string; embedding: number[] }> = new Map();

const file = await Deno.open(`${DATASET_PATH}/tag-embeddings.ndjson`);
const decoder = new TextDecoder();
let buffer = "";
const CHUNK_SIZE = 64 * 1024; // 64KB chunks
const readBuf = new Uint8Array(CHUNK_SIZE);

let bytesRead: number | null;
while ((bytesRead = await file.read(readBuf)) !== null) {
  buffer += decoder.decode(readBuf.subarray(0, bytesRead), { stream: true });

  // Process complete lines
  const lines = buffer.split("\n");
  buffer = lines.pop() || ""; // Keep incomplete line in buffer

  for (const line of lines) {
    if (line.trim()) {
      const obj = JSON.parse(line);
      tagEmbeddings.set(obj.id, { name: obj.name, embedding: obj.embedding });
    }
  }

  if (tagEmbeddings.size % 10000 === 0) {
    console.log(`   ... loaded ${tagEmbeddings.size} embeddings`);
  }
}

// Process remaining buffer
if (buffer.trim()) {
  const obj = JSON.parse(buffer);
  tagEmbeddings.set(obj.id, { name: obj.name, embedding: obj.embedding });
}

file.close();
console.log(`   Loaded ${tagEmbeddings.size} tag embeddings`);

// 2. Load hypergraph structure (questions = hyperedges, tags = nodes)
console.log("\n📦 Loading hypergraph structure...");
const nvertsText = await Deno.readTextFile(`${DATASET_PATH}/tags-stack-overflow-nverts.txt`);
const simplicesText = await Deno.readTextFile(`${DATASET_PATH}/tags-stack-overflow-simplices.txt`);

const nverts = nvertsText.trim().split("\n").map(Number);
const simplices = simplicesText.trim().split("\n").map(Number);

console.log(`   Total questions: ${nverts.length}`);
console.log(`   Total tag references: ${simplices.length}`);

// 3. Build hyperedges (questions -> tags) and count tag frequency
const tagFrequency: Map<number, number> = new Map();
const questions: number[][] = [];
let simplexIdx = 0;

for (let q = 0; q < Math.min(nverts.length, MAX_QUESTIONS); q++) {
  const numTags = nverts[q];
  const tags: number[] = [];

  for (let t = 0; t < numTags; t++) {
    const tagId = simplices[simplexIdx++];
    tags.push(tagId);
    tagFrequency.set(tagId, (tagFrequency.get(tagId) || 0) + 1);
  }

  // Only keep questions with at least 2 tags (for meaningful co-occurrence)
  if (tags.length >= 2) {
    questions.push(tags);
  }
}

console.log(`   Loaded ${questions.length} questions with 2+ tags`);

// 4. Filter to frequent tags
const frequentTags = new Set<number>();
for (const [tagId, count] of tagFrequency.entries()) {
  if (count >= MIN_TAG_FREQUENCY && tagEmbeddings.has(tagId)) {
    frequentTags.add(tagId);
  }
}
console.log(`   Frequent tags (>=${MIN_TAG_FREQUENCY} occurrences): ${frequentTags.size}`);

// 5. Create tag index mapping (dense indexing for model)
const tagIdToIdx: Map<number, number> = new Map();
const idxToTagId: number[] = [];
let idx = 0;
for (const tagId of frequentTags) {
  tagIdToIdx.set(tagId, idx);
  idxToTagId.push(tagId);
  idx++;
}

// 6. Filter questions to only include frequent tags
const filteredQuestions: number[][] = [];
for (const tags of questions) {
  const filtered = tags.filter(t => frequentTags.has(t));
  if (filtered.length >= 2) {
    filteredQuestions.push(filtered.map(t => tagIdToIdx.get(t)!));
  }
}
console.log(`   Questions with 2+ frequent tags: ${filteredQuestions.length}`);

// 7. Build node features (tag embeddings)
const nodeFeatures: number[][] = [];
for (const tagId of idxToTagId) {
  const emb = tagEmbeddings.get(tagId);
  if (emb) {
    nodeFeatures.push(emb.embedding);
  }
}

// 8. Build edges (hyperedge index for hypergraph)
// Format: list of [nodeIdx, hyperedgeIdx] pairs
const edges: [number, number][] = [];
for (let qIdx = 0; qIdx < filteredQuestions.length; qIdx++) {
  for (const tagIdx of filteredQuestions[qIdx]) {
    edges.push([tagIdx, qIdx]);
  }
}

// 9. Create training/test data
// Task: Given a query tag, predict which tags co-occur (appear in same questions)
console.log("\n📊 Creating train/test split...");

// Build co-occurrence matrix
const cooccurrence: Map<number, Set<number>> = new Map();
for (const tags of filteredQuestions) {
  for (const t1 of tags) {
    if (!cooccurrence.has(t1)) cooccurrence.set(t1, new Set());
    for (const t2 of tags) {
      if (t1 !== t2) cooccurrence.get(t1)!.add(t2);
    }
  }
}

// For each tag, create examples where:
// - Query = tag embedding
// - Positive = tags that co-occur
// - Negative = random tags that don't co-occur
const allExamples: { queryIdx: number; positiveIdx: number }[] = [];

for (const [queryIdx, positives] of cooccurrence.entries()) {
  for (const posIdx of positives) {
    allExamples.push({ queryIdx, positiveIdx: posIdx });
  }
}

// Shuffle and split
const shuffled = allExamples.sort(() => Math.random() - 0.5);
const splitIdx = Math.floor(shuffled.length * 0.8);
const trainExamples = shuffled.slice(0, splitIdx);
const testExamples = shuffled.slice(splitIdx);

console.log(`   Training examples: ${trainExamples.length}`);
console.log(`   Test examples: ${testExamples.length}`);

// 10. Format for benchmark
const trainingData = trainExamples.slice(0, 10000).map(ex => ({
  intentEmbedding: nodeFeatures[ex.queryIdx],
  capabilityIdx: ex.positiveIdx,
}));

const testData = testExamples.slice(0, 2000).map(ex => ({
  intentEmbedding: nodeFeatures[ex.queryIdx],
  expectedCapabilityIdx: ex.positiveIdx,
}));

// 11. Export
console.log("\n💾 Exporting benchmark data...");

const output = {
  numCapabilities: frequentTags.size,  // Tags as "capabilities"
  numTools: frequentTags.size,          // Same (no separate tools)
  numQuestions: filteredQuestions.length,
  embDim: nodeFeatures[0].length,
  nodeFeatures,
  edges,
  hyperedges: filteredQuestions,  // Questions as hyperedges
  trainingExamples: trainingData,
  testQueries: testData,
  tagNames: idxToTagId.map(id => tagEmbeddings.get(id)?.name || ""),
  config: {
    hiddenDim: 256,
    numHeads: 8,
    lr: 0.01,
    temperature: 0.1,
    epochs: 20,
  },
};

await Deno.writeTextFile(OUTPUT_PATH, JSON.stringify(output));

const stats = await Deno.stat(OUTPUT_PATH);
console.log(`   Output: ${OUTPUT_PATH} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

console.log("\n" + "=" .repeat(70));
console.log("✅ Export complete!");
console.log(`   Tags: ${frequentTags.size}`);
console.log(`   Questions (hyperedges): ${filteredQuestions.length}`);
console.log(`   Train: ${trainingData.length}, Test: ${testData.length}`);
console.log("=" .repeat(70));
