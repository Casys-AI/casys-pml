/**
 * Fix test queries in production-traces.json
 *
 * Problem: query.intent = capability.description (identical text = identical embedding)
 * Solution: Add noise to query embeddings to simulate real user queries
 *
 * Run: deno run --allow-all tests/benchmarks/fixtures/fix-test-queries.ts
 */

const FIXTURE_PATH = new URL("./scenarios/production-traces.json", import.meta.url);

console.log("📦 Loading fixture...");
const fixtureText = await Deno.readTextFile(FIXTURE_PATH);
const fixture = JSON.parse(fixtureText);

// Build capability embedding map
const capEmbMap = new Map<string, number[]>();
for (const cap of fixture.nodes.capabilities) {
  capEmbMap.set(cap.id, cap.embedding);
}

console.log(`📊 Found ${fixture.testQueries.length} test queries`);

// Check current similarity
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Add controlled noise to embedding while maintaining target similarity
function addNoiseWithTargetSim(emb: number[], targetSim: number): number[] {
  // Generate random unit vector for noise direction
  const randomVec = emb.map(() => Math.random() - 0.5);
  const randomNorm = Math.sqrt(randomVec.reduce((sum, x) => sum + x * x, 0));
  const unitRandom = randomVec.map(x => x / randomNorm);

  // Orthogonalize random vector to emb
  const embNorm = Math.sqrt(emb.reduce((sum, x) => sum + x * x, 0));
  const unitEmb = emb.map(x => x / embNorm);
  const dot = unitEmb.reduce((sum, x, i) => sum + x * unitRandom[i], 0);
  const orthogonal = unitRandom.map((x, i) => x - dot * unitEmb[i]);
  const orthNorm = Math.sqrt(orthogonal.reduce((sum, x) => sum + x * x, 0));
  const unitOrth = orthogonal.map(x => x / (orthNorm || 1));

  // Combine: result = cos(theta) * emb + sin(theta) * orthogonal
  // where cos(theta) = targetSim
  const cosTheta = targetSim;
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);

  const result = unitEmb.map((x, i) => cosTheta * x + sinTheta * unitOrth[i]);
  return result;
}

// Check similarity before fix
let beforeSim = 0;
for (const query of fixture.testQueries) {
  const capEmb = capEmbMap.get(query.expectedCapability);
  if (capEmb) {
    beforeSim += cosineSim(query.intentEmbedding, capEmb);
  }
}
console.log(`Before fix: avg similarity = ${(beforeSim / fixture.testQueries.length).toFixed(4)}`);

// Fix: add noise to query embeddings
// Target similarity 0.85-0.95 (realistic for user paraphrases)
const TARGET_SIM_MIN = 0.80;
const TARGET_SIM_MAX = 0.95;

for (const query of fixture.testQueries) {
  // Random target similarity in range
  const targetSim = TARGET_SIM_MIN + Math.random() * (TARGET_SIM_MAX - TARGET_SIM_MIN);
  query.intentEmbedding = addNoiseWithTargetSim(query.intentEmbedding, targetSim);
}

// Check similarity after fix
let afterSim = 0;
for (const query of fixture.testQueries) {
  const capEmb = capEmbMap.get(query.expectedCapability);
  if (capEmb) {
    afterSim += cosineSim(query.intentEmbedding, capEmb);
  }
}
console.log(`After fix: avg similarity = ${(afterSim / fixture.testQueries.length).toFixed(4)}`);

// Save updated fixture
console.log("💾 Saving fixture...");
await Deno.writeTextFile(FIXTURE_PATH, JSON.stringify(fixture, null, 2));

console.log("✅ Done! Test queries now have realistic embeddings");
