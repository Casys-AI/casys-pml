---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
workflowStatus: complete
inputDocuments:
  - docs/tech-specs/tech-spec-capability-naming-curation.md
  - docs/PRD.md
  - docs/architecture/executive-summary.md
epicNumber: 13
epicTitle: "Capability Naming & Curation System"
---

# Procedural Memory Layer (PML) - Epic 13: Capability Naming & Curation System

## Overview

This document provides the complete epic and story breakdown for the **Capability Naming & Curation System**, transforming opaque capability IDs into a DNS-like naming system with full metadata, versioning, and curation capabilities.

**Related Tech Spec:** [tech-spec-capability-naming-curation.md](../tech-specs/tech-spec-capability-naming-curation.md)

## Requirements Inventory

### Functional Requirements

**Core Naming System:**
- **FR001:** The system must accept an optional `name` parameter in `pml_execute` for capability naming (format: `namespace:action_target`)
- **FR002:** The system must validate capability names against the pattern `<namespace>:<action>_<target>[_<variant>]`
- **FR003:** The system must return errors for name collisions during capability creation
- **FR004:** The system must include `capabilityName` in `pml_execute` response

**Capability Calling by Name:**
- **FR005:** The system must accept a `capability` parameter in `pml_execute` to call existing capabilities by name
- **FR006:** The system must perform name-based lookup to resolve capabilities
- **FR007:** The system must merge provided `args` with default parameters when calling capabilities
- **FR008:** The system must execute the capability code with merged arguments

**Auto-Generation & Curation:**
- **FR009:** Capabilities created without names must receive temporary names (`unnamed_<hash>`)
- **FR010:** The system must trigger curation after N unnamed capabilities (configurable threshold)
- **FR011:** The system must provide `pml_curate_capabilities` tool with modes: `suggest`, `auto`, `apply`
- **FR012:** The system must generate name suggestions via LLM + heuristics based on tools used and intent
- **FR013:** The system must validate proposed names for format and uniqueness before applying

**Capability Listing:**
- **FR014:** The system must provide `pml_list_capabilities` tool to list all named capabilities
- **FR015:** The system must support filtering by namespace and named_only flag
- **FR016:** The system must support sorting by name, usage, or creation date

**Integration with pml_discover:**
- **FR017:** `pml_discover` must return the `name` field for capabilities
- **FR018:** Agents must be able to use the returned name to call capabilities directly

**Virtual MCP Server (CapabilityMCPServer):**
- **FR019:** The system must create a virtual MCP server at `src/mcp/servers/capability-server.ts`
- **FR020:** The virtual server must implement `listTools()` returning named capabilities as tools
- **FR021:** The virtual server must implement `callTool()` executing capabilities via WorkerBridge
- **FR022:** All capability tools must use the `cap:` prefix (e.g., `cap:fs:read_json`)
- **FR023:** The Gateway must integrate virtual server in `handleListTools()` and `handleCallTool()`

**Dynamic Refresh:**
- **FR024:** The system must send `tools/list_changed` notifications when capabilities are named/renamed
- **FR025:** MCP clients must receive notifications and refresh their tool lists
- **FR026:** Newly named capabilities must appear immediately in tools/list

**Unified Tracking:**
- **FR027:** Calls via `cap:*` must be tracked in the `tool_usage` table
- **FR028:** Metrics must be unified with real tools (same tracking infrastructure)
- **FR029:** Capability calls must use `server_id = "pml-capabilities"` for filtering

**Transparent Resolution (RPC):**
- **FR030:** Agent calls by name (`cap:fs:read_json`) must be resolved to internal FQDN transparently
- **FR031:** The system must fallback to aliases when names have been changed
- **FR032:** A `capability_aliases` table must be created automatically on rename
- **FR033:** Warning logs must be emitted when deprecated aliases are used
- **FR034:** Internal FQDNs must never be exposed to agents (implementation detail)

**Capability DNS System:**
- **FR035:** Capabilities must use FQDN structure: `<org>.<project>.<namespace>.<action>.<hash>`
- **FR036:** The `capability_records` table must store complete metadata (creator, versioning, trust, visibility)
- **FR037:** Creator fields must include `created_by`, `created_at`
- **FR038:** Versioning fields must include `version`, `version_tag`, `updated_by`, `updated_at`
- **FR039:** Trust fields must include `verified`, `signature`
- **FR040:** Visibility levels must support `private | project | org | public`

**Query API (DNS-like):**
- **FR041:** The system must provide `pml.lookup(name)` for simple resolution
- **FR042:** The system must provide `pml.query({ created_by, tags, visibility, ... })` for advanced search
- **FR043:** The system must provide `pml.history(name)` for version history
- **FR044:** The system must provide `pml.whois(fqdn)` for complete metadata

**Versioning:**
- **FR045:** A `capability_versions` table must track version history
- **FR046:** The system must support version specifiers: `@v1`, `@v1.2.0`, `@2025-12-22`
- **FR047:** Default resolution must use `@latest`

