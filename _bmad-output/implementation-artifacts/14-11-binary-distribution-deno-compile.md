# Story 14.11: Binary Distribution via Deno Compile

Status: done

> **Epic:** 14 - JSR Package Local/Cloud MCP Routing
> **Prerequisites:** Stories 14.1-14.8 (DONE)
> **Estimated Effort:** 0.5 day
> **LOC:** ~400 (scripts + workflows)

## Story

As an end user,
I want to install PML as a standalone binary without any runtime dependencies,
so that I can use it immediately without installing Deno, Node, or any other prerequisite.

## Architecture Decision: Public Repos for Open Source + Distribution

**Context:** The pml-cloud repo is PRIVATE. GitHub Releases would also be private.

**Decision:** Use TWO public repos for open source code and binary distribution.

**Final Architecture:**
```
casys-pml-cloud (PRIVATE)
├── src/                    # GraphRAG, SHGAT, learning (secret sauce)
├── lib/                    # MiniTools (synced to mcp-std)
├── packages/pml/           # CLI package (synced to casys-pml)
└── .github/workflows/
    ├── sync-to-public.yml      # Syncs lib/ → mcp-std
    ├── sync-pml-package.yml    # Syncs packages/pml/ → casys-pml
    └── release-pml.yml         # Builds binaries → casys-pml releases

Casys-AI/mcp-std (PUBLIC - MIT)
├── std/                    # MiniTools (~318 tools)
├── mcp-tools-server.ts     # MCP server
├── mcp-tools.ts            # Re-exports
├── README.md
└── LICENSE

Casys-AI/casys-pml (PUBLIC - MIT)
├── src/cli/                # CLI source
├── src/sandbox/            # Sandbox execution
├── scripts/install.sh      # Installation script
├── README.md
├── LICENSE
└── Releases/               # Compiled binaries
    └── v0.1.0/
        ├── pml-linux-x64
        ├── pml-macos-x64
        ├── pml-macos-arm64
        ├── pml-windows-x64.exe
        ├── install.sh
        └── checksums.sha256
```

**Benefits:**
- Open source MiniTools library (community contributions)
- Open source CLI (transparency)
- Binary distribution via GitHub Releases (free, reliable CDN)
- Secret sauce stays private (GraphRAG, SHGAT, learning)

## Acceptance Criteria

### AC1-2: Cross-Platform Compilation ✅

**Given** the PML source code
**When** CI/CD runs on release (git tag `v*`)
**Then** it compiles binaries for:
- `pml-linux-x64` ✅
- `pml-macos-x64` ✅
- `pml-macos-arm64` ✅
- `pml-windows-x64.exe` ✅
**And** each binary is self-contained (no external dependencies)

### AC3-4: Installation Script ✅

**Given** a user on Linux/macOS
**When** they run:
```bash
curl -fsSL https://github.com/Casys-AI/casys-pml/releases/latest/download/install.sh | sh
```
**Then** the script:
1. ✅ Detects OS and architecture
2. ✅ Downloads correct binary from GitHub Releases
3. ✅ Installs to `~/.pml/bin/pml`
4. ✅ Adds to PATH if needed
5. ✅ Prints success message

### AC5-6: Self-Update Command ✅

**Given** PML is installed
**When** user runs `pml upgrade`
**Then** it:
1. ✅ Fetches latest version from GitHub Releases API
2. ✅ If newer, downloads new binary
3. ✅ Replaces current binary atomically
4. ✅ Prints upgrade status

### AC7-8: CI/CD Pipeline ✅

**Given** a git tag `v*` is pushed to casys-pml-cloud
**When** GitHub Actions runs
**Then** it:
1. ✅ Runs `deno compile` for each platform (matrix build)
2. ✅ Creates GitHub Release on casys-pml (public repo)
3. ✅ Uploads all binaries + install.sh + checksums

## Completed Tasks

### Task 1: Cross-Compilation Tasks ✅
- Added `compile:linux`, `compile:macos-x64`, `compile:macos-arm`, `compile:windows`
- Added `compile:all` to build all platforms
- Output to `dist/` folder

### Task 2: Installation Script ✅
- Created `packages/pml/scripts/install.sh`
- Detects OS/arch, downloads binary, installs to ~/.pml/bin

### Task 3: Upgrade Command ✅
- Created `packages/pml/src/cli/upgrade-command.ts`
- Fetches from GitHub Releases API
- Atomic binary replacement
- `--check` and `--force` options

### Task 4: Release Workflow ✅
- Created `.github/workflows/release-pml.yml`
- Matrix build for 4 platforms
- Publishes to `Casys-AI/casys-pml` releases

### Task 5: Sync Workflows ✅
- `sync-to-public.yml` - Syncs lib/ to mcp-std
- `sync-pml-package.yml` - Syncs packages/pml/ to casys-pml

### Task 6: Tests ✅
- Version comparison tests
- Binary name detection tests

## File List

**Created:**
- `packages/pml/scripts/install.sh`
- `packages/pml/src/cli/upgrade-command.ts`
- `packages/pml/tests/upgrade_command_test.ts`
- `.github/workflows/release-pml.yml`
- `.github/workflows/sync-pml-package.yml`

**Modified:**
- `packages/pml/deno.json` - Added compile:* tasks
- `packages/pml/src/cli/mod.ts` - Registered upgrade command
- `packages/pml/.gitignore` - Added dist/
- `.github/workflows/sync-to-public.yml` - Syncs lib/ only
- `lib/README.md` - Updated with all categories and links

## Dev Agent Record

### Agent Model Used
Claude Opus 4.5 (claude-opus-4-5-20251101)

### Change Log

| Date | Change |
|------|--------|
| 2026-01-11 | Story created from Epic 14.11 |
| 2026-01-11 | Task 1-5 implemented (GitHub-based) |
| 2026-01-11 | Architecture decision: Public repos instead of R2 |
| 2026-01-11 | Created mcp-std repo for MiniTools |
| 2026-01-11 | Created casys-pml repo for CLI + releases |
| 2026-01-11 | Added sync workflows for both repos |
| 2026-01-11 | Released v0.1.0 |

### References

- [casys-pml releases](https://github.com/Casys-AI/casys-pml/releases)
- [mcp-std repo](https://github.com/Casys-AI/mcp-std)
- [Deno Compile Docs](https://docs.deno.com/runtime/reference/cli/compile/)
