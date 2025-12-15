# Casys PML - Quick Start Guide

> Get up and running with Casys PML in 5 minutes.

## Prerequisites

- **Deno 2.x** - [Install Deno](https://docs.deno.com/runtime/getting_started/installation/)
- **Git** - For cloning the repository

```bash
# Verify Deno installation
deno --version
# Should show: deno 2.x.x
```

---

## 1. Clone & Setup

```bash
# Clone the repository
git clone https://github.com/your-org/casys-pml.git
cd casys-pml

# Copy environment template
cp .env.example .env

# Install dependencies (cached automatically by Deno)
deno task check
```

---

## 2. Start Development Servers

### Option A: API Gateway Only (MCP Development)

```bash
deno task dev
# API running at http://localhost:3003
```

### Option B: Full Stack (API + Dashboard)

```bash
# Terminal 1: API Gateway
deno task dev

# Terminal 2: Fresh Dashboard
deno task dev:fresh
# Dashboard at http://localhost:8081
```

---

## 3. Initialize MCP Servers

```bash
# Discover and index MCP servers
deno task cli init

# Check status
deno task cli status
```

---

## 4. Run Tests

```bash
# All tests
deno task test

# Unit tests only (fast)
deno task test:unit

# Integration tests
deno task test:integration

# Type checking
deno task check
```

---

## 5. Code Quality

```bash
# Format code
deno task fmt

# Lint code
deno task lint

# Both before committing
deno task fmt && deno task lint && deno task check
```

---

## Project Structure (Key Directories)

```
src/
├── main.ts          # Entry point
├── mcp/             # MCP Gateway (start here for protocol work)
├── dag/             # DAG execution engine
├── graphrag/        # Hypergraph algorithms
├── sandbox/         # Secure code execution
├── web/             # Fresh dashboard
│   ├── routes/      # BFF routes
│   └── islands/     # Interactive components
└── db/              # Database (PGlite + Drizzle)

tests/
├── unit/            # Unit tests (mirror of src/)
└── integration/     # Integration tests

docs/
├── architecture/    # Architecture docs
├── adrs/            # Decision records (46 ADRs)
└── sprint-artifacts/# Story implementations
```

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `deno.json` | Tasks, imports, compiler options |
| `src/main.ts` | Application entry point |
| `src/mcp/gateway-server.ts` | MCP Gateway (8 meta-tools) |
| `src/web/routes/` | Dashboard routes (BFF pattern) |
| `docs/project_context.md` | AI agent rules |
| `docs/project-overview.md` | Full project overview |

---

## Common Tasks

### Add a new MCP tool
1. Add tool definition in `src/mcp/gateway-server.ts`
2. Implement handler in `src/mcp/gateway-handler.ts`
3. Add tests in `tests/unit/mcp/`

### Add a new database table
1. Create migration in `src/db/migrations/XXX_name.ts`
2. Register in `src/db/migrations.ts`
3. Run `deno task db:generate`

### Add a new dashboard page
1. Create route in `src/web/routes/your-page.tsx`
2. For interactivity, create island in `src/web/islands/`
3. Use existing components from `src/web/components/ui/`

### Add a new ADR
1. Create `docs/adrs/ADR-XXX-title.md`
2. Follow format: Context → Decision → Consequences

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT_API` | 3003 | API Gateway port |
| `FRESH_PORT` | 8081 | Dashboard port |
| `PML_DB_PATH` | .pml-dev.db | Database path |
| `SENTRY_DSN` | (optional) | Error tracking |

---

## Useful Links

- [Project Overview](./project-overview.md) - Full technical overview
- [Architecture](./architecture/index.md) - Architecture documentation
- [ADRs](./adrs/index.md) - Decision records
- [PRD](./PRD.md) - Product requirements

---

## Troubleshooting

### Port already in use
```bash
# Find and kill process on port 3003
lsof -i :3003
kill -9 <PID>
```

### Database issues
```bash
# Reset dev database
rm -rf .pml-dev.db
deno task cli init
```

### Type errors
```bash
# Clear Deno cache and recheck
deno cache --reload src/main.ts
deno task check
```

---

## Need Help?

- Check [docs/](./index.md) for detailed documentation
- Review [ADRs](./adrs/) for architectural decisions
- Look at [sprint-artifacts/](./sprint-artifacts/) for implementation patterns
