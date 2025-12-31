# Development Guide - Casys PML

_Generated: 2025-12-31_

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Deno | 2.5+ | Runtime & toolchain |
| Node.js | 18+ | Some MCP servers |
| Git | Latest | Version control |
| Docker | 20+ | PostgreSQL, Monitoring |

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/Casys-AI/casys-pml.git
cd casys-pml

# Setup environment
cp .env.example .env

# Start development
deno task dev         # API on :3003
deno task dev:fresh   # Dashboard on :8081
```

---

## Environment Variables

### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `FRESH_PORT` | 8081 | Fresh Dashboard port |
| `PORT_API` | 3003 | API Server port |
| `PML_DB_PATH` | .pml-dev.db | PGlite database path |
| `PML_WORKFLOW_PATH` | config/workflow-templates.yaml | Workflow config |

### Database

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | PostgreSQL password (cloud mode) |
| `DATABASE_URL` | Full PostgreSQL connection string |

### Observability

| Variable | Default | Description |
|----------|---------|-------------|
| `SENTRY_DSN` | - | Sentry error tracking |
| `SENTRY_ENVIRONMENT` | development | Environment tag |
| `SENTRY_TRACES_SAMPLE_RATE` | 1.0 | Trace sampling (0.0-1.0) |
| `GRAFANA_ADMIN_USER` | admin | Grafana admin user |
| `GRAFANA_ADMIN_PASSWORD` | changeme | Grafana admin password |

---

## Deno Tasks

### Development

| Task | Command | Description |
|------|---------|-------------|
| `dev` | `deno task dev` | Start API server (watch mode) |
| `dev:fresh` | `deno task dev:fresh` | Start Fresh dashboard |
| `dev:api` | `deno task dev:api` | Start API with broadcast channel |

### Testing

| Task | Command | Description |
|------|---------|-------------|
| `test` | `deno task test` | Run all tests |
| `test:unit` | `deno task test:unit` | Unit tests only |
| `test:unit:fast` | `deno task test:unit:fast` | Fast unit tests (parallel) |
| `test:unit:slow` | `deno task test:unit:slow` | Slow unit tests (sandbox, server) |
| `test:integration` | `deno task test:integration` | Integration tests |
| `test:e2e` | `deno task test:e2e` | E2E tests (requires RUN_E2E_TESTS=true) |
| `test:arch` | `deno task test:arch` | Architecture tests |

### Code Quality

| Task | Command | Description |
|------|---------|-------------|
| `lint` | `deno task lint` | Run linter |
| `fmt` | `deno task fmt` | Format code |
| `check` | `deno task check` | Type check |

### Database

| Task | Command | Description |
|------|---------|-------------|
| `db:backup` | `deno task db:backup` | Backup dev database |
| `db:restore` | `deno task db:restore` | Restore from backup |
| `db:backup:prod` | `deno task db:backup:prod` | Backup production DB |
| `db:restore:prod` | `deno task db:restore:prod` | Restore production DB |

### Production

| Task | Command | Description |
|------|---------|-------------|
| `prod:start` | `deno task prod:start` | Start all services |
| `prod:stop` | `deno task prod:stop` | Stop all services |
| `prod:restart` | `deno task prod:restart` | Restart all services |
| `prod:status` | `deno task prod:status` | Check service status |
| `prod:logs` | `deno task prod:logs` | View service logs |
| `prod:build` | `deno task prod:build` | Build for production |
| `deploy:all` | `deno task deploy:all` | Full deployment |

### Build

| Task | Command | Description |
|------|---------|-------------|
| `build` | `deno task build` | Compile to binary (`pml`) |
| `build:std` | `deno task build:std` | Build standard library |

---

## Database Modes

### Local Mode (PGlite)

```bash
# Default - uses embedded PGlite
deno task dev
```

- Database file: `.pml-dev.db/`
- No Docker required
- Perfect for development

### Cloud Mode (PostgreSQL)

```bash
# Start PostgreSQL with Docker
docker compose --profile cloud up -d

# Configure connection
export DATABASE_URL="postgresql://casys:password@localhost:5432/casys"

# Start server
deno task dev
```

---

## Monitoring Stack (Docker Compose)

```bash
# Start monitoring
docker compose up -d

# Access dashboards
# Grafana: http://localhost:3000
# Prometheus: http://localhost:9091
# Loki: http://localhost:3100
```

### Services

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Database (cloud mode) |
| Grafana | 3000 | Dashboards & visualization |
| Prometheus | 9091 | Metrics collection |
| Loki | 3100 | Log aggregation |
| Promtail | - | Log shipper |
| Node Exporter | - | System metrics |

---

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/ci.yml`)

| Job | Description | Status |
|-----|-------------|--------|
| `lint` | Lint & format check | Warning only |
| `typecheck` | TypeScript type check | Required |
| `test` | Unit tests | Required |

### Deployment

Deployment is done locally on the server:

```bash
# Full deployment
deno task deploy:all

# Or step by step
git pull origin main
cd src/web && vite build
sudo systemctl restart casys-dashboard casys-api
```

### Systemd Services

| Service | Description |
|---------|-------------|
| `casys-api` | MCP API server |
| `casys-dashboard` | Fresh web dashboard |

---

## Code Style & Conventions

### Formatting

```bash
# Format all files
deno fmt

# Check formatting
deno fmt --check
```

### Linting

```bash
# Run linter
deno lint
```

### Type Checking

```bash
# Check types
deno task check
```

---

## Branch Naming

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feature/` | New features | `feature/dag-visualization` |
| `fix/` | Bug fixes | `fix/search-ranking` |
| `docs/` | Documentation | `docs/api-reference` |
| `refactor/` | Refactoring | `refactor/gateway-cleanup` |

---

## Commit Convention

```
type(scope): description

feat(search): add semantic tool search
fix(dag): resolve parallel execution bug
docs(readme): update installation instructions
refactor(gateway): simplify request handling
```

---

## Pull Request Checklist

- [ ] Tests pass (`deno task test`)
- [ ] Code formatted (`deno fmt`)
- [ ] No lint errors (`deno lint`)
- [ ] Types check (`deno task check`)
- [ ] Documentation updated (if needed)

---

## Useful Commands

```bash
# Run specific test file
deno test src/graphrag/graph.test.ts

# Run tests with coverage
deno test --coverage=coverage_data

# Generate coverage report
deno coverage coverage_data --lcov > coverage.lcov

# Run benchmarks
deno task bench

# Start MCP server only
deno task mcp

# CLI commands
deno task cli init
deno task cli serve
deno task cli status
```
