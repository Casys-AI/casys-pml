# Story 14.11: Binary Distribution via Deno Compile

Status: in-progress

> **Epic:** 14 - JSR Package Local/Cloud MCP Routing
> **Prerequisites:** Stories 14.1-14.8 (DONE)
> **Estimated Effort:** 0.5 day
> **LOC:** ~200 (scripts + workflow)

## Story

As an end user,
I want to install PML as a standalone binary without any runtime dependencies,
so that I can use it immediately without installing Deno, Node, or any other prerequisite.

## Architecture Decision: Cloudflare R2 Distribution

**Context:** The pml-cloud repo is PRIVATE. GitHub Releases would also be private, requiring authentication for downloads.

**Decision:** Distribute binaries via Cloudflare R2 (free egress, CDN).

**Structure:**
```
releases.pml.casys.ai/          # Cloudflare R2 bucket
├── latest.json                 # {"version": "0.2.0"}
├── install.sh                  # Installation script
├── v0.1.0/
│   ├── pml-linux-x64
│   ├── pml-macos-x64
│   ├── pml-macos-arm64
│   └── pml-windows-x64.exe
├── v0.2.0/
│   └── ...
└── latest -> v0.2.0/           # Symlink or redirect
```

**Benefits:**
- No egress fees (Cloudflare R2)
- Fast CDN distribution
- No GitHub auth required
- Control over distribution

## Acceptance Criteria

### AC1-2: Cross-Platform Compilation

**Given** the PML source code
**When** CI/CD runs on release (git tag `v*`)
**Then** it compiles binaries for:
- `pml-linux-x64`
- `pml-macos-x64`
- `pml-macos-arm64`
- `pml-windows-x64.exe`
**And** each binary is self-contained (no external dependencies)

**Given** a compiled binary
**When** user runs `./pml --version`
**Then** it shows version without requiring Deno installed

### AC3-4: Installation Script

**Given** a user on Linux/macOS
**When** they run `curl -fsSL https://releases.pml.casys.ai/install.sh | sh`
**Then** the script:
1. Detects OS and architecture
2. Downloads correct binary from Cloudflare R2
3. Installs to `~/.pml/bin/pml` (or `/usr/local/bin` with sudo)
4. Adds to PATH if needed
5. Prints success: "✓ PML installed. Run 'pml init' to get started."

**Given** a Windows user
**When** they download `pml-windows-x64.exe` from releases.pml.casys.ai
**Then** they can run it directly or add to PATH manually

### AC5-6: Self-Update Command

**Given** PML is installed
**When** user runs `pml upgrade`
**Then** it:
1. Fetches `https://releases.pml.casys.ai/latest.json` for version
2. If newer, downloads new binary from R2
3. Replaces current binary atomically
4. Prints: "✓ Upgraded from v1.0.0 to v1.1.0"

**Given** PML is already latest version
**When** user runs `pml upgrade`
**Then** it prints: "✓ Already up to date (v1.1.0)"

### AC7-8: CI/CD Pipeline

**Given** a git tag `v*` is pushed
**When** GitHub Actions runs
**Then** it:
1. Runs `deno compile` for each platform
2. Uploads binaries to Cloudflare R2
3. Updates `latest.json` with new version
4. Optionally updates Homebrew formula (future)

## Tasks / Subtasks

### Task 1: Add Deno Tasks for Cross-Compilation (~15min)

- [ ] **AC1-2**: Add compilation tasks to `packages/pml/deno.json`
  - [ ] `compile:all` - compile all platforms
  - [ ] `compile:linux` - `deno compile --target x86_64-unknown-linux-gnu`
  - [ ] `compile:macos-x64` - `deno compile --target x86_64-apple-darwin`
  - [ ] `compile:macos-arm` - `deno compile --target aarch64-apple-darwin`
  - [ ] `compile:windows` - `deno compile --target x86_64-pc-windows-msvc`
- [ ] Update current `compile` task to use consistent output path `dist/`

**Files:**
- `packages/pml/deno.json`

### Task 2: Create Installation Script (~30min)

- [x] **AC3-4**: Create `packages/pml/scripts/install.sh` ✅ DONE
  - [x] Detect OS (`uname -s`)
  - [x] Detect architecture (`uname -m`)
  - [x] Map to correct binary name
  - [ ] **TODO**: Update to download from Cloudflare R2 (`releases.pml.casys.ai`)
  - [x] Install to `~/.pml/bin/pml`
  - [x] Add PATH export to shell profile if needed
  - [x] Print success message

