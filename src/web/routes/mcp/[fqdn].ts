/**
 * MCP Registry Route Handler (Story 14.7)
 *
 * GET /mcp/{fqdn} - Get MCP by FQDN
 *
 * Handles:
 * - 5-part FQDN with hash: Returns content if hash matches
 * - 4-part FQDN without hash: Redirects to current version
 *
 * Content types:
 * - deno (capabilities/MiniTools): Returns TypeScript code
 * - stdio/http: Returns JSON metadata
 *
 * @module web/routes/mcp/[fqdn]
 */

import type { FreshContext } from "fresh";
import { McpRegistryService } from "../../../mcp/registry/mcp-registry.service.ts";
import { getDb } from "../../../db/mod.ts";
import { getFQDNPartCount } from "../../../capabilities/fqdn.ts";

export const handler = {
  /**
   * Get MCP by FQDN
   *
   * AC1-AC4: Returns appropriate content based on type
   * AC5: Validates hash, returns error if mismatch
   * AC6: Returns 404 for unknown FQDN
   * AC7: HTTP caching with ETag
   * AC10: Redirects 4-part FQDN to current version
   */
  async GET(ctx: FreshContext) {
    try {
      const { fqdn } = ctx.params;

      if (!fqdn) {
        return new Response(
          JSON.stringify({ error: "not_found", message: "FQDN parameter required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get DB and service
      const db = await getDb();
      const service = new McpRegistryService(db);

      // Determine FQDN format (4-part vs 5-part)
      const partCount = getFQDNPartCount(fqdn);

      // AC10: 4-part FQDN - redirect to current version
      if (partCount === 4) {
        const currentFqdn = await service.getCurrentFqdn(fqdn);

        if (!currentFqdn) {
          return new Response(
            JSON.stringify({ error: "not_found", message: `MCP not found: ${fqdn}` }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Redirect to full FQDN with hash
        const redirectUrl = new URL(ctx.req.url);
        redirectUrl.pathname = `/mcp/${currentFqdn}`;

        return new Response(null, {
          status: 302,
          headers: {
            "Location": redirectUrl.toString(),
            "X-PML-Current-FQDN": currentFqdn,
          },
        });
      }

      // 5-part FQDN - get entry
      const entry = await service.getByFqdn(fqdn);

      // AC6: Not found
      if (!entry) {
        // Check if it exists with different hash (AC5: hash mismatch)
        const currentFqdn = await service.getCurrentFqdn(fqdn.split(".").slice(0, 4).join("."));

        if (currentFqdn && currentFqdn !== fqdn) {
          return new Response(
            JSON.stringify({
              error: "hash_mismatch",
              message: `Hash mismatch for ${fqdn}. Current version has different hash.`,
              currentFqdn,
            }),
            {
              status: 404, // Not Found (per AC5)
              headers: {
                "Content-Type": "application/json",
                "X-PML-Current-FQDN": currentFqdn,
              },
            },
          );
        }

        return new Response(
          JSON.stringify({ error: "not_found", message: `MCP not found: ${fqdn}` }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Check If-None-Match for caching (use full integrity hash for precision)
      const clientEtag = ctx.req.headers.get("If-None-Match");
      const serverEtag = `"${entry.integrity}"`;

      if (clientEtag === serverEtag) {
        return new Response(null, {
          status: 304,
          headers: {
            "ETag": serverEtag,
          },
        });
      }

      // AC1-AC4: Return content based on type
      const headers: Record<string, string> = {
        "X-PML-Type": entry.type,
        "X-PML-Routing": entry.routing,
        "ETag": serverEtag,
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      };

      // For deno type: return TypeScript code
      if (entry.type === "deno") {
        const code = await service.getCode(fqdn);

        if (code) {
          return new Response(code, {
            status: 200,
            headers: {
              ...headers,
              "Content-Type": "application/typescript",
            },
          });
        }

        // If code not available, return metadata with codeUrl
        return new Response(JSON.stringify(entry), {
          status: 200,
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
        });
      }

      // For stdio/http: return JSON metadata
      return new Response(JSON.stringify(entry), {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      console.error(`[/mcp/${ctx.params.fqdn}] Error:`, error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