**Fork & Merge (Future - Epic 14+):**
- **FR048:** The system must provide `dns:fork` to copy capabilities for modification
- **FR049:** The system must provide `dns:merge` to combine capabilities into pipelines
- **FR050:** Public visibility must enable marketplace functionality
- **FR051:** `forked_from` must track provenance in capability_records

**PML Standard Library (`lib/std/mcp/`):**
- **FR052:** Create `lib/std/mcp/mod.ts` with `PmlStdServer` class
- **FR053:** Create `cap.ts` module for dynamic capability execution
- **FR054:** Create `dns.ts` module for registry operations (lookup, query, whois, history, fork, merge, rename, tag)
- **FR055:** Create `meta.ts` module for introspection (tools, servers, stats)
- **FR056:** Create `learn.ts` module for learning operations (save, curate, feedback)
- **FR057:** Integrate stdlib into GatewayServer
- **FR058:** Route by prefix (`cap:`, `dns:`, `meta:`, `learn:`)

**MCP Server Registry (Extension for Epic 14 integration):**
- **FR059:** The registry must support `record_type = 'mcp-server'` in addition to `'capability'`
- **FR060:** `dns:lookup("mcp:{name}")` must return the MCP server code URL and metadata
- **FR061:** MCP servers must support versioning (`mcp:filesystem@v1.2.0`)
- **FR062:** MCP servers must support visibility (private/org/public)

**Routing Inheritance:**
- **FR063:** Capabilities must store `tools_used` array tracking which tools they use
- **FR064:** Capability `routing` must be inherited from tools: `local` if ANY tool is local, otherwise `cloud`
- **FR065:** Explicit `routing` in capability metadata must override inherited routing

### Non-Functional Requirements

**From PRD (applicable to this epic):**
- **NFR001: Performance** - Capability resolution (name → FQDN) must complete in <10ms P95
- **NFR002: Usability** - Named capabilities must be discoverable and callable without documentation lookup
- **NFR003: Reliability** - Rename operations must be atomic with automatic alias creation

**Epic-specific NFRs:**
- **NFR004: Backward Compatibility** - Existing capabilities without names must continue to function
- **NFR005: Migration Safety** - `capabilityId`-based calls must remain supported during transition
- **NFR006: Namespace Consistency** - Standard namespaces (`fs`, `api`, `db`, `transform`, `git`, `shell`, `ai`, `util`) must be enforced
- **NFR007: Curation Quality** - LLM-generated names must achieve >80% acceptance rate
- **NFR008: Scalability** - System must handle 10,000+ named capabilities without performance degradation

### Additional Requirements

**From Architecture (Executive Summary):**
- Integration with existing GraphRAG Engine for capability discovery
- Compatibility with Deno 2.x runtime and PGlite database
- Alignment with 3-Layer Architecture (Orchestration → Gateway → MCP Servers)
- Virtual MCP Server must follow same patterns as real MCP servers

**From Tech Spec (Open Questions - requiring decisions):**
- **Decision Required:** Name collision handling strategy (Error vs Auto-suffix vs Versioning)
- **Decision Required:** Name scope (Global vs Per-project namespace prefix)
- **Decision Required:** Deleted capability name handling (Free immediately vs Reserve N days)
- **Decision Required:** LLM model for naming (Haiku vs Sonnet vs Heuristics-only)

**Starter Template (from Architecture):**
- No specific starter template mentioned for this epic
- Builds on existing Epic 7 infrastructure (Emergent Capabilities)

### FR Coverage Map

| FR Range | Story | Description |
|----------|-------|-------------|
| FR001-FR004 | 13.3 | pml_execute name param - optional naming on creation |
| FR005-FR008 | 13.4 | pml_execute capability call - call by name with args |
| FR009-FR013 | 13.8 | pml_curate_capabilities - auto-naming and curation |
| FR014-FR016 | 13.9 | pml_list_capabilities - filtering and sorting |
| FR017-FR018 | 13.11 | Query API - pml_discover integration |
| FR019-FR023 | 13.5 | CapabilityMCPServer - virtual MCP server |
| FR024-FR026 | 13.7 | Dynamic refresh - tools/list_changed notifications |
| FR027-FR029 | 13.6 | Unified tracking - tool_usage integration |
| FR030-FR034 | 13.2, 13.7 | Transparent resolution + aliases |
| FR035-FR040 | 13.1, 13.2 | Capability DNS - FQDN structure & metadata |
| FR041-FR044 | 13.11 | Query API - lookup, query, whois, history |
| FR045-FR047 | 13.12 | Versioning - version table & specifiers |
| FR048-FR051 | **Epic 14** | Fork & Merge (DEFERRED) |
| FR052-FR058 | 13.13 | PML Stdlib - lib/std/mcp/ modules |
| FR059-FR062 | 13.14 | MCP Server Registry - tools in DNS |
| FR063-FR065 | 13.15 | Routing Inheritance - local/cloud resolution |

**Coverage Summary:** 61/65 FRs covered in Epic 13 (FR048-FR051 deferred to Epic 14)

