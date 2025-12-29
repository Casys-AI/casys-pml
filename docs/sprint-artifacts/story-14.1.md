# Story 14.1: Package Scaffolding & CLI Init Command

Status: ready-for-dev

## Story

As a developer, I want to install the PML package with a single command and initialize my project,
so that I can start using PML with minimal setup friction.

## Acceptance Criteria

### AC1: Package installable via deno install

**Given** a developer with Deno installed **When** they run `deno install -A -n pml jsr:@casys/pml`
**Then** the `pml` command is available globally **And** the package size is under 50KB

### AC2: pml init generates configuration

**Given** a developer in their project directory **When** they run `pml init` **Then** they are
prompted for their PML API key (or can skip for local-only mode) **And** a `.mcp.json` file is
generated with the PML server configuration **And** a `.pml.json` config file is created with
workspace and cloud URL settings

### AC3: Existing config backup

**Given** an existing `.mcp.json` file **When** running `pml init` **Then** the system asks for
confirmation before modifying **And** backs up the original file to `.mcp.json.backup`

### AC4: pml serve starts HTTP server

**Given** a configured `.pml.json` file **When** running `pml serve` **Then** an MCP HTTP Streamable
server starts on the configured port (default 3003) **And** the server is ready to receive tool
calls from Claude Code

### AC5: Version command

**Given** the pml package installed **When** running `pml --version` or `pml -V` **Then** the
package version is displayed (e.g., "0.1.0")

## Tasks / Subtasks

### Phase 1: Package Structure (~2h)

