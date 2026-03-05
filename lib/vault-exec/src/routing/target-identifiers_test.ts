import { assertEquals } from "jsr:@std/assert";
import {
  buildTargetIdentifierIndex,
  normalizeTargetIdentifier,
  resolveTargetIdentifier,
  shorthandTargetIdentifier,
} from "./target-identifiers.ts";

Deno.test("normalizeTargetIdentifier handles accents and spaces", () => {
  assertEquals(
    normalizeTargetIdentifier("Équipe Vente Nord"),
    "equipe-vente-nord",
  );
  assertEquals(
    normalizeTargetIdentifier("  Bench   Tier__Target  "),
    "bench-tier-target",
  );
});

Deno.test("shorthandTargetIdentifier builds deterministic short alias", () => {
  assertEquals(shorthandTargetIdentifier("bench-tier-target"), "b-t-t");
  assertEquals(shorthandTargetIdentifier("single"), "s");
});

Deno.test("buildTargetIdentifierIndex resolves by exact name, id and shorthand", () => {
  const index = buildTargetIdentifierIndex([
    "Bench Tier Target",
    "CRM Pipeline",
  ]);
  const bench = index.entries.find((entry) =>
    entry.name === "Bench Tier Target"
  )!;

  assertEquals(bench.id, "bench-tier-target");
  assertEquals(bench.alias, "b-t-t");
  assertEquals(
    resolveTargetIdentifier("Bench Tier Target", index)?.name,
    "Bench Tier Target",
  );
  assertEquals(
    resolveTargetIdentifier("bench-tier-target", index)?.name,
    "Bench Tier Target",
  );
  assertEquals(
    resolveTargetIdentifier("b-t-t", index)?.name,
    "Bench Tier Target",
  );
});

Deno.test("collision handling for ids and aliases is deterministic", () => {
  const namesA = ["Café Démo", "Cafe Demo", "Core Data", "Customer Data"];
  const namesB = [...namesA].reverse();

  const indexA = buildTargetIdentifierIndex(namesA);
  const indexB = buildTargetIdentifierIndex(namesB);

  const mapA = new Map(
    indexA.entries.map((
      entry,
    ) => [entry.name, { id: entry.id, alias: entry.alias }]),
  );
  const mapB = new Map(
    indexB.entries.map((
      entry,
    ) => [entry.name, { id: entry.id, alias: entry.alias }]),
  );

  assertEquals(mapA.get("Café Démo"), { id: "cafe-demo-2", alias: "c-d-2" });
  assertEquals(mapA.get("Cafe Demo"), { id: "cafe-demo", alias: "c-d" });
  assertEquals(mapA.get("Core Data"), { id: "core-data", alias: "c-d-3" });
  assertEquals(mapA.get("Customer Data"), {
    id: "customer-data",
    alias: "c-d-4",
  });

  assertEquals(mapB, mapA);
});
