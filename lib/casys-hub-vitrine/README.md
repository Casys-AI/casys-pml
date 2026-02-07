# Casys Hub Vitrine

Multi-site Astro project deployed on Vercel, serving all Casys sub-sites from a single build:

| Subdomain | Path prefix | Content |
|-----------|-------------|---------|
| `casys.ai` / `www.casys.ai` | `/` | Landing page |
| `mcp-std.casys.ai` | `/mcp-std/` | MCP Standard Library docs (Starlight) + Catalog |
| `mcp-server.casys.ai` | `/mcp-server/` | MCP Server docs (Starlight) |
| `engine.casys.ai` | `/engine/` | Casys Engine docs (Starlight) |

## Architecture

- **Astro 5** with `@astrojs/vercel` adapter (SSR hybrid)
- **Starlight** for documentation sub-sites (mcp-std, mcp-server, engine)
- **Preact islands** for interactive components (catalog, lead forms)
- **Hostname-based rewrites** route each subdomain to its path prefix

### Routing strategy

Vercel's Build Output API v3 (`--prebuilt`) reads routing from `.vercel/output/config.json`, NOT from `vercel.json`. The `scripts/post-build.mjs` script patches `config.json` after the Astro build to inject hostname-based rewrites.

Each rewrite uses a **negative lookahead regex** to prevent double-prefixing:

```
^/(?!_astro/|_vercel/|api/|ui/|icons/|fonts/|images/|pagefind/|docs/|mcp-std/)(.*)$
```

This ensures that:
- Shared static paths (`_astro/`, `ui/`, etc.) pass through without rewrite
- URLs already prefixed with the sub-site's own path (e.g. `/mcp-std/catalog`) are NOT double-prefixed

### UI components (catalog)

The mcp-std catalog embeds 42 interactive MCP App previews (Preact + Tailwind single-file HTML bundles). These are served statically from `/ui/<component>/index.html` — no API dependency.

The `post-build.mjs` script copies them from `lib/std/src/ui/dist/` into `.vercel/output/static/ui/` and injects an auto-resize script (postMessage `mcp-app-resize`).

## Prerequisites

```bash
# In lib/casys-hub-vitrine/
pnpm install

# Build UI components first (required for catalog previews)
cd ../std && deno task build:ui && cd ../casys-hub-vitrine
```

## Development

```bash
pnpm dev          # Starts dev server at localhost:4321
```

## Deploy to Vercel

### One-command deploy

```bash
pnpm run deploy
# Equivalent to: pnpm run build && node scripts/post-build.mjs && vercel deploy --prebuilt --prod --archive=tgz
```

### Domain aliases

Domains are configured in the Vercel dashboard (via Cloudflare DNS delegation). After deploy, Vercel automatically assigns all production domains — no manual `vercel alias set` needed.

### What `post-build.mjs` does

1. **Injects hostname rewrites** into `.vercel/output/config.json` before the `"handle": "filesystem"` route
2. **Resolves pnpm workspace symlinks** in `.vercel/output/` (Vercel upload breaks on symlinks)
3. **Copies UI component HTML** from `lib/std/src/ui/dist/` to `.vercel/output/static/ui/` with auto-resize script injection

### Vercel project setup (first time)

```bash
pnpm run vercel:login   # Authenticate
pnpm run vercel:link    # Link to Vercel project
```

## Project structure

```
lib/casys-hub-vitrine/
  src/
    components/     # Astro components (header, footer, etc.)
    content/        # Starlight content collections (docs)
    islands/        # Preact islands (catalog, lead forms)
    layouts/        # Page layouts
    pages/          # Astro pages and routes
    styles/         # Global styles
  scripts/
    post-build.mjs  # Vercel routing patches + UI copy
  public/            # Static assets (icons, fonts, images)
  vercel.json        # Fallback routing (used by `vercel dev`)
```