## Epic List

| Epic | Title | Stories | Scope |
|------|-------|---------|-------|
| **13** | Capability Naming & Curation System | 13.1 - 13.15 | Capability DNS, Naming, Curation, Stdlib |

## Epic 13: Capability Naming & Curation System

**Goal:** Transform opaque capability IDs into a DNS-like naming system with callable names, hierarchical namespaces, rich metadata, versioning, and intelligent curation. Enable capabilities to be first-class MCP citizens via virtual server integration.

**Phases:**
- Phase 1: Core MVP (Schema, FQDN, pml_execute name/capability, CapabilityMCPServer)
- Phase 2: Curation & Query (pml_curate, pml_list, Query API)
- Phase 3: Versioning & History
- Phase 4: Fork & Merge (Epic 14+ preparation)
- Phase 5: PML Stdlib (`lib/std/mcp/`)

### Phase 1: Naming & Calling (Core MVP)
**User Value:** *"Je peux nommer mes capabilities et les appeler comme des tools MCP normaux"*

| Story | Title | FRs | Effort |
|-------|-------|-----|--------|
| 13.1 | Capability Records Schema Migration | FR035-FR040 | 1 jour |
| 13.2 | FQDN Generation & Resolution | FR030, FR035 | 1 jour |
| 13.3 | pml_execute name param | FR001-FR004 | 1 jour |
| 13.4 | pml_execute capability call | FR005-FR008 | 1 jour |
| 13.5 | CapabilityMCPServer | FR019-FR023 | 2 jours |
| 13.6 | Gateway Integration | FR023, FR027-FR029 | 1 jour |
| 13.7 | Transparent Resolution & Aliases | FR024-FR026, FR031-FR034 | 1 jour |

**Outcome:** Agent can create named capabilities (`fs:read_json`) and call them via `cap:fs:read_json` like any MCP tool.

---

### Phase 2: Curation & Discovery
**User Value:** *"Le système me suggère des noms intelligents et je peux rechercher mes capabilities"*

| Story | Title | FRs | Effort |
|-------|-------|-----|--------|
| 13.8 | pml_curate_capabilities | FR009-FR013 | 2 jours |
| 13.9 | pml_list_capabilities | FR014-FR016 | 0.5 jour |
| 13.10 | Curation Agent (LLM) | FR012 | 2 jours |
| 13.11 | Query API (DNS-like) | FR017-FR018, FR041-FR044 | 1.5 jours |

**Outcome:** Unnamed capabilities get LLM-suggested names, agent can search/filter existing capabilities.

---

### Phase 3: Versioning
**User Value:** *"Je peux tracker les versions et utiliser des versions spécifiques"*

| Story | Title | FRs | Effort |
|-------|-------|-----|--------|
| 13.12 | Capability Versioning | FR045-FR047 | 2 jours |

**Outcome:** Agent can call `cap:fs:read_json@v1.2.0` for a specific version.

---

### Phase 4: Fork & Merge (DEFERRED → Epic 14)
**User Value:** *"Je peux fork des capabilities publiques et merger des pipelines"*

| Story | Title | FRs | Status |
|-------|-------|-----|--------|
| 14.x | dns:fork | FR048 | Deferred |
| 14.x | dns:merge | FR049 | Deferred |
| 14.x | Marketplace visibility | FR050-FR051 | Deferred |

**Rationale:** Requires multi-tenancy (Epic 9) and public registry infrastructure.

---

### Phase 5: PML Standard Library
**User Value:** *"J'ai un serveur stdlib unifié avec tous les outils de gestion"*

| Story | Title | FRs | Effort |
|-------|-------|-----|--------|
| 13.13 | PmlStdServer + Modules | FR052-FR058 | 5 jours |

**Outcome:** Single MCP server exposes `cap:*`, `dns:*`, `meta:*`, `learn:*` tools.

---

### Phase 6: MCP Server Registry & Routing (Epic 14 Integration)
**User Value:** *"Les tools MCP sont dans le même registry que les capabilities, et le routing local/cloud est automatique"*

| Story | Title | FRs | Effort |
|-------|-------|-----|--------|
| 13.14 | MCP Server Registry | FR059-FR062 | 2 jours |
| 13.15 | Routing Inheritance | FR063-FR065 | 1 jour |

**Outcome:**
- MCP servers registered in DNS alongside capabilities
- `dns:lookup("mcp:filesystem")` returns code URL
- Capabilities inherit `routing: local | cloud` from tools used
- Epic 14 package can resolve MCPs and route correctly

---

## Story List Summary

