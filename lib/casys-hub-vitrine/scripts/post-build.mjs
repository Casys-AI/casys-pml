#!/usr/bin/env node
/**
 * Post-build script for Vercel --prebuilt deployments.
 *
 * WHY THIS EXISTS:
 * When deploying with `vercel deploy --prebuilt`, Vercel reads routing from
 * `.vercel/output/config.json` (Build Output API v3), NOT from `vercel.json`.
 * Astro's @astrojs/vercel adapter generates config.json but doesn't support
 * hostname-based rewrites. This script patches config.json after build.
 *
 * WHAT IT DOES:
 * 1. Injects hostname-based rewrites into config.json BEFORE the "handle": "filesystem"
 *    route, so subdomain routing works (e.g. mcp-std.casys.ai → /mcp-std/*)
 * 2. Resolves pnpm workspace symlinks in .vercel/output/ that break Vercel uploads
 *
 * ROUTING STRATEGY:
 * Each subdomain (mcp-server, mcp-std, engine) rewrites requests to its
 * corresponding /prefix/ path in the Astro build output. The negative lookahead
 * in each regex prevents double-prefixing: if a URL already starts with the
 * target prefix (e.g. /mcp-std/catalog), it passes through without rewrite.
 * This is critical for internal links within sub-sites.
 *
 * DEPLOY COMMAND:
 *   pnpm run build && node scripts/post-build.mjs && vercel deploy --prebuilt --prod --archive=tgz
 *
 * AFTER DEPLOY (until domain assignment is fixed):
 *   vercel alias set <deployment-url> mcp-std.casys.ai
 *   vercel alias set <deployment-url> mcp-server.casys.ai
 *   vercel alias set <deployment-url> engine.casys.ai
 *   vercel alias set <deployment-url> casys.ai
 *   vercel alias set <deployment-url> www.casys.ai
 */

import { readFileSync, writeFileSync, lstatSync, readlinkSync, rmSync, cpSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';

const CONFIG_PATH = '.vercel/output/config.json';

// --- 1. Inject hostname rewrites ---

const HOSTNAME_REWRITES = [
  // API proxy: mcp-std.casys.ai/api/* → pml.casys.ai/api/*
  // Must come BEFORE hostname page rewrites so /api/* isn't rewritten to /mcp-std/api/*
  {
    src: '^/api/(.*)$',
    has: [{ type: 'host', value: 'mcp-std.casys.ai' }],
    dest: 'https://pml.casys.ai/api/$1',
  },

  // Hostname-based page rewrites.
  // Each rule rewrites root-relative paths to the sub-site prefix.
  //
  // Negative lookahead excludes:
  //   - _astro/, _vercel/     → Astro/Vercel internal assets
  //   - api/                  → API proxy (handled above)
  //   - icons/, fonts/, images/, pagefind/ → shared static assets
  //   - <own-prefix>/         → prevents double-prefixing for internal links
  //                             (e.g. mcp-std.casys.ai/mcp-std/catalog must NOT
  //                              become /mcp-std/mcp-std/catalog)
  {
    src: '^/(?!_astro/|_vercel/|api/|icons/|fonts/|images/|pagefind/|mcp-server/)(.*)$',
    has: [{ type: 'host', value: 'mcp-server.casys.ai' }],
    dest: '/mcp-server/$1',
  },
  {
    src: '^/(?!_astro/|_vercel/|api/|icons/|fonts/|images/|pagefind/|mcp-std/)(.*)$',
    has: [{ type: 'host', value: 'mcp-std.casys.ai' }],
    dest: '/mcp-std/$1',
  },
  {
    src: '^/(?!_astro/|_vercel/|api/|icons/|fonts/|images/|pagefind/|engine/)(.*)$',
    has: [{ type: 'host', value: 'engine.casys.ai' }],
    dest: '/engine/$1',
  },
];

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
const fsIdx = config.routes.findIndex((r) => r.handle === 'filesystem');

if (fsIdx === -1) {
  console.error('[post-build] Could not find "handle": "filesystem" in config.json');
  process.exit(1);
}

// Insert rewrites before filesystem handler
config.routes.splice(fsIdx, 0, ...HOSTNAME_REWRITES);
writeFileSync(CONFIG_PATH, JSON.stringify(config, null, '\t'));
console.log(`[post-build] Injected ${HOSTNAME_REWRITES.length} hostname rewrites into config.json`);

// --- 2. Resolve pnpm symlinks ---
// pnpm uses symlinks for workspace dependencies (e.g. @casys/design-system).
// Astro's Vercel adapter copies node_modules into .vercel/output/ preserving
// these symlinks, but Vercel's upload breaks on symlinks pointing outside the
// output directory. We resolve each symlink to a real copy.

const symlinks = execSync('find .vercel/output -type l', { encoding: 'utf-8' }).trim();
if (symlinks) {
  for (const link of symlinks.split('\n')) {
    const target = readlinkSync(link);
    const dir = dirname(link);
    const resolved = join(dir, target);
    rmSync(link);
    cpSync(resolved, link, { recursive: true });
  }
  console.log(`[post-build] Resolved ${symlinks.split('\n').length} pnpm symlinks`);
} else {
  console.log('[post-build] No symlinks found');
}
