# Version Verification

**Last Verified:** 2025-11-13 **Method:** WebSearch + npm registry + Deno Land + JSR

All versions have been verified against their official registries to ensure:

- Current stability status (stable, RC, beta)
- Breaking changes between versions
- Deno compatibility
- Production readiness

| Technology                | Version       | Registry | Status   | Notes                                                                     |
| ------------------------- | ------------- | -------- | -------- | ------------------------------------------------------------------------- |
| Deno                      | 2.5 / 2.2 LTS | deno.com | Stable   | LTS (2.2) recommended for production                                      |
| PGlite                    | 0.3.11        | npm      | Stable   | Electric SQL, production-ready                                            |
| @huggingface/transformers | 3.7.6         | npm      | Stable   | v3 released Oct 2024, WebGPU support, Deno compatible, using BGE-M3 model |
| @modelcontextprotocol/sdk | 1.21.1        | npm      | Stable   | Published recently, 16k+ dependents, active development                   |
| cliffy                    | 1.0.0-rc.8    | JSR      | RC       | Latest stable RC on JSR (July 2024)                                       |
| @std/yaml                 | 1.0.5         | JSR      | Stable   | Stable 1.x on JSR, production-ready                                       |
| @std/log                  | 0.224.14      | JSR      | Unstable | Still 0.x (UNSTABLE), deprecation warning for OpenTelemetry               |
| graphology                | 0.26.0        | npm      | Stable   | Published April 2024, mature library, 138+ dependents                     |

**Version Strategy:**

- **Deno Runtime:** Use 2.2 (LTS) for production stability, 2.5 for latest features
- **cliffy:** Using JSR version rc.8 (latest stable RC, deno.land rc.4 deprecated)
- **Deno std packages:** Migrated to JSR with independent versioning
  - @std/yaml: 1.0.5 (stable 1.x)
  - @std/log: 0.224.14 (still unstable 0.x, future deprecation noted)
- **npm packages:** All latest stable versions verified for Deno compatibility
- **@huggingface/transformers:** Using v3 (3.7.6) with WebGPU support, breaking change from v2

**Breaking Changes Review:**

- **@huggingface/transformers 2.x → 3.x:** Major version bump, package moved to @huggingface org,
  WebGPU support added
- **@std packages:** Now on JSR with independent versions (no longer bundled)
- **@std/log:** Marked UNSTABLE with future migration to OpenTelemetry recommended
- **cliffy:** Using JSR (rc.8), deno.land versions rc.6/rc.7 are broken, use JSR exclusively
- **PGlite 0.3.11:** Stable, no breaking changes expected before 0.4.x

---
