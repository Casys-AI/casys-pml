/**
 * Crypto/hashing tools
 *
 * Uses Web Crypto API (built into Deno).
 *
 * Inspired by:
 * - IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
 * - TextToolkit MCP: https://github.com/Cicatriiz/text-toolkit
 *
 * @module lib/std/crypto
 */

import type { MiniTool } from "./types.ts";

export const cryptoTools: MiniTool[] = [
  {
    name: "crypto_hash",
    description: "Generate hash of text (SHA-256, SHA-1, SHA-384, SHA-512)",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to hash" },
        algorithm: {
          type: "string",
          enum: ["SHA-256", "SHA-1", "SHA-384", "SHA-512"],
          description: "Hash algorithm (default: SHA-256)",
        },
      },
      required: ["text"],
    },
    handler: async ({ text, algorithm = "SHA-256" }) => {
      const encoder = new TextEncoder();
      const data = encoder.encode(text as string);
      const hashBuffer = await crypto.subtle.digest(algorithm as string, data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    },
  },
  {
    name: "crypto_uuid",
    description: "Generate UUID(s)",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "How many UUIDs (default: 1)" },
      },
    },
    handler: ({ count = 1 }) => {
      const cnt = count as number;
      const uuids = Array.from({ length: cnt }, () => crypto.randomUUID());
      return cnt === 1 ? uuids[0] : uuids;
    },
  },
  {
    name: "crypto_base64",
    description: "Encode or decode Base64",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode/decode" },
        action: { type: "string", enum: ["encode", "decode"], description: "Action" },
      },
      required: ["text", "action"],
    },
    handler: ({ text, action }) => {
      if (action === "encode") {
        return btoa(text as string);
      }
      return atob(text as string);
    },
  },
  {
    name: "crypto_hex",
    description: "Encode or decode hexadecimal",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode/decode" },
        action: { type: "string", enum: ["encode", "decode"], description: "Action" },
      },
      required: ["text", "action"],
    },
    handler: ({ text, action }) => {
      if (action === "encode") {
        return Array.from(new TextEncoder().encode(text as string))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }
      const hex = text as string;
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
      }
      return new TextDecoder().decode(bytes);
    },
  },
  {
    name: "crypto_random_bytes",
    description: "Generate random bytes as hex string",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        length: { type: "number", description: "Number of bytes (default: 16)" },
      },
    },
    handler: ({ length = 16 }) => {
      const bytes = crypto.getRandomValues(new Uint8Array(length as number));
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    },
  },
  // Inspired by IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
  {
    name: "crypto_url",
    description: "Encode or decode URL (percent encoding)",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode/decode" },
        action: { type: "string", enum: ["encode", "decode"], description: "Action" },
        component: {
          type: "boolean",
          description: "Use component encoding (encodes more chars, default: true)",
        },
      },
      required: ["text", "action"],
    },
    handler: ({ text, action, component = true }) => {
      if (action === "encode") {
        return component ? encodeURIComponent(text as string) : encodeURI(text as string);
      }
      return component ? decodeURIComponent(text as string) : decodeURI(text as string);
    },
  },
  {
    name: "crypto_html",
    description: "Encode or decode HTML entities",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode/decode" },
        action: { type: "string", enum: ["encode", "decode"], description: "Action" },
      },
      required: ["text", "action"],
    },
    handler: ({ text, action }) => {
      const htmlEntities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "/": "&#x2F;",
        "`": "&#x60;",
        "=": "&#x3D;",
      };

      if (action === "encode") {
        return (text as string).replace(/[&<>"'`=/]/g, (c) => htmlEntities[c] || c);
      }
      // Decode: reverse the mapping
      const reverseEntities: Record<string, string> = {};
      for (const [char, entity] of Object.entries(htmlEntities)) {
        reverseEntities[entity] = char;
      }
      return (text as string).replace(
        /&(?:amp|lt|gt|quot|#39|#x2F|#x60|#x3D);/g,
        (entity) => reverseEntities[entity] || entity,
      );
    },
  },
  {
    name: "crypto_password",
    description: "Generate a strong random password",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        length: { type: "number", description: "Password length (default: 16)" },
        uppercase: { type: "boolean", description: "Include uppercase (default: true)" },
        lowercase: { type: "boolean", description: "Include lowercase (default: true)" },
        numbers: { type: "boolean", description: "Include numbers (default: true)" },
        symbols: { type: "boolean", description: "Include symbols (default: true)" },
        excludeSimilar: {
          type: "boolean",
          description: "Exclude similar chars (0O, 1lI) (default: false)",
        },
      },
    },
    handler: ({
      length = 16,
      uppercase = true,
      lowercase = true,
      numbers = true,
      symbols = true,
      excludeSimilar = false,
    }) => {
      let chars = "";
      const upper = excludeSimilar ? "ABCDEFGHJKLMNPQRSTUVWXYZ" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const lower = excludeSimilar ? "abcdefghjkmnpqrstuvwxyz" : "abcdefghijklmnopqrstuvwxyz";
      const nums = excludeSimilar ? "23456789" : "0123456789";
      const syms = "!@#$%^&*()_+-=[]{}|;:,.<>?";

      if (uppercase) chars += upper;
      if (lowercase) chars += lower;
      if (numbers) chars += nums;
      if (symbols) chars += syms;

      if (!chars) chars = lower + nums; // Fallback

      const len = length as number;
      const randomValues = crypto.getRandomValues(new Uint8Array(len));
      return Array.from(randomValues, (byte) => chars[byte % chars.length]).join("");
    },
  },
  {
    name: "crypto_jwt_decode",
    description: "Decode a JWT token (without verification) to inspect its contents",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "JWT token to decode" },
      },
      required: ["token"],
    },
    handler: ({ token }) => {
      const parts = (token as string).split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format: expected 3 parts separated by dots");
      }

      const decodeBase64Url = (str: string) => {
        // Convert base64url to base64
        let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
        // Add padding if needed
        while (base64.length % 4) base64 += "=";
        return JSON.parse(atob(base64));
      };

      try {
        const header = decodeBase64Url(parts[0]);
        const payload = decodeBase64Url(parts[1]);

        // Check expiration
        let expired = false;
        let expiresAt = null;
        if (payload.exp) {
          expiresAt = new Date(payload.exp * 1000).toISOString();
          expired = Date.now() > payload.exp * 1000;
        }

        return {
          header,
          payload,
          signature: parts[2],
          expired,
          expiresAt,
          issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
        };
      } catch (e) {
        throw new Error(`Failed to decode JWT: ${(e as Error).message}`);
      }
    },
  },
  {
    name: "crypto_ulid",
    description: "Generate ULID(s) - Universally Unique Lexicographically Sortable Identifier",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "How many ULIDs (default: 1)" },
      },
    },
    handler: ({ count = 1 }) => {
      // ULID: 10 chars timestamp (48 bits) + 16 chars randomness (80 bits)
      const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford's Base32

      const encodeTime = (time: number, len: number) => {
        let str = "";
        for (let i = len; i > 0; i--) {
          const mod = time % 32;
          str = ENCODING[mod] + str;
          time = Math.floor(time / 32);
        }
        return str;
      };

      const encodeRandom = (len: number) => {
        const bytes = crypto.getRandomValues(new Uint8Array(len));
        let str = "";
        for (const byte of bytes) {
          str += ENCODING[byte % 32];
        }
        return str;
      };

      const generateULID = () => {
        const time = Date.now();
        return encodeTime(time, 10) + encodeRandom(16);
      };

      const cnt = count as number;
      const ulids = Array.from({ length: cnt }, generateULID);
      return cnt === 1 ? ulids[0] : ulids;
    },
  },
];
