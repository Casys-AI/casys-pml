/**
 * Tool-to-Key Mapping
 *
 * @deprecated This module is DEPRECATED as of Story 14.6.
 *
 * API key requirements now come from registry metadata (envRequired field).
 * The registry derives envRequired from .mcp-servers.json env placeholders.
 *
 * Flow:
 * 1. Server: .mcp-servers.json uses placeholders ("${EXA_API_KEY}")
 * 2. Server: deriveEnvRequired() returns all keys with placeholder syntax
 * 3. Registry returns metadata.install.envRequired: ["EXA_API_KEY"]
 * 4. Client: CapabilityLoader copies envRequired to stdioDep
 * 5. Client: ensureDependency() checks keys via checkKeys()
 * 6. If missing → api_key_required HIL pause
 *
 * @module byok/key-requirements
 */

// This file is intentionally empty.
// API key requirements are now dynamic from registry metadata.
// See: packages/pml/src/loader/capability-loader.ts (ensureDependency)
