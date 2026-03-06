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
