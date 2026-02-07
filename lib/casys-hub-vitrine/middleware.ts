import { rewrite, next } from '@vercel/functions';

/**
 * Vercel Routing Middleware - hostname-based routing.
 *
 * Maps custom subdomains to internal Astro pages:
 *   mcp-server.casys.ai  ->  /mcp-server
 *   pml.casys.ai          ->  /pml
 *
 * API rewrites (pml.casys.ai/api/*) are handled by vercel.json
 * since those are external proxies to api.casys.ai.
 */

const SUBDOMAIN_ROUTES: Record<string, string> = {
  'mcp-server.casys.ai': '/mcp-server',
  'mcp-std.casys.ai': '/mcp-std',
  'pml.casys.ai': '/pml',
  'engine.casys.ai': '/engine',
};

// Paths that should never be rewritten (static assets, internal Vercel paths)
const PASSTHROUGH_PREFIXES = [
  '/_astro/',
  '/_vercel/',
  '/api/',
  '/icons/',
  '/fonts/',
  '/images/',
  '/pagefind/',
];

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const hostname = url.hostname;

  const basePath = SUBDOMAIN_ROUTES[hostname];

  if (!basePath) {
    return next();
  }

  // Don't rewrite static assets or internal paths
  if (PASSTHROUGH_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    return next();
  }

  // Don't rewrite if already prefixed (e.g. /mcp-server/foo)
  if (url.pathname.startsWith(basePath)) {
    return next();
  }

  // Rewrite root and sub-paths to the internal Astro page
  const targetPath = url.pathname === '/'
    ? basePath
    : `${basePath}${url.pathname}`;

  return rewrite(new URL(targetPath, request.url));
}
