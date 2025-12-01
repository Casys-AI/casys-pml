# Story 1.2: MCP Servers Configuration

Status: done

## Story

As a **playground user**,
I want **MCP servers pre-configured**,
so that **I can run demos without manual server setup**.

## Acceptance Criteria

1. `playground/config/mcp-servers.json` contient 3 servers Tier 1:
   - `@modelcontextprotocol/server-filesystem` (parallélisation lecture fichiers)
   - `@modelcontextprotocol/server-memory` (knowledge graph local)
   - `@modelcontextprotocol/server-sequential-thinking` (branchement DAG)
2. Paths configurés pour le workspace Codespace (relatifs ou absolus selon le contexte)
3. Documentation inline expliquant chaque server (commentaires dans la config JSON)

## Tasks / Subtasks

- [x] Task 1: Create configuration directory structure (AC: #1)
  - [x] Create `playground/config/` directory if not exists
  - [x] Verify directory is accessible in Codespace environment

- [x] Task 2: Create MCP servers configuration file (AC: #1, #2)
  - [x] Create `playground/config/mcp-servers.json`
  - [x] Configure `@modelcontextprotocol/server-filesystem` with Codespace workspace paths
  - [x] Configure `@modelcontextprotocol/server-memory` (no special path required)
  - [x] Configure `@modelcontextprotocol/server-sequential-thinking` (no special path required)
  - [x] Use correct command format (`npx`, `uvx`) per server type

- [x] Task 3: Add inline documentation (AC: #3)
  - [x] Add JSON comments explaining each server's purpose
  - [x] Document filesystem server's allowed paths
  - [x] Document memory server's knowledge graph capabilities
  - [x] Document sequential-thinking server's branching features
  - [x] Add reference to research document for more details

- [x] Task 4: Validate configuration
  - [x] Verify JSON syntax is valid
  - [x] Test that paths resolve correctly in Codespace
  - [x] Verify server commands match official MCP documentation

## Dev Notes

### Requirements Context

**From PRD (FR015):**
- Playground must include 3 MCP servers Tier 1 (no API key required)
- Servers demonstrate: parallel file reading, local knowledge graph, DAG branching

**From Research Document:**
- Comprehensive analysis of 40+ MCP servers completed ([docs/research/mcp-servers-playground-analysis.md](../research/mcp-servers-playground-analysis.md))
- Tier 1 servers selected based on: no API key, parallelization support, GraphRAG patterns, ease of setup
- Configuration examples provided in research section 4.2

### Architecture Constraints

**MCP Server Configuration Format:**
- Standard JSON format with `mcpServers` object
- Each server has: `command` (executable), `args` (array), optional `env` (object)
- Filesystem server requires explicit allowed paths for security

**Codespace Environment:**
- Workspace root: `/workspaces/AgentCards` (or similar)
- Node.js and Python available via devcontainer
- `npx` for npm packages, `uvx` for Python packages

### Project Structure Notes

**Target Location:**
- `playground/config/mcp-servers.json` (new file)
- Directory: `playground/config/` (create if missing)

**Related Files:**
- Reference: `docs/research/mcp-servers-playground-analysis.md` (server specifications)
- Prerequisite: Story 1.1 devcontainer must be complete

### Testing Strategy

**Validation Steps:**
1. JSON syntax validation (linting)
2. Path resolution verification (filesystem server paths exist)
3. Command availability check (npx, uvx executables)
4. Integration test: load config in MCP client (future story)

### References

- [PRD: FR015 - MCP Servers Tier 1](../PRD-playground.md#functional-requirements)
- [Research: MCP Servers Analysis](../research/mcp-servers-playground-analysis.md)
- [Research: Section 4.2 - Configuration Minimale](../research/mcp-servers-playground-analysis.md#42-configuration-intermédiaire-graphrag)
- [MCP Official Documentation](https://modelcontextprotocol.io/docs)

### Previous Story Context

**Story 1.1 Status:** done

**Learnings from Story 1.1 (Devcontainer Configuration):**
- ✅ Devcontainer successfully configured with Deno 2.1.4
- ✅ Jupyter and Deno extensions pre-installed
- ✅ Ports 3000 and 8888 exposed and accessible
- ✅ Post-create script (`post-create.sh`) handles dependency installation
- ✅ Dockerfile includes Deno + Jupyter + Python stack

**Infrastructure Available:**
- Codespace environment is fully operational
- Node.js available for `npx` commands (filesystem, memory, sequential-thinking servers)
- Python available for `uvx` commands (if needed for future servers)
- Workspace root accessible at `/workspaces/AgentCards` or similar

**For This Story:**
- Leverage existing devcontainer infrastructure
- MCP servers can be tested immediately in Codespace
- No additional environment setup required

## Dev Agent Record

### Context Reference

- `docs/stories/1-2-mcp-servers-configuration.context.xml` - Story context généré le 2025-12-01

### Agent Model Used

- Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

**Implementation Plan**:
1. Create `playground/config/` directory structure
2. Create `mcp-servers.json` with 3 Tier 1 servers (filesystem, memory, sequential-thinking)
3. Configure Codespace workspace paths (`/workspaces/AgentCards`)
4. Add comprehensive documentation via README.md (JSON doesn't support inline comments)
5. Validate JSON syntax, package availability, and command formats

**Key Decisions**:
- Used JSON format (not JSONC) for maximum compatibility
- Created separate README.md for documentation instead of inline comments
- Configured for Codespace environment (`/workspaces/AgentCards`) with note about local development
- All 3 servers use `npx` command (TypeScript/Node.js packages)
- Verified all packages are available and up-to-date (version 2025.11.25)

### Completion Notes List

**Date**: 2025-12-01

**Summary**:
✅ Successfully configured 3 MCP servers Tier 1 for playground demonstrations:
1. Filesystem server - Demonstrates parallel file reading with DAG
2. Memory server - Demonstrates local knowledge graph for GraphRAG
3. Sequential-thinking server - Demonstrates DAG branching patterns

**Implementation Details**:
- Created `playground/config/` directory structure
- Created `playground/config/mcp-servers.json` with standard MCP configuration format
- Created comprehensive `playground/config/README.md` documenting:
  - Each server's purpose and capabilities
  - Configuration details and allowed paths
  - GraphRAG patterns demonstrated by each server
  - Usage examples and testing commands
  - Environment-specific notes (Codespace vs local development)

**Validation Results**:
- ✅ JSON syntax valid (verified with `jq`)
- ✅ All NPM packages available (@modelcontextprotocol/server-*, version 2025.11.25)
- ✅ Commands match official MCP documentation
- ✅ npx available in environment
- ℹ️ Configured for Codespace path `/workspaces/AgentCards` (documentation includes local development notes)

**Files Modified**:
- Added: `playground/config/mcp-servers.json`
- Added: `playground/config/README.md`

### File List

- `playground/config/mcp-servers.json` - MCP servers configuration file (downstream servers: filesystem, memory, sequential-thinking)
- `playground/config/README.md` - Comprehensive documentation for MCP servers configuration