**Files:**
- `packages/pml/scripts/install.sh`

### Task 3: Add Upgrade Command (~45min)

- [x] **AC5-6**: Create `src/cli/upgrade-command.ts` ✅ DONE
  - [ ] **TODO**: Fetch from `releases.pml.casys.ai/latest.json` instead of GitHub API
  - [x] Compare with current version
  - [x] If newer:
    - [ ] **TODO**: Download from Cloudflare R2
    - [x] Replace current binary atomically (rename trick)
  - [x] Print upgrade status
- [x] Register command in `src/cli/mod.ts`

**Files:**
- `packages/pml/src/cli/upgrade-command.ts`
- `packages/pml/src/cli/mod.ts`

### Task 4: Create GitHub Actions Release Workflow (~30min)

- [x] **AC7-8**: Create `.github/workflows/release-pml.yml` ✅ DONE (needs update)
  - [x] Trigger on `v*` tags
  - [x] Matrix strategy for cross-compilation
  - [ ] **TODO**: Upload binaries to Cloudflare R2 (instead of GitHub Release)
  - [ ] **TODO**: Update `latest.json` on R2

**Files:**
- `.github/workflows/release-pml.yml`

### Task 6: Setup Cloudflare R2 (~30min) - NEW

- [ ] Create R2 bucket `pml-releases`
- [ ] Configure custom domain `releases.pml.casys.ai`
- [ ] Add R2 credentials to GitHub Secrets:
  - [ ] `CLOUDFLARE_ACCOUNT_ID`
  - [ ] `CLOUDFLARE_R2_ACCESS_KEY_ID`
  - [ ] `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- [ ] Test upload with `wrangler r2 object put`

**Notes:**
- R2 is S3-compatible, can use AWS CLI with custom endpoint
- Free egress (no bandwidth costs)
- 10GB free storage

### Task 5: Tests (~15min)

- [ ] Test `pml upgrade` with mocked GitHub API
- [ ] Test version comparison logic
- [ ] Test atomic binary replacement

**Files:**
- `packages/pml/tests/upgrade_command_test.ts`

## Dev Notes

### Current Compilation Task

The existing `deno.json` already has a working compile task:
```json
"compile": "deno compile -A --unstable-worker-options --no-check --include=./src/sandbox/execution/sandbox-script.ts -o ~/.deno/bin/pml ./src/cli/mod.ts"
```

Key flags to preserve:
- `--unstable-worker-options` - Required for sandbox Worker
- `--include=./src/sandbox/execution/sandbox-script.ts` - Bundle sandbox script

### Cross-Compilation Targets

```bash
# Linux (GitHub Actions runner, servers, WSL)
deno compile -A --unstable-worker-options --no-check \
  --include=./src/sandbox/execution/sandbox-script.ts \
  --target x86_64-unknown-linux-gnu \
  --output dist/pml-linux-x64 ./src/cli/mod.ts

# macOS Intel
deno compile -A --unstable-worker-options --no-check \
  --include=./src/sandbox/execution/sandbox-script.ts \
  --target x86_64-apple-darwin \
  --output dist/pml-macos-x64 ./src/cli/mod.ts

# macOS Apple Silicon
deno compile -A --unstable-worker-options --no-check \
  --include=./src/sandbox/execution/sandbox-script.ts \
  --target aarch64-apple-darwin \
  --output dist/pml-macos-arm64 ./src/cli/mod.ts

# Windows
deno compile -A --unstable-worker-options --no-check \
  --include=./src/sandbox/execution/sandbox-script.ts \
  --target x86_64-pc-windows-msvc \
  --output dist/pml-windows-x64.exe ./src/cli/mod.ts
```

### Cloudflare R2 API for Upgrade

```typescript
// Fetch latest version from R2
const response = await fetch(
  "https://releases.pml.casys.ai/latest.json"
);
const { version } = await response.json(); // { "version": "0.2.0" }