| Story | Title | Phase | Status |
|-------|-------|-------|--------|
| 13.1 | Capability Records Schema Migration | 1 | backlog |
| 13.2 | FQDN Generation & Resolution | 1 | backlog |
| 13.3 | pml_execute name param | 1 | backlog |
| 13.4 | pml_execute capability call | 1 | backlog |
| 13.5 | CapabilityMCPServer | 1 | backlog |
| 13.6 | Gateway Integration | 1 | backlog |
| 13.7 | Transparent Resolution & Aliases | 1 | backlog |
| 13.8 | pml_curate_capabilities | 2 | backlog |
| 13.9 | pml_list_capabilities | 2 | backlog |
| 13.10 | Curation Agent (LLM) | 2 | backlog |
| 13.11 | Query API (DNS-like) | 2 | backlog |
| 13.12 | Capability Versioning | 3 | backlog |
| 13.13 | PmlStdServer + Modules | 5 | backlog |
| 13.14 | MCP Server Registry | 6 | backlog |
| 13.15 | Routing Inheritance | 6 | backlog |

**Total Estimated Effort:** ~25 jours (excluant Phase 4 différée)

---

## Detailed Stories

### Story 13.1: Capability Records Schema Migration

**As a** PML developer,
**I want** a `capability_records` table with FQDN structure and rich metadata,
**So that** capabilities have stable identities with full provenance tracking.

**Acceptance Criteria:**

**AC1: Schema Creation**
**Given** the PGlite database
**When** migration 020 is executed
**Then** the `capability_records` table is created with columns: `id` (FQDN primary key), `display_name`, `org`, `project`, `namespace`, `action`, `hash`, `created_by`, `created_at`, `version`, `version_tag`, `updated_by`, `updated_at`, `ttl`, `cache_policy`, `parent_id`, `forked_from`, `verified`, `signature`, `usage_count`, `success_count`, `total_latency_ms`, `tags`, `visibility`, `code_snippet`, `parameters_schema`, `description`

**AC2: Indexes**
**Given** the capability_records table
**When** schema is applied
**Then** indexes exist for: `(org, project)`, `(org, project, display_name)`, `namespace`, `created_by`, `tags` (GIN), `visibility`

**AC3: Aliases Table**
**Given** the migration
**When** executed
**Then** `capability_aliases` table is created with columns: `alias`, `org`, `project`, `target_fqdn`, `created_at`

**AC4: Backward Compatibility**
**Given** existing `workflow_pattern` table
**When** migration runs
**Then** existing data is preserved and new columns are nullable or have defaults

---

### Story 13.2: FQDN Generation & Resolution

**As a** PML system,
**I want** to generate and resolve FQDNs for capabilities,
**So that** each capability has a unique, hierarchical identifier.

**Acceptance Criteria:**

**AC1: FQDN Generation**
**Given** capability with namespace "fs", action "read_json"
**When** FQDN is generated with org "local" and project "default"
**Then** FQDN is `local.default.fs.read_json.<hash>` where hash is 4-char hex of content hash

**AC2: Display Name Extraction**
**Given** FQDN `acme.webapp.fs.read_json.a7f3`
**When** display name is requested
**Then** returns `fs:read_json`

**AC3: FQDN Parsing**
**Given** FQDN string
**When** parsed
**Then** returns object with `{ org, project, namespace, action, hash }`

**AC4: Scope Resolution**
**Given** short name `fs:read_json` and session context `{ org: "acme", project: "webapp" }`
**When** resolved
**Then** searches `acme.webapp.fs.read_json.*` and returns matching FQDN

**AC5: Hash Collision Handling**
**Given** two capabilities with same namespace/action but different code
**When** FQDN generated
**Then** hashes differ due to code_snippet content hash

---

### Story 13.3: pml_execute name param

**As a** developer,
**I want** to optionally name my capability when creating it via pml_execute,
**So that** I can give it a meaningful, callable name.

**Acceptance Criteria:**

**AC1: Optional Name Parameter**
**Given** `pml_execute({ intent, code, name: "fs:read_json" })`
**When** executed successfully
**Then** capability is saved with `display_name = "fs:read_json"`

**AC2: Name Validation**
**Given** name `"invalid name!"`
**When** pml_execute called
**Then** returns error "Invalid capability name format. Expected: namespace:action_target"

**AC3: Namespace Validation**
**Given** name with unknown namespace `"xyz:read_file"`
**When** pml_execute called
**Then** returns warning but allows (extensible namespaces) OR error if strict mode

**AC4: Collision Detection**
**Given** existing capability named `fs:read_json`
**When** pml_execute called with same name
**Then** returns error "Capability name 'fs:read_json' already exists"

**AC5: Response Includes Name**
**Given** successful pml_execute with name
**When** response returned
**Then** includes `capabilityName: "fs:read_json"` and `capabilityFqdn: "<full fqdn>"`

**AC6: Auto-generated Name**
**Given** pml_execute without name parameter
**When** executed successfully
**Then** capability receives temporary name `unnamed_<hash>` (first 8 chars of hash)

---

### Story 13.4: pml_execute capability call

**As a** developer,
**I want** to call an existing capability by name with custom arguments,
**So that** I can reuse capabilities without rewriting code.

**Acceptance Criteria:**

**AC1: Call by Name**
**Given** existing capability `fs:read_json`
**When** `pml_execute({ intent: "read config", capability: "fs:read_json", args: { path: "config.json" } })`
**Then** capability code is executed with args merged into context