- [ ] Task 1: Create package directory structure (AC: #1)
  - [ ] Create `packages/pml/` directory
  - [ ] Create `packages/pml/deno.json` with JSR config
  - [ ] Create `packages/pml/mod.ts` entry point
  - [ ] Create `packages/pml/src/` source directory
  - [ ] Verify exports field follows JSR best practices

- [ ] Task 2: Implement CLI commands (AC: #1, #5)
  - [ ] Create `src/cli/mod.ts` with @cliffy/command
  - [ ] Add `pml init` command
  - [ ] Add `pml serve` command
  - [ ] Add `pml --version` flag
  - [ ] Add `pml --help` output

### Phase 2: Init Command (~3h)

- [ ] Task 3: Implement init workflow (AC: #2)
  - [ ] Create `src/init/mod.ts`
  - [ ] Prompt for PML API key (with skip option)
  - [ ] Validate API key format (if provided)
  - [ ] Create `.pml.json` config file
  - [ ] Create `.mcp.json` file

- [ ] Task 4: Handle existing config (AC: #3)
  - [ ] Check if `.mcp.json` exists
  - [ ] Prompt for confirmation before overwrite
  - [ ] Create `.mcp.json.backup` if overwriting
  - [ ] Merge with existing config if requested

- [ ] Task 5: Generate .mcp.json (AC: #2)
  - [ ] Use MCP HTTP Streamable transport format
  - [ ] Include BYOK env var placeholders
  - [ ] Set correct localhost URL and port
  - [ ] Validate JSON output

### Phase 3: Serve Command Stub (~1h)

- [ ] Task 6: Create serve command skeleton (AC: #4)
  - [ ] Create `src/server/mod.ts` placeholder
  - [ ] Import MCP SDK for HTTP server
  - [ ] Add startup logging
  - [ ] Return stub response for tool calls
  - [ ] Note: Full implementation in Story 14.6

### Phase 4: Package Publishing Prep (~1h)

- [ ] Task 7: Prepare for JSR publishing (AC: #1)
  - [ ] Add README.md with usage instructions
  - [ ] Configure publish.include/exclude
  - [ ] Test local install: `deno install -A -n pml ./mod.ts`
  - [ ] Verify bundle size < 50KB
  - [ ] Note: Actual publish deferred until Epic 14 complete

### Phase 5: Tests (~1h)

- [ ] Task 8: Unit tests
  - [ ] Test init config generation
  - [ ] Test backup creation
  - [ ] Test CLI argument parsing
  - [ ] Test version output

- [ ] Task 9: Integration tests
  - [ ] Test full init workflow
  - [ ] Test serve command starts
  - [ ] Test with existing .mcp.json

## Dev Notes

### Package Structure

```
packages/pml/
├── deno.json           # JSR config (@casys/pml)
├── mod.ts              # Entry point
├── src/
│   ├── cli/
│   │   └── mod.ts      # CLI commands (@cliffy/command)
│   ├── init/
│   │   └── mod.ts      # Init workflow
│   ├── server/
│   │   └── mod.ts      # HTTP server stub
│   └── workspace.ts    # Workspace resolution (for Story 14.2)
└── README.md
```

### deno.json Configuration

```json
{
  "name": "@casys/pml",
  "version": "0.1.0",
  "exports": {
    ".": "./mod.ts",
    "./cli": "./src/cli/mod.ts"
  },
  "publish": {
    "include": ["mod.ts", "src/**/*.ts", "README.md"]
  },
  "imports": {
    "@cliffy/command": "jsr:@cliffy/command@1.0.0-rc.8",
    "@modelcontextprotocol/sdk": "npm:@modelcontextprotocol/sdk@^1.15.1",
    "@std/fs": "jsr:@std/fs@1.0.19",
    "@std/path": "jsr:@std/path@^1"
  }
}
```

### Generated .mcp.json Format

```json
{
  "pml": {
    "type": "http",
    "url": "http://localhost:3003/mcp",
    "env": {
      "PML_API_KEY": "${PML_API_KEY}",
      "TAVILY_API_KEY": "${TAVILY_API_KEY}",
      "AIRTABLE_API_KEY": "${AIRTABLE_API_KEY}",
      "EXA_API_KEY": "${EXA_API_KEY}"
    }
  }
}
```

### Generated .pml.json Format

```json
{
  "version": "0.1.0",
  "workspace": "/path/to/project",
  "cloudUrl": "https://pml.casys.ai",
  "port": 3003,
  "mcpRegistry": "jsr:@casys/pml-mcp-{name}"
}
```

### CLI Implementation Pattern

Use @cliffy/command which is already in project dependencies:

```typescript
import { Command } from "@cliffy/command";

const main = new Command()
  .name("pml")
  .version("0.1.0")
  .description("PML - Procedural Memory Layer package")
  .command("init", initCommand)
  .command("serve", serveCommand);

await main.parse(Deno.args);
```

### Project Structure Notes

- Package lives in `packages/pml/` (new directory)
- Separate from main codebase to keep it lightweight
- Will be published independently to JSR
- Main codebase remains `jsr:@casys/mcp-gateway`

### Architecture Compliance

- **ADR-025**: MCP Streamable HTTP Transport - .mcp.json uses `type: "http"`
- **ADR-040**: Multi-tenant MCP & Secrets Management - BYOK via local env vars
- **ADR-044**: JSON-RPC Multiplexer - Will be used in serve command (Story 14.6)

### References

- [Source: docs/epics/epic-14-jsr-package-local-cloud-mcp-routing.md#Story-14.1]
- [Source: docs/spikes/2025-12-23-jsr-package-local-mcp-routing.md#Package-JSR-Structure]
- [Source: docs/project-context.md#CLI-Usage]
- [JSR Publishing Docs](https://jsr.io/docs/package-configuration)
- [Deno Install Docs](https://docs.deno.com/runtime/reference/cli/install/)

### Dependencies

- **Story 13.8** (Optional): MCP Server Registry - for registry strategy
- **Story 14.2**: Workspace Resolution - will extend this package
- **Story 14.6**: MCP HTTP Server - full serve implementation

### Testing Strategy

- Use project's existing test patterns: `Deno.test`, `@std/assert`
- Test files in `packages/pml/tests/`
- Run with: `deno test packages/pml/tests/`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
