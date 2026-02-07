/**
 * JWT Auth Provider using JWKS for token validation.
 *
 * Validates JWT tokens against a remote JWKS endpoint,
 * checking issuer, audience, and expiration.
 *
 * @module lib/server/auth/jwt-provider
 */

import { jwtVerify, createRemoteJWKSet } from "jose";
import { AuthProvider } from "./provider.ts";
import type { AuthInfo, ProtectedResourceMetadata } from "./types.ts";

/**
 * Configuration for JwtAuthProvider.
 */
export interface JwtAuthProviderOptions {
  /** JWT issuer (iss claim) */
  issuer: string;
  /** JWT audience (aud claim) */
  audience: string;
  /** JWKS URI for signature validation. Defaults to {issuer}/.well-known/jwks.json */
  jwksUri?: string;
  /** Resource identifier for RFC 9728 */
  resource: string;
  /** Authorization servers that issue valid tokens */
  authorizationServers: string[];
  /** Scopes supported by this server */
  scopesSupported?: string[];
}

/**
 * JWT Auth Provider with JWKS validation.
 *
 * @example
 * ```typescript
 * const provider = new JwtAuthProvider({
 *   issuer: "https://accounts.google.com",
 *   audience: "https://my-mcp.example.com",
 *   resource: "https://my-mcp.example.com",
 *   authorizationServers: ["https://accounts.google.com"],
 * });
 * ```
 */
export class JwtAuthProvider extends AuthProvider {
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private options: JwtAuthProviderOptions;

  constructor(options: JwtAuthProviderOptions) {
    super();

    if (!options.issuer) {
      throw new Error("[JwtAuthProvider] issuer is required");
    }
    if (!options.audience) {
      throw new Error("[JwtAuthProvider] audience is required");
    }
    if (!options.resource) {
      throw new Error("[JwtAuthProvider] resource is required");
    }
    if (!options.authorizationServers?.length) {
      throw new Error("[JwtAuthProvider] at least one authorizationServer is required");
    }

    this.options = options;
    const jwksUri = options.jwksUri ?? `${options.issuer}/.well-known/jwks.json`;
    this.jwks = createRemoteJWKSet(new URL(jwksUri));
  }

  async verifyToken(token: string): Promise<AuthInfo | null> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.options.issuer,
        audience: this.options.audience,
      });

      return {
        subject: payload.sub ?? "unknown",
        clientId: (payload.azp as string | undefined) ??
          (payload.client_id as string | undefined),
        scopes: this.extractScopes(payload),
        claims: payload as Record<string, unknown>,
        expiresAt: payload.exp,
      };
    } catch {
      return null;
    }
  }

  getResourceMetadata(): ProtectedResourceMetadata {
    return {
      resource: this.options.resource,
      authorization_servers: this.options.authorizationServers,
      scopes_supported: this.options.scopesSupported,
      bearer_methods_supported: ["header"],
    };
  }

  /**
   * Extract scopes from JWT payload.
   * Supports: "scope" claim (space-separated string) and "scp" claim (array).
   */
  private extractScopes(payload: Record<string, unknown>): string[] {
    if (typeof payload.scope === "string") {
      return payload.scope.split(" ").filter(Boolean);
    }
    if (Array.isArray(payload.scp)) {
      return payload.scp.filter((s): s is string => typeof s === "string");
    }
    return [];
  }
}