**AC2: Name Resolution**
**Given** capability name `fs:read_json`
**When** lookup performed
**Then** resolves to full FQDN and retrieves code_snippet

**AC3: Args Merging**
**Given** capability with default params `{ encoding: "utf-8" }`
**When** called with args `{ path: "x.json" }`
**Then** execution context has `{ path: "x.json", encoding: "utf-8" }`

**AC4: Not Found Error**
**Given** non-existent capability name `fs:unknown`
**When** pml_execute called
**Then** returns error "Capability not found: fs:unknown"

**AC5: Usage Tracking**
**Given** capability called successfully
**When** execution completes
**Then** `usage_count` incremented and `success_count` updated based on result

**AC6: Alias Resolution**
**Given** capability was renamed from `fs:read_config` to `fs:read_json`
**When** called with old name `fs:read_config`
**Then** resolves via alias table and logs warning about deprecated name

---

### Story 13.5: CapabilityMCPServer

**As a** developer,
**I want** capabilities to appear as MCP tools with `cap:` prefix,
**So that** I can discover and call them like any other MCP tool.

**Acceptance Criteria:**

**AC1: Virtual Server Creation**
**Given** the MCP Gateway
**When** initialized
**Then** `CapabilityMCPServer` is registered as virtual server with `serverId = "pml-capabilities"`

**AC2: listTools Implementation**
**Given** 5 named capabilities exist (`fs:read_json`, `fs:write_json`, `api:fetch_user`, etc.)
**When** `listTools()` called
**Then** returns 5 tools with names `cap:fs:read_json`, `cap:fs:write_json`, etc. with proper inputSchema

**AC3: callTool Implementation**
**Given** tool call for `cap:fs:read_json` with args `{ path: "config.json" }`
**When** `callTool()` executed
**Then** capability code runs via WorkerBridge and result returned as ToolResult

**AC4: Error Handling**
**Given** tool call for non-existent `cap:unknown:tool`
**When** `callTool()` executed
**Then** returns `{ isError: true, content: [{ type: "text", text: "Capability not found: unknown:tool" }] }`

**AC5: InputSchema Generation**
**Given** capability with `parameters_schema: { type: "object", properties: { path: { type: "string" } } }`
**When** listed as tool
**Then** tool.inputSchema matches the capability's parameters_schema

**AC6: Description Mapping**
**Given** capability with description "Reads and parses a JSON file"
**When** listed as tool
**Then** tool.description is "Reads and parses a JSON file"

---

### Story 13.6: Gateway Integration

**As a** MCP client (Claude),
**I want** capability tools mixed with real MCP tools in tools/list,
**So that** I see a unified tool catalog.

**Acceptance Criteria:**

**AC1: Unified tools/list**
**Given** 3 real servers (filesystem, github, memory) and 5 capabilities
**When** `handleListTools()` called
**Then** returns all real tools + all `cap:*` tools in single list

**AC2: Routing cap: calls**
**Given** tool call for `cap:fs:read_json`
**When** `handleCallTool()` receives it
**Then** routes to `CapabilityMCPServer.callTool()` (not to real servers)

**AC3: Routing real calls**
**Given** tool call for `filesystem:read`
**When** `handleCallTool()` receives it
**Then** routes to filesystem MCP server (not to CapabilityMCPServer)

**AC4: tool_usage Tracking**
**Given** successful `cap:fs:read_json` call
**When** execution completes
**Then** record inserted in `tool_usage` with `server_id = "pml-capabilities"`, `tool_name = "cap:fs:read_json"`

**AC5: Latency Tracking**
**Given** capability execution taking 45ms
**When** call completes
**Then** `total_latency_ms` incremented by 45 in capability_records

**AC6: Prefix Validation**
**Given** tool name starting with `cap:`
**When** routing
**Then** always routes to CapabilityMCPServer regardless of what follows

---

### Story 13.7: Transparent Resolution & Aliases

**As a** developer,
**I want** renamed capabilities to still work with old names,
**So that** my existing code doesn't break when capabilities are renamed.

**Acceptance Criteria:**

**AC1: tools/list_changed Notification**
**Given** capability `fs:read_config` renamed to `fs:read_json`
**When** rename completes
**Then** Gateway sends `notifications/tools/list_changed` to all connected clients

**AC2: Automatic Alias Creation**
**Given** capability renamed from `fs:read_config` to `fs:read_json`
**When** rename executed
**Then** entry created in `capability_aliases`: `{ alias: "fs:read_config", target_fqdn: "<fqdn>" }`

**AC3: Alias Resolution**
**Given** call to `cap:fs:read_config` (old name)
**When** CapabilityMCPServer resolves
**Then** finds alias, resolves to current capability, executes successfully

**AC4: Deprecation Warning**
**Given** call using deprecated alias
**When** executed
**Then** logs warning: `Using deprecated alias "fs:read_config" → "fs:read_json"`

