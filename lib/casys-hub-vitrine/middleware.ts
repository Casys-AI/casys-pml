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
  'mcp-bridge.casys.ai': '/mcp-bridge',
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

// Supported i18n locale prefixes
const LOCALE_PREFIXES = ['fr', 'zh-TW', 'zh'];

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

  // Check if the path starts with a locale prefix (e.g. /fr, /zh)
  // Astro i18n pages are at /{locale}/{basePath}, not {basePath}/{locale}
  const segments = url.pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];

  if (firstSegment && LOCALE_PREFIXES.includes(firstSegment)) {
    // /fr -> /fr/mcp-bridge, /fr/docs/foo -> /fr/mcp-bridge/docs/foo
    const rest = segments.slice(1);
    const targetPath = rest.length === 0
      ? `/${firstSegment}${basePath}`
      : `/${firstSegment}${basePath}/${rest.join('/')}`;
    return rewrite(new URL(targetPath, request.url));
  }

  // Rewrite root and sub-paths to the internal Astro page
  const targetPath = url.pathname === '/'
    ? basePath
    : `${basePath}${url.pathname}`;

  return rewrite(new URL(targetPath, request.url));
}
