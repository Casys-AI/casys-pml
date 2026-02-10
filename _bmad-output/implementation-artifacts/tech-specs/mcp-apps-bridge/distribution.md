---
title: 'Distribution'
parent: mcp-apps-bridge
---

# Distribution

## Dual Runtime Strategy

Development in Deno, distribution as npm package for Node.js.

### Development (Deno)

```json
// deno.json
{
  "name": "@casys/mcp-apps-bridge",
  "version": "0.1.0",
  "exports": {
    ".": "./src/index.ts",
    "./core": "./src/core/index.ts",
    "./adapters/telegram": "./src/adapters/telegram.ts",
    "./adapters/line": "./src/adapters/line.ts",
    "./server": "./src/server/index.ts"
  },
  "tasks": {
    "test": "deno test --allow-net --allow-read",
    "check": "deno check src/**/*.ts",
    "lint": "deno lint",
    "build:npm": "deno run -A scripts/build-npm.ts"
  },
  "imports": {
    "@modelcontextprotocol/sdk": "npm:@modelcontextprotocol/sdk@^1.0.0"
  }
}
```

### Distribution (npm)

Use `dnt` (Deno to Node Transform) for npm package build:

```typescript
// scripts/build-npm.ts
import { build } from "https://deno.land/x/dnt@0.40.0/mod.ts";

await build({
  entryPoints: [
    "./src/index.ts",
    { name: "./core", path: "./src/core/index.ts" },
    { name: "./adapters/telegram", path: "./src/adapters/telegram.ts" },
    { name: "./adapters/line", path: "./src/adapters/line.ts" },
    { name: "./server", path: "./src/server/index.ts" },
  ],
  outDir: "./dist-node",
  shims: {
    deno: false,
  },
  package: {
    name: "@casys/mcp-apps-bridge",
    version: "0.1.0",
    description: "Bridge MCP Apps interactive UIs to messaging platforms (Telegram, LINE)",
    license: "MIT",
    repository: {
      type: "git",
      url: "https://github.com/Casys-AI/mcp-apps-bridge",
    },
    keywords: [
      "mcp", "model-context-protocol", "telegram", "mini-apps",
      "line", "liff", "bridge", "messaging"
    ],
    peerDependencies: {
      "@modelcontextprotocol/sdk": ">=1.0.0",
    },
  },
  compilerOptions: {
    lib: ["ES2022", "DOM"],
    target: "ES2022",
  },
  typeCheck: "both",
  test: false,
});
```

### npm Output Structure

```
dist-node/
  esm/
    index.js
    core/
      index.js
      types.js
      transport.js
      bridge-client.js
      message-router.js
    adapters/
      telegram.js
      line.js
      types.js
    server/
      index.js
      resource-server.js
      session-manager.js
      html-injector.js
      csp-builder.js
  types/
    index.d.ts
    core/
    adapters/
    server/
  package.json
  README.md
```

## Package Variants

### Client-Side Bundle (bridge.js)

The bridge adapter + platform adapter need to be bundled as a single JS file that the resource server injects into MCP App HTML.

```typescript
// scripts/build-bridge.ts
// Uses esbuild to bundle core/bridge-client + adapters/* into one file

import { build } from "https://deno.land/x/esbuild@v0.20.0/mod.js";

await build({
  entryPoints: ["src/core/bridge-client.ts"],
  bundle: true,
  format: "iife",
  globalName: "McpAppsBridge",
  outfile: "dist/bridge.js",
  platform: "browser",
  target: "es2020",
  minify: true,
});
```

The resource server serves this bundled file at `/bridge.js`.

### Server-Side Package

The resource server runs in Node.js/Deno and imports:
- `@modelcontextprotocol/sdk` for MCP client
- Standard HTTP server (Node.js `http` or Deno `serve`)
- WebSocket server (`ws` for Node.js or Deno native)

## npm Publishing

### Scoped Package

Published as `@casys/mcp-apps-bridge` to npm:

```bash
cd dist-node
npm publish --access public
```

### Version Strategy

- `0.1.x` — MVP (Telegram only)
- `0.2.x` — LINE LIFF adapter
- `0.3.x` — CLI scaffold
- `1.0.0` — Stable API, all platforms tested

### Release Process

1. Update version in `deno.json`
2. Run `deno task build:npm`
3. Test dist-node package locally
4. Commit and push
5. Create GitHub release tag
6. CI publishes to npm

## Dependencies

### Runtime (Server-Side)

| Package | Purpose | Version |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | MCP client for connecting to MCP servers | ^1.0.0 |

### Runtime (Client-Side)

**Zero dependencies.** The bridge.js bundle is self-contained. It communicates via WebSocket (browser native) and reads platform SDKs that are already injected by the platform.

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `dnt` | Deno to Node transform |
| `esbuild` | Client-side bundle |
| `@types/telegram-web-app` | Telegram WebApp type declarations |
| `@line/liff` | LINE LIFF SDK (for type checking) |

## Compatibility Matrix

| Runtime | Core | Telegram Adapter | LINE Adapter | Resource Server |
|---------|------|-------------------|-------------|-----------------|
| Deno 2.x | Yes | Yes (client) | Yes (client) | Yes |
| Node.js 18+ | Yes | Yes (client) | Yes (client) | Yes |
| Bun | Yes | Yes (client) | Yes (client) | Untested |
| Browser | Client only | Yes | Yes | N/A |
