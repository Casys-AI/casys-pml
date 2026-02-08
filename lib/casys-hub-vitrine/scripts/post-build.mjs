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
 * 3. Copies built UI component HTML files from @casys/mcp-std into static output,
 *    injecting an auto-resize script so the catalog can display interactive previews
 *    without any API dependency
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

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, lstatSync, readlinkSync, rmSync, cpSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';

const CONFIG_PATH = '.vercel/output/config.json';

// --- 1. Inject hostname rewrites ---

const HOSTNAME_REWRITES = [
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
    src: '^/(?!_astro/|_vercel/|api/|ui/|icons/|fonts/|images/|pagefind/|docs/|mcp-server/)(.*)$',
    has: [{ type: 'host', value: 'mcp-server.casys.ai' }],
    dest: '/mcp-server/$1',
  },
  {
    src: '^/(?!_astro/|_vercel/|api/|ui/|icons/|fonts/|images/|pagefind/|docs/|mcp-std/)(.*)$',
    has: [{ type: 'host', value: 'mcp-std.casys.ai' }],
    dest: '/mcp-std/$1',
  },
  {
    src: '^/(?!_astro/|_vercel/|api/|ui/|icons/|fonts/|images/|pagefind/|docs/|engine/)(.*)$',
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

// --- 3. Copy UI component HTML files from @casys/mcp-std ---
// Each component in lib/std/src/ui/dist/<name>/index.html is a self-contained
// Preact + Tailwind single-file bundle (~350-450KB). We copy them into the
// Vercel static output so the catalog can load them as iframe src without any
// API call. We also inject an auto-resize script that reports content height
// to the parent via postMessage('mcp-app-resize').

const UI_DIST_DIR = join(dirname(new URL(import.meta.url).pathname), '..', '..', 'std', 'src', 'ui', 'dist');
const UI_OUTPUT_DIR = '.vercel/output/static/ui';

const AUTO_RESIZE_SCRIPT = `
<script data-mcp-auto-resize>
(function() {
  var lastHeight = 0;
  var debounceTimer = null;

  function getContentHeight() {
    var height = 0;
    var children = document.body.children;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.hasAttribute && child.hasAttribute('data-mcp-auto-resize')) continue;
      var rect = child.getBoundingClientRect();
      var bottom = rect.top + rect.height + window.scrollY;
      if (bottom > height) height = bottom;
    }
    var bodyStyle = getComputedStyle(document.body);
    height += parseInt(bodyStyle.paddingBottom || '0', 10);
    height += parseInt(bodyStyle.marginBottom || '0', 10);
    return Math.max(height, 50);
  }

  function reportHeight() {
    var height = getContentHeight();
    if (height !== lastHeight && height > 0) {
      lastHeight = height;
      window.parent.postMessage({ type: 'mcp-app-resize', height: height, uri: location.href }, '*');
    }
  }

  function debouncedReport() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reportHeight, 50);
  }

  if (document.readyState === 'complete') {
    setTimeout(reportHeight, 100);
  } else {
    window.addEventListener('load', function() { setTimeout(reportHeight, 100); });
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(debouncedReport).observe(document.body);
  }

  setInterval(reportHeight, 2000);
})();
</script>
`;

if (existsSync(UI_DIST_DIR)) {
  let uiCount = 0;
  for (const entry of readdirSync(UI_DIST_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const srcFile = join(UI_DIST_DIR, entry.name, 'index.html');
    if (!existsSync(srcFile)) continue;

    const destDir = join(UI_OUTPUT_DIR, entry.name);
    mkdirSync(destDir, { recursive: true });

    let html = readFileSync(srcFile, 'utf-8');

    // Inject auto-resize script before </body>
    if (html.includes('</body>')) {
      html = html.replace('</body>', AUTO_RESIZE_SCRIPT + '</body>');
    } else if (html.includes('</html>')) {
      html = html.replace('</html>', AUTO_RESIZE_SCRIPT + '</html>');
    } else {
      html += AUTO_RESIZE_SCRIPT;
    }

    writeFileSync(join(destDir, 'index.html'), html);
    uiCount++;
  }
  console.log(`[post-build] Copied ${uiCount} UI components to static/ui/ with auto-resize script`);
} else {
  console.warn('[post-build] UI dist not found at ' + UI_DIST_DIR + ' — run "deno task build:ui" in lib/std first');
}
