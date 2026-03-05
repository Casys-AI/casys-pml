# Vault Runtime Dependencies — Plan

Date: 2026-03-05

## Goal
Allow each note to declare runtime dependencies (API, MCP, packages, permissions) in frontmatter, resolved at execution time.

## Security rule (non-negotiable)
- No raw secrets in note frontmatter.
- Only secret references (e.g. `secretRef`, env key names).
- Fail closed when a required secret is missing.

## Scope v1
1. Frontmatter schema for `runtime.dependencies`:
   - `apis[]` (name, baseUrl, auth.secretRef/envRef)
   - `mcps[]` (server id, transport, auth.secretRef/envRef)
   - `packages[]` (name, version)
   - `permissions` (network/fs/tool caps)
2. Resolver layer:
   - map refs -> runtime env values
   - validate required refs before execution
3. Init-time policy (decision):
   - `init` performs dependency checks for nodes declaring required secret refs
   - if a required secret is missing, `init` fails (blocking) with clear warning + machine error
   - avoid scoring synthetic-path quality as "bad routing" when failure reason is missing secret
4. Preflight output (machine-first JSONL):
   - resolved dependencies summary (redacted)
   - missing refs/errors with stable codes
5. Deterministic error model:
   - `ERR_DEP_MISSING_SECRET`
   - `ERR_DEP_INVALID_SCHEMA`
   - `ERR_DEP_UNSUPPORTED_PROVIDER`
   - `ERR_INIT_DEP_BLOCKED`

## Non-goals v1
- Automatic package install in production runs.
- Secret storage backend implementation (reuse existing env/secret providers).

## Acceptance criteria
- A note can declare MCP/API deps with secret refs only.
- Run fails early with explicit machine-readable errors when refs are missing.
- No secret value appears in logs/output.

## Next
After this, connect to skill-node and subagent-node execution contracts.
