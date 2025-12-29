/**
 * Fresh 2.x Application Entry Point
 *
 * Defines the Fresh app with static files and filesystem routing
 */

import { App, staticFiles } from "fresh";
import type { FreshContext } from "fresh";
import process from "node:process";

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

// Track active sessions for debugging
const activeSessions = new Map<string, { started: Date; pageViews: number }>();

// Request logging middleware with enhanced info
function requestLogger(ctx: FreshContext) {
  const start = Date.now();
  const { method, url, headers } = ctx.req;
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname;

  // Skip static assets and HMR
  if (pathname.startsWith("/_fresh") || pathname.match(/\.(js|css|ico|png|svg|woff2?|map)$/)) {
    return ctx.next();
  }

  // Extract useful info
  const userAgent = headers.get("user-agent") || "";
  const referer = headers.get("referer");
  const sessionId = headers.get("x-session-id") || "anonymous";
  const isHtmx = headers.get("hx-request") === "true";
  const acceptHeader = headers.get("accept") || "";
  const isPartial = isHtmx || acceptHeader.includes("text/html-partial");

  // Track session
  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, { started: new Date(), pageViews: 0 });
    console.log(`${colors.cyan}[Session]${colors.reset} New session: ${sessionId.slice(0, 8)}...`);
  }
  const session = activeSessions.get(sessionId)!;
  session.pageViews++;

  return ctx.next().then((response) => {
    const duration = Date.now() - start;
    const status = response.status;

    // Status color
    const statusColor = status >= 500
      ? colors.red
      : status >= 400
      ? colors.red
      : status >= 300
      ? colors.yellow
      : colors.green;

    // Build log line
    const parts: string[] = [];

    // Method + Path
    parts.push(`${statusColor}${method}${colors.reset} ${pathname}`);

    // Query params (if any interesting ones)
    const range = parsedUrl.searchParams.get("range");
    if (range) parts.push(`${colors.dim}range=${range}${colors.reset}`);

    // Status + Duration
    parts.push(`${statusColor}${status}${colors.reset}`);
    parts.push(`${colors.dim}${duration}ms${colors.reset}`);

    // Partial/HTMX indicator
    if (isPartial) parts.push(`${colors.magenta}[partial]${colors.reset}`);

    // Slow request warning
    if (duration > 500) {
      parts.push(`${colors.yellow}⚠ slow${colors.reset}`);
    }

    console.log(parts.join(" "));

    // Log errors with more detail
    if (status >= 400) {
      console.log(`  ${colors.dim}↳ Referer: ${referer || "direct"}${colors.reset}`);
      console.log(`  ${colors.dim}↳ UA: ${userAgent.slice(0, 60)}...${colors.reset}`);
    }

    return response;
  }).catch((error) => {
    const duration = Date.now() - start;
    console.log(
      `${colors.red}${method}${colors.reset} ${pathname} ${colors.red}ERROR${colors.reset} ${duration}ms`,
    );
    console.log(`  ${colors.red}↳ ${error.message}${colors.reset}`);
    throw error;
  });
}

// Startup banner
console.log(`
${colors.cyan}┌─────────────────────────────────────┐
│  🍋 Fresh Dashboard                 │
│  Port: ${process.env.PORT_DASHBOARD || "8081"}                          │
│  Mode: ${process.env.NODE_ENV || "development"}                   │
└─────────────────────────────────────┘${colors.reset}
`);

export const app = new App()
  .use(requestLogger)
  .use(staticFiles())
  .fsRoutes();

// Cleanup old sessions periodically (every 30 min)
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  for (const [id, session] of activeSessions) {
    if (now - session.started.getTime() > maxAge) {
      activeSessions.delete(id);
    }
  }
  if (activeSessions.size > 0) {
    console.log(`${colors.dim}[Sessions] Active: ${activeSessions.size}${colors.reset}`);
  }
}, 30 * 60 * 1000);

// Export handler for Deno Deploy
export default {
  fetch: app.handler(),
};