**AC5: tools/list Shows Current Names Only**
**Given** capability with aliases
**When** `listTools()` called
**Then** only current name appears (e.g., `cap:fs:read_json`), aliases are hidden

**AC6: Alias Chain Prevention**
**Given** alias A → B, then B renamed to C
**When** rename executed
**Then** alias A updated to point to C directly (no alias chains)

---

### Story 13.8: pml_curate_capabilities

**As a** developer,
**I want** the system to suggest and apply names to unnamed capabilities,
**So that** I don't have to manually name every capability.

**Acceptance Criteria:**

**AC1: Suggest Mode**
**Given** 5 unnamed capabilities (`unnamed_a7f3`, `unnamed_b8e2`, etc.)
**When** `pml_curate_capabilities({ strategy: "suggest" })` called
**Then** returns array of suggestions: `[{ id, currentName, suggestedName, confidence, reasoning }]`

**AC2: Auto Mode**
**Given** unnamed capabilities with high-confidence suggestions (>0.8)
**When** `pml_curate_capabilities({ strategy: "auto" })` called
**Then** automatically applies names where confidence > 0.8, returns summary of changes

**AC3: Apply Mode**
**Given** manual rename list `[{ id: "abc", name: "fs:read_json" }]`
**When** `pml_curate_capabilities({ strategy: "apply", renames: [...] })` called
**Then** applies specified renames, creates aliases for old names

**AC4: Filter by Unnamed**
**Given** mix of named and unnamed capabilities
**When** `pml_curate_capabilities({ filter: { unnamed_only: true } })` called
**Then** only processes unnamed capabilities

**AC5: Filter by Namespace**
**Given** capabilities across multiple namespaces
**When** `pml_curate_capabilities({ filter: { namespace: "fs" } })` called
**Then** only processes capabilities in "fs" namespace

**AC6: Filter by Usage**
**Given** capabilities with varying usage counts
**When** `pml_curate_capabilities({ filter: { min_usage: 3 } })` called
**Then** only processes capabilities used 3+ times

**AC7: Validation on Apply**
**Given** rename to invalid name format
**When** apply mode executed
**Then** returns error for invalid names, applies valid ones

---

### Story 13.9: pml_list_capabilities

**As a** developer,
**I want** to list all capabilities with filtering and sorting,
**So that** I can discover what capabilities exist.

**Acceptance Criteria:**

**AC1: List All**
**Given** 10 capabilities (5 named, 5 unnamed)
**When** `pml_list_capabilities({})` called
**Then** returns all 10 with: `id`, `name`, `description`, `usage_count`, `success_rate`, `parameters`

**AC2: Filter Named Only**
**Given** mix of named and unnamed
**When** `pml_list_capabilities({ named_only: true })` called
**Then** returns only 5 named capabilities

**AC3: Filter by Namespace**
**Given** capabilities in fs, api, db namespaces
**When** `pml_list_capabilities({ namespace: "fs" })` called
**Then** returns only fs:* capabilities

**AC4: Sort by Name**
**Given** capabilities
**When** `pml_list_capabilities({ sort_by: "name" })` called
**Then** returns alphabetically sorted by display_name

**AC5: Sort by Usage**
**Given** capabilities with varying usage
**When** `pml_list_capabilities({ sort_by: "usage" })` called
**Then** returns sorted by usage_count descending

**AC6: Sort by Created**
**Given** capabilities created at different times
**When** `pml_list_capabilities({ sort_by: "created" })` called
**Then** returns sorted by created_at descending (newest first)

**AC7: Pagination**
**Given** 100 capabilities
**When** `pml_list_capabilities({ limit: 10, offset: 20 })` called
**Then** returns capabilities 21-30

---

### Story 13.10: Curation Agent (LLM)

**As a** PML system,
**I want** to generate intelligent name suggestions using LLM + heuristics,
**So that** auto-generated names are meaningful and consistent.

**Acceptance Criteria:**

**AC1: Heuristic Namespace Detection**
**Given** capability using tools `["filesystem:read", "filesystem:write"]`
**When** namespace inferred
**Then** returns "fs"

**AC2: Heuristic Action Detection**
**Given** capability with intent "read and parse JSON config file"
**When** action inferred
**Then** returns "read_json" or "parse_config"

**AC3: LLM Name Generation**
**Given** capability with intent, code_snippet, tools_used
**When** LLM prompt sent
**Then** returns name suggestion following `namespace:action_target` pattern

**AC4: Confidence Scoring**
**Given** name suggestion
**When** confidence calculated
**Then** score 0.0-1.0 based on: tools match (0.3), intent clarity (0.3), pattern compliance (0.4)

**AC5: Collision Avoidance**
**Given** suggested name `fs:read_json` already exists
**When** suggestion generated
**Then** suggests variant `fs:read_json_v2` or `fs:read_json_config` with lower confidence

**AC6: Batch Processing**
**Given** 20 unnamed capabilities
**When** curation triggered
**Then** processes in batches of 5 to manage LLM costs/latency

