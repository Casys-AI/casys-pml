# Project Initialization

**First Story (1.1):** Initialize project using Deno's official tooling:

```bash
deno init cai
cd cai
```

**What This Provides:**

- `deno.json` - Configuration file with tasks, imports, and compiler options
- `main.ts` - Entry point template
- `main_test.ts` - Testing setup with Deno.test
- Standard Deno conventions: TypeScript by default, ES modules

**Deno Version:** 2.5 (latest) / 2.2 (LTS)

**Additional Setup Required:**

- CLI structure (commands: init, serve, status) via cliffy
- Project organization (src/, tests/, docs/)
- Dependencies centralization (deps.ts pattern)
- PGlite database initialization

---
