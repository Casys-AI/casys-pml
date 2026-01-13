/**
 * Sessions Module
 *
 * Package session management for PML handshake.
 *
 * @module mcp/sessions
 */

// Types
export type {
  HeartbeatRequest,
  HeartbeatResponse,
  PackageCapabilities,
  PackageSession,
  RegisterRequest,
  RegisterResponse,
  UnregisterRequest,
  UserScope,
} from "./types.ts";

// Store
export {
  getSessionStore,
  resetSessionStore,
  SessionStore,
} from "./session-store.ts";