**AC7: Model Selection**
**Given** config `curation.model: "haiku"` or `"sonnet"`
**When** LLM called
**Then** uses configured model (default: haiku for cost efficiency)

---

### Story 13.11: Query API (DNS-like)

**As a** developer,
**I want** DNS-like query APIs for capabilities,
**So that** I can search, inspect, and understand capabilities.

**Acceptance Criteria:**

**AC1: lookup(name)**
**Given** capability `fs:read_json` exists
**When** `dns:lookup({ name: "fs:read_json" })` called
**Then** returns `{ fqdn, display_name, description, usage_count, success_rate }`

**AC2: query by creator**
**Given** capabilities created by different users
**When** `dns:query({ created_by: "erwan@*" })` called
**Then** returns all capabilities matching creator pattern

**AC3: query by tags**
**Given** capabilities with various tags
**When** `dns:query({ tags: ["json", "read"] })` called
**Then** returns capabilities having ALL specified tags

**AC4: query by visibility**
**Given** capabilities with different visibility levels
**When** `dns:query({ visibility: "public" })` called
**Then** returns only public capabilities

**AC5: whois(fqdn)**
**Given** capability FQDN
**When** `dns:whois({ fqdn: "acme.webapp.fs.read_json.a7f3" })` called
**Then** returns complete CapabilityRecord with all metadata

**AC6: history(name)**
**Given** capability with 3 versions
**When** `dns:history({ name: "fs:read_json" })` called
**Then** returns `[{ version: 3, ... }, { version: 2, ... }, { version: 1, ... }]` with diffs

**AC7: pml_discover Integration**
**Given** `pml_discover({ intent: "read json files" })`
**When** capabilities match
**Then** results include `name` field for direct calling

---

### Story 13.12: Capability Versioning

**As a** developer,
**I want** to track capability versions and call specific versions,
**So that** I can maintain backward compatibility and audit changes.

**Acceptance Criteria:**

**AC1: Version Table Creation**
**Given** migration executed
**When** schema applied
**Then** `capability_versions` table created with: `id`, `capability_fqdn`, `version`, `version_tag`, `code_snippet`, `parameters_schema`, `updated_by`, `updated_at`, `change_summary`

**AC2: Auto-versioning on Update**
**Given** capability `fs:read_json` at version 2
**When** code_snippet updated
**Then** version incremented to 3, previous version saved to capability_versions

**AC3: Semantic Version Tags**
**Given** capability update
**When** `version_tag: "v1.2.0"` provided
**Then** version_tag stored alongside numeric version

**AC4: Version Specifier @v1**
**Given** capability with versions 1, 2, 3
**When** `cap:fs:read_json@v1` called
**Then** executes version 1 code (major version match)

**AC5: Version Specifier @v1.2.0**
**Given** capability with version_tag "v1.2.0"
**When** `cap:fs:read_json@v1.2.0` called
**Then** executes exact version matching that tag

**AC6: Version Specifier @latest**
**Given** capability with multiple versions
**When** `cap:fs:read_json@latest` or `cap:fs:read_json` called
**Then** executes highest version number

**AC7: Version Specifier @date**
**Given** capability versions from different dates
**When** `cap:fs:read_json@2025-12-22` called
**Then** executes version that was current on that date

**AC8: Version Not Found**
**Given** capability without version 5
**When** `cap:fs:read_json@v5` called
**Then** returns error "Version v5 not found for fs:read_json"

**AC9: Version History Query**
**Given** capability with 5 versions
**When** `dns:history({ name: "fs:read_json" })` called
**Then** returns all versions with change_summary and diffs

**AC10: Immutable Versions**
**Given** saved version in capability_versions
**When** any update attempted
**Then** rejected - versions are immutable (append-only)

---

### Story 13.13: PmlStdServer + Modules

**As a** developer,
**I want** a unified stdlib MCP server with cap/dns/meta/learn modules,
**So that** I have a complete toolkit for capability management.

**Acceptance Criteria:**

**AC1: PmlStdServer Class**
**Given** `lib/std/mcp/mod.ts`
**When** server initialized
**Then** `PmlStdServer` implements MCPServer interface with `serverId = "pml-std"`

**AC2: Module cap.ts**
**Given** cap module
**When** `listTools()` called
**Then** returns all `cap:*` tools (dynamic capabilities)

**AC3: Module dns.ts**
**Given** dns module
**When** `listTools()` called
**Then** returns: `dns:lookup`, `dns:query`, `dns:whois`, `dns:history`, `dns:rename`, `dns:tag`, `dns:fork`, `dns:merge`

**AC4: Module meta.ts**
**Given** meta module
**When** `listTools()` called
**Then** returns: `meta:tools` (list all), `meta:servers` (list servers), `meta:stats` (usage stats)

**AC5: Module learn.ts**
**Given** learn module
**When** `listTools()` called
**Then** returns: `learn:save` (save capability), `learn:curate` (trigger curation), `learn:feedback` (success/failure)

