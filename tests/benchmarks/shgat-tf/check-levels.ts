import { loadScenario } from "/home/ubuntu/CascadeProjects/AgentCards/tests/benchmarks/fixtures/scenario-loader.ts";
const scenario = await loadScenario("production-traces");
const caps = scenario.nodes.capabilities as { id: string; parents?: string[]; children?: string[] }[];
const capMap = new Map<string, { id: string; parents?: string[]; children?: string[] }>();
for (const c of caps) capMap.set(c.id, c);

const levels = new Map<string, number>();
const queue: string[] = [];
for (const c of caps) {
  const hasParents = c.parents && c.parents.length > 0;
  if (!hasParents) {
    levels.set(c.id, 0);
    queue.push(c.id);
  }
}

while (queue.length > 0) {
  const id = queue.shift()!;
  const level = levels.get(id)!;
  const cap = capMap.get(id);
  if (cap && cap.children) {
    for (const childId of cap.children) {
      if (!levels.has(childId) && capMap.has(childId)) {
        levels.set(childId, level + 1);
        queue.push(childId);
      }
    }
  }
}

const byLevel: Record<number, number> = {};
let maxLevel = 0;
for (const [_id, level] of levels) {
  byLevel[level] = (byLevel[level] || 0) + 1;
  maxLevel = Math.max(maxLevel, level);
}
console.log("Caps by level:", byLevel);
console.log("maxLevel:", maxLevel);
console.log("Total assigned:", levels.size, "/", caps.length);