// Download binary from R2
const binaryName = getBinaryName(); // e.g., "pml-linux-x64"
const downloadUrl = `https://releases.pml.casys.ai/v${version}/${binaryName}`;
```

### latest.json Format

```json
{
  "version": "0.2.0",
  "published_at": "2026-01-11T12:00:00Z",
  "checksums": {
    "pml-linux-x64": "sha256:...",
    "pml-macos-x64": "sha256:...",
    "pml-macos-arm64": "sha256:...",
    "pml-windows-x64.exe": "sha256:..."
  }
}
```

### GitHub Actions R2 Upload

```yaml
- name: Upload to Cloudflare R2
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.CLOUDFLARE_R2_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.CLOUDFLARE_R2_SECRET_ACCESS_KEY }}
    AWS_ENDPOINT_URL: https://${{ secrets.CLOUDFLARE_ACCOUNT_ID }}.r2.cloudflarestorage.com
  run: |
    VERSION="${GITHUB_REF#refs/tags/}"

    # Upload binaries
    aws s3 cp release/pml-linux-x64 s3://pml-releases/$VERSION/pml-linux-x64
    aws s3 cp release/pml-macos-x64 s3://pml-releases/$VERSION/pml-macos-x64
    aws s3 cp release/pml-macos-arm64 s3://pml-releases/$VERSION/pml-macos-arm64
    aws s3 cp release/pml-windows-x64.exe s3://pml-releases/$VERSION/pml-windows-x64.exe

    # Update latest.json
    echo '{"version": "'${VERSION#v}'"}' > latest.json
    aws s3 cp latest.json s3://pml-releases/latest.json
```

### Atomic Binary Replacement

```typescript
// Download to temp file
const tempPath = `${Deno.execPath()}.new`;
await downloadFile(url, tempPath);

// Make executable
await Deno.chmod(tempPath, 0o755);

// Atomic rename
const backupPath = `${Deno.execPath()}.old`;
await Deno.rename(Deno.execPath(), backupPath);
await Deno.rename(tempPath, Deno.execPath());

// Cleanup backup
await Deno.remove(backupPath);
```

### Binary Size

Expected size: ~80-100MB per platform (includes Deno runtime).
This is acceptable for dev tools (VS Code is 300MB+).

### Project Structure

```
packages/pml/
├── deno.json              # Updated with compile:* tasks
├── scripts/
│   └── install.sh         # NEW: Installation script
├── src/cli/
│   ├── mod.ts             # Updated: register upgrade
│   └── upgrade-command.ts # NEW: Upgrade command
└── dist/                  # NEW: Build output (gitignored)
    ├── pml-linux-x64
    ├── pml-macos-x64
    ├── pml-macos-arm64
    └── pml-windows-x64.exe

.github/workflows/
├── ci.yml                 # Existing CI
└── release-pml.yml        # NEW: Release workflow
```

### References

- [Source: packages/pml/deno.json] Current compile task
- [Source: .github/workflows/ci.yml] Existing CI workflow
- [Source: Epic 14.11] Story requirements
- [Deno Compile Docs](https://docs.deno.com/runtime/reference/cli/compile/)
- [GitHub Releases API](https://docs.github.com/en/rest/releases)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Change Log

| Date | Change |
|------|--------|
| 2026-01-11 | Story created from Epic 14.11 |
| 2026-01-11 | Task 1-5 implemented (GitHub-based) |
| 2026-01-11 | Architecture decision: Cloudflare R2 instead of GitHub Releases |
| 2026-01-11 | Updated sync-to-public.yml to only sync lib/ |

### Completion Notes List

**Completed:**
- ✅ Cross-compilation deno tasks in deno.json
- ✅ install.sh script (needs URL update to R2)
- ✅ upgrade-command.ts (needs URL update to R2)
- ✅ GitHub Actions workflow (needs R2 upload instead of GitHub Release)
- ✅ Tests for version comparison and binary name detection
- ✅ sync-to-public.yml updated to only sync lib/

**Pending (Cloudflare R2):**
- [ ] Create R2 bucket `pml-releases`
- [ ] Configure custom domain `releases.pml.casys.ai`
- [ ] Add R2 credentials to GitHub Secrets
- [ ] Update install.sh URLs
- [ ] Update upgrade-command.ts URLs
- [ ] Update release-pml.yml to upload to R2

### File List

**Created:**
- `packages/pml/scripts/install.sh`
- `packages/pml/src/cli/upgrade-command.ts`
- `packages/pml/tests/upgrade_command_test.ts`
- `.github/workflows/release-pml.yml`

**Modified:**
- `packages/pml/deno.json` - Added compile:* tasks
- `packages/pml/src/cli/mod.ts` - Registered upgrade command
- `packages/pml/.gitignore` - Added dist/
- `.github/workflows/sync-to-public.yml` - Now syncs only lib/
