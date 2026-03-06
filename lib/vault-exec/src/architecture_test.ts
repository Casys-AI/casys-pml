import { assertEquals } from "jsr:@std/assert";

const SLICE_DIRS = [
  ".",
  "cli-runtime",
  "config",
  "core",
  "db",
  "embeddings",
  "gnn",
  "gru",
  "infrastructure",
  "ingest",
  "links",
  "routing",
  "service",
  "training-data",
  "traces",
  "utils",
  "workflows",
] as const;

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isFile;
  } catch {
    return false;
  }
}

async function listDirsWithProductionTs(rootDir: string): Promise<string[]> {
  const sliceDirs = new Set<string>();

  async function walk(dir: string): Promise<void> {
    let hasProductionTs = false;
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        await walk(path);
        continue;
      }
      if (
        entry.isFile &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith("_test.ts")
      ) {
        hasProductionTs = true;
      }
    }
    if (hasProductionTs) {
      sliceDirs.add(dir);
    }
  }

  await walk(rootDir);
  return [...sliceDirs].sort();
}

Deno.test("src architecture: all top-level slices expose lowercase readme and contract docs", async () => {
  const srcRoot = new URL(".", import.meta.url).pathname;
  for (const sliceDir of SLICE_DIRS) {
    const dir = sliceDir === "." ? srcRoot : `${srcRoot}${sliceDir}/`;
    const readmePath = `${dir}readme.md`;
    const contractPath = `${dir}contract.md`;

    assertEquals(
      await fileExists(readmePath),
      true,
      `Missing module readme: ${readmePath}`,
    );
    assertEquals(
      await fileExists(contractPath),
      true,
      `Missing module contract: ${contractPath}`,
    );
  }
});

Deno.test("src architecture: every production sub-slice exposes lowercase readme and contract docs", async () => {
  const srcRootWithSlash = new URL(".", import.meta.url).pathname;
  const srcRoot = srcRootWithSlash.endsWith("/")
    ? srcRootWithSlash.slice(0, -1)
    : srcRootWithSlash;
  const moduleDirs = await listDirsWithProductionTs(srcRoot);

  for (const dir of moduleDirs) {
    const readmePath = `${dir}/readme.md`;
    const contractPath = `${dir}/contract.md`;
    const label = dir.slice(srcRoot.length) || "/";

    assertEquals(
      await fileExists(readmePath),
      true,
      `Missing module readme for production slice ${label}: ${readmePath}`,
    );
    assertEquals(
      await fileExists(contractPath),
      true,
      `Missing module contract for production slice ${label}: ${contractPath}`,
    );
  }
});

Deno.test("src architecture: uppercase README files are removed", async () => {
  const legacyReadmes = [
    new URL("./README.md", import.meta.url).pathname,
    new URL("./gnn/README.md", import.meta.url).pathname,
    new URL("./infrastructure/fs/README.md", import.meta.url).pathname,
  ];

  for (const legacyPath of legacyReadmes) {
    assertEquals(
      await fileExists(legacyPath),
      false,
      `Expected legacy uppercase README to be removed: ${legacyPath}`,
    );
  }
});