**AC6: Prefix Routing**
**Given** tool call `dns:lookup`
**When** `callTool()` invoked
**Then** routes to `DnsModule.call("lookup", args)`

**AC7: Gateway Integration**
**Given** GatewayServer
**When** `handleListTools()` called
**Then** includes all pml-std tools alongside real server tools

**AC8: Gateway Routing**
**Given** tool call with prefix `cap:`, `dns:`, `meta:`, or `learn:`
**When** `handleCallTool()` invoked
**Then** routes to PmlStdServer

**AC9: Types Module**
**Given** `lib/std/mcp/types.ts`
**When** imported
**Then** exports: `CapabilityRecord`, `CapabilityAlias`, `CapabilityVersion`, `CurationSuggestion`

**AC10: dns:rename Tool**
**Given** `dns:rename({ name: "fs:old", newName: "fs:new" })`
**When** executed
**Then** renames capability, creates alias, sends tools/list_changed

**AC11: dns:tag Tool**
**Given** `dns:tag({ name: "fs:read_json", tags: ["io", "json", "config"] })`
**When** executed
**Then** updates capability tags array

**AC12: learn:feedback Tool**
**Given** `learn:feedback({ name: "fs:read_json", success: true, latency_ms: 45 })`
**When** executed
**Then** updates usage_count, success_count, total_latency_ms

---

### Story 13.14: MCP Server Registry

**As a** platform maintainer,
**I want** MCP server implementations registered in the same DNS system as capabilities,
**So that** tools can be versioned, customized, and resolved dynamically by Epic 14 package.

**Acceptance Criteria:**

**AC1: Record Type Support**
**Given** the `capability_records` table
**When** schema is extended
**Then** `record_type` column exists with values: `'capability'` | `'mcp-server'`
**And** existing records default to `'capability'`

**AC2: MCP Server Registration**
**Given** an MCP server to register (e.g., filesystem)
**When** registered in the system
**Then** FQDN follows pattern: `{org}.{project}.mcp.{name}.{hash}`
**And** `display_name` is `mcp:{name}` (e.g., `mcp:filesystem`)

**AC3: Code URL Storage**
**Given** an MCP server record
**When** stored
**Then** `code_url` field contains the URL to fetch the implementation
**And** URL points to our registry: `https://pml.casys.ai/registry/mcp/{name}/{version}/mod.ts`

**AC4: DNS Lookup for MCP**
**Given** `dns:lookup("mcp:filesystem")`
**When** resolved in session context
**Then** returns `{ type: "mcp-server", code_url: "...", version: "1.2.0", visibility: "public" }`

**AC5: Versioning**
**Given** an MCP server with multiple versions
**When** `dns:lookup("mcp:filesystem@v1.2.0")` called
**Then** returns specific version
**And** `dns:lookup("mcp:filesystem@latest")` returns highest version

**AC6: Visibility**
**Given** an MCP server with `visibility: "org"`
**When** another org tries to resolve it
**Then** returns not found error
**And** same org resolves successfully

**AC7: Seeding Base MCPs**
**Given** initial system setup
**When** migrations run
**Then** base MCPs are seeded: `mcp:filesystem`, `mcp:shell`, `mcp:sqlite`
**And** visibility is `public` for casys namespace

**AC8: Fork Support**
**Given** `dns:fork("mcp:filesystem")`
**When** executed
**Then** copy created in user's namespace: `{user_org}.{project}.mcp.filesystem.{new_hash}`
**And** `forked_from` references original FQDN

---

### Story 13.15: Routing Inheritance

**As a** developer,
**I want** capability routing automatically inherited from tools used,
**So that** local execution happens when any tool requires local access.

**Acceptance Criteria:**

**AC1: Tools Used Tracking**
**Given** a capability created via `pml_execute`
**When** execution completes
**Then** `tools_used` array is populated with all tools called during execution
**And** stored in capability record

**AC2: Routing Resolution - Local Priority**
**Given** capability with `tools_used: ["filesystem:read", "pml:search"]`
**When** routing is resolved
**Then** `routing = "local"` because filesystem is local
**And** routing is cached in capability record

**AC3: Routing Resolution - All Cloud**
**Given** capability with `tools_used: ["pml:search", "tavily:search"]`
**When** routing is resolved
**Then** `routing = "cloud"` because all tools are cloud

**AC4: Routing Lookup**
**Given** tool name like `filesystem:read`
**When** routing lookup performed
**Then** checks `mcp-permissions.yaml` for the server's routing config
**And** returns `local` or `cloud`

**AC5: Explicit Override**
**Given** capability with explicit `routing: "cloud"` in metadata
**When** routing is resolved
**Then** explicit value is used regardless of tools_used
**And** inheritance is skipped

**AC6: No Tools Used**
**Given** capability with empty `tools_used` (pure compute)
**When** routing is resolved
**Then** defaults to `cloud`

**AC7: API Exposure**
**Given** `dns:lookup("cap:fs:read_json")`
**When** resolved
**Then** response includes `routing: "local" | "cloud"`
**And** Epic 14 package can use this for routing decisions
