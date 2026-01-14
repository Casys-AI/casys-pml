# ADR-063: Open Source Distribution Strategy

**Status:** Accepted
**Date:** 2026-01-11
**Decision Makers:** Engineering Team

## Context

PML Cloud is a private repository containing:
- Proprietary algorithms (GraphRAG, SHGAT, learning)
- MiniTools standard library (318+ MCP tools)
- CLI package for end users

We needed a distribution strategy that:
1. Keeps proprietary code private
2. Allows open source contribution to utilities
3. Enables binary distribution without authentication
4. Maintains transparency for CLI code

## Decision

**Use TWO public repositories** for open source code and binary distribution:

### Repository Structure

```
casys-pml-cloud (PRIVATE)
├── src/                    # Proprietary: GraphRAG, SHGAT, learning
├── lib/                    # Open source: MiniTools
├── packages/pml/           # Open source: CLI package
└── .github/workflows/
    ├── sync-to-public.yml      # Syncs lib/ → mcp-std
    ├── sync-pml-package.yml    # Syncs packages/pml/ → casys-pml
    └── release-pml.yml         # Builds binaries → casys-pml releases

Casys-AI/mcp-std (PUBLIC - MIT)
├── std/                    # MiniTools (~318 tools)
├── mcp-tools-server.ts     # MCP server
├── mcp-tools.ts            # Re-exports
└── README.md, LICENSE

Casys-AI/casys-pml (PUBLIC - MIT)
├── src/cli/                # CLI source code
├── src/sandbox/            # Sandbox execution
├── scripts/install.sh      # Installation script
└── Releases/               # Compiled binaries
```

### Sync Workflows

1. **sync-to-public.yml**: Triggers on `lib/**` changes
   - Copies lib/ contents to mcp-std root
   - Preserves .github/ and other files in public repo

2. **sync-pml-package.yml**: Triggers on `packages/pml/**` changes
   - Copies packages/pml/ contents to casys-pml
   - Adds MIT LICENSE

3. **release-pml.yml**: Triggers on `v*` tags
   - Cross-compiles for 4 platforms
   - Creates GitHub Release on casys-pml
   - Includes install.sh and checksums

## Consequences

### Positive
- MiniTools can receive community contributions
- CLI code is transparent (builds trust)
- Binary distribution via GitHub Releases (free, reliable CDN)
- Proprietary algorithms remain private
- Single source of truth (pml-cloud)
- Automatic sync on push

### Negative
- Slight delay in sync (few seconds)
- Need to maintain PUBLIC_REPO_PAT secret
- Two repos to manage for open source

## Alternatives Considered

### Cloudflare R2
- **Pros:** No egress fees, CDN, full control
- **Cons:** More setup, separate from code hosting
- **Why rejected:** GitHub Releases are simpler and sufficient

### Single Public Repo
- **Pros:** Simpler structure
- **Cons:** Would expose proprietary code
- **Why rejected:** Security concern

### No Open Source
- **Pros:** Full control, no maintenance
- **Cons:** Less trust, no community contributions
- **Why rejected:** Open source MiniTools adds value

## References

- [Story 14.11](../../implementation-artifacts/14-11-binary-distribution-deno-compile.md)
- [mcp-std repo](https://github.com/Casys-AI/mcp-std)
- [casys-pml repo](https://github.com/Casys-AI/casys-pml)
