import { assertEquals } from "jsr:@std/assert";

const LEGACY_PATHS = [
  new URL("./message-passing.ts", import.meta.url),
  new URL("./orchestrator.ts", import.meta.url),
  new URL("./runtime.ts", import.meta.url),
  new URL("./blas-ffi.ts", import.meta.url),
  new URL("./types.ts", import.meta.url),
  new URL("./math/backend.ts", import.meta.url),
  new URL("./math/blas.ts", import.meta.url),
  new URL("./math/js.ts", import.meta.url),
  new URL("./phases/vertex-to-edge.ts", import.meta.url),
  new URL("./phases/edge-to-edge.ts", import.meta.url),
  new URL("./phases/edge-to-vertex.ts", import.meta.url),
  new URL("./attention.ts", import.meta.url),
  new URL("./residual.ts", import.meta.url),
  new URL("./forward.ts", import.meta.url),
  new URL("./backward.ts", import.meta.url),
  new URL("./params.ts", import.meta.url),
];

async function fileExists(path: URL): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readImports(filePath: string): Promise<string[]> {
  const source = await Deno.readTextFile(filePath);
  const imports: string[] = [];
  const re = /from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

async function listTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      files.push(...await listTypeScriptFiles(path));
      continue;
    }
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith("_test.ts")) continue;
    files.push(path);
  }
  files.sort();
  return files;
}

Deno.test("gnn architecture: legacy facade files are removed", async () => {
  for (const path of LEGACY_PATHS) {
    assertEquals(
      await fileExists(path),
      false,
      `Expected legacy file to be removed: ${path.pathname}`,
    );
  }
});

Deno.test("gnn architecture: domain layer does not import application/infrastructure", async () => {
  const domainDir = new URL("./domain", import.meta.url).pathname;
  const files = await listTypeScriptFiles(domainDir);

  for (const file of files) {
    const imports = await readImports(file);
    for (const specifier of imports) {
      assertEquals(
        /(\/|^)\.\.\/(?:\.\.\/)?(application|infrastructure)\//.test(
          specifier,
        ),
        false,
        `Domain file must not import application/infrastructure: ${file} -> ${specifier}`,
      );
    }
  }
});

Deno.test("gnn architecture: infrastructure layer does not import application", async () => {
  const infraDir = new URL("./infrastructure", import.meta.url).pathname;
  const files = await listTypeScriptFiles(infraDir);

  for (const file of files) {
    const imports = await readImports(file);
    for (const specifier of imports) {
      assertEquals(
        /(\/|^)\.\.\/(?:\.\.\/)?application\//.test(specifier),
        false,
        `Infrastructure file must not import application: ${file} -> ${specifier}`,
      );
    }
  }
});
