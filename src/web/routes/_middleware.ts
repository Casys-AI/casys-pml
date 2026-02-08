/**
 * Fresh Authentication Middleware
 *
 * Protects dashboard and settings routes with session-based auth.
 * In local mode, auth is bypassed and user_id = "local".
 *
 * Protected routes:
 * - /dashboard/*
 * - /settings/*
 *
 * Public routes:
 * - /
 * - /auth/*
 * - /blog/*
 *
 * @module web/routes/_middleware
 */

import type { Context } from "fresh";
import { isCloudMode, validateApiKeyFromDb } from "../../lib/auth.ts";
import { getSessionFromRequest } from "../../server/auth/session.ts";
import { isProtectedRoute, isPublicRoute } from "../route-guards.ts";

const IS_DEV = Deno.env.get("DENO_ENV") !== "production" &&
  !Deno.env.get("DENO_DEPLOYMENT_ID");

/**
 * User information from session or API key
 */
export interface User {
  id: string;
  username: string;
  avatarUrl?: string;
}

/**
 * User state injected into Fresh context
 */
export interface AuthState {
  user: User | null;
  isCloudMode: boolean;
}

const LOCAL_USER: User = {
  id: "local",
  username: "local",
  avatarUrl: undefined,
};

/**
 * Creates a JSON error response
 */
function jsonErrorResponse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Creates a redirect response
 */
function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location },
  });
}

/**
 * Adds no-cache headers for dev mode
 */
function addNoCacheHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Handles API key authentication
 * Returns user if valid, null if no API key, or throws Response for invalid key
 */
async function handleApiKeyAuth(req: Request): Promise<User | null | Response> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return null;

  const authResult = await validateApiKeyFromDb(apiKey);
  if (authResult) {
    return {
      id: authResult.user_id,
      username: authResult.username ?? "unknown",
      avatarUrl: undefined,
    };
  }

  return jsonErrorResponse("Invalid API key", 401);
}

/**
 * Fresh 2.x middleware handler
 */
export async function handler(ctx: Context<AuthState>): Promise<Response> {
  const url = new URL(ctx.req.url);
  const pathname = url.pathname;

  ctx.state.isCloudMode = isCloudMode();
  ctx.state.user = null;

  // Local mode: bypass auth, inject local user
  if (!isCloudMode()) {
    ctx.state.user = LOCAL_USER;
    return ctx.next();
  }

  // Cloud mode: check API key first
  const apiKeyResult = await handleApiKeyAuth(ctx.req);
  if (apiKeyResult instanceof Response) {
    return apiKeyResult;
  }
  if (apiKeyResult !== null) {
    ctx.state.user = apiKeyResult;
    return ctx.next();
  }

  // Session auth for protected routes
  if (isProtectedRoute(pathname)) {
    const session = await getSessionFromRequest(ctx.req);
    if (!session) {
      const returnUrl = encodeURIComponent(pathname + url.search);
      return redirectResponse(`/auth/signin?return=${returnUrl}`);
    }
    ctx.state.user = {
      id: session.userId,
      username: session.username,
      avatarUrl: session.avatarUrl,
    };
  } else if (!isPublicRoute(pathname)) {
    // For semi-public routes, try session but don't require it
    const session = await getSessionFromRequest(ctx.req);
    if (session) {
      ctx.state.user = {
        id: session.userId,
        username: session.username,
        avatarUrl: session.avatarUrl,
      };
    }
  }

  const response = await ctx.next();

  // Add no-cache headers in dev mode for HTML responses
  const isHtmlResponse = response.headers.get("Content-Type")?.includes("text/html");
  if (IS_DEV && isHtmlResponse) {
    return addNoCacheHeaders(response);
  }

  return response;
}
