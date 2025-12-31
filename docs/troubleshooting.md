# Troubleshooting Guide - Casys PML

_Generated: 2025-12-31_

## Quick Diagnostics

```bash
# Check service status
deno task prod:status

# View recent logs
deno task prod:logs

# Check database connection
deno task cli status

# Run health check
curl http://localhost:3003/health
```

---

## Common Issues

### 1. Server Won't Start

**Symptom:** `deno task dev` fails or hangs

**Solutions:**

```bash
# Check if port is in use
lsof -i :3003
lsof -i :8081

# Kill existing process
pkill -f "deno.*serve"

# Check environment
cat .env | grep -E "^(PORT|PML_DB)"

# Try fresh start
rm -rf .pml-dev.db
deno task dev
```

**Common causes:**
- Port already in use
- Missing .env file
- Corrupted database

---

### 2. Database Errors

**Symptom:** `Database connection failed` or migration errors

**PGlite (Local Mode):**

```bash
# Backup and restore
deno task db:backup
deno task db:restore

# Full reset (DESTRUCTIVE)
rm -rf .pml-dev.db
deno task dev  # Will recreate
```

**PostgreSQL (Cloud Mode):**

```bash
# Check connection
psql $DATABASE_URL -c "SELECT 1"

# Check Docker
docker compose --profile cloud ps

# Restart PostgreSQL
docker compose --profile cloud restart postgres

# View PostgreSQL logs
docker logs pml-postgres --tail 100
```

---

### 3. MCP Connection Issues

**Symptom:** `MCP client connection failed` or timeouts

**Solutions:**

```bash
# Check MCP servers config
cat config/.mcp-servers.json

# Test individual server
npx -y @modelcontextprotocol/server-filesystem /tmp

# Check if npx/uvx available
which npx uvx

# View connection logs
grep "MCP" ~/.cai/logs/pml.log | tail -50
```

**Common causes:**
- MCP server not installed
- Wrong path in config
- Network/firewall issues

---

### 4. Embedding/Vector Search Issues

**Symptom:** Search returns no results or is very slow

**Solutions:**

```bash
# Check if BGE-M3 model is downloaded
ls -la ~/.cache/huggingface/

# Force model download
deno run --allow-all -c deno.json <<'EOF'
import { pipeline } from "@huggingface/transformers";
const p = await pipeline("feature-extraction", "BAAI/bge-m3");
console.log("Model loaded successfully");
EOF

# Check vector index
psql $DATABASE_URL -c "SELECT COUNT(*) FROM workflow_pattern WHERE intent_embedding IS NOT NULL"
```

**Common causes:**
- Model not downloaded (first run)
- Insufficient disk space
- Memory issues with large embeddings

---

### 5. Sandbox Execution Failures

**Symptom:** `Code execution failed` or permission errors

**Solutions:**

```bash
# Check Deno permissions
deno --version

# Test sandbox manually
deno run --allow-none tests/unit/sandbox/basic_test.ts

# View sandbox logs
grep "sandbox" ~/.cai/logs/pml.log | tail -50
```

**Common causes:**
- Code trying to access forbidden resources
- Timeout exceeded
- PII detected in code

---

### 6. Dashboard Not Loading

**Symptom:** Fresh dashboard shows blank page or errors

**Solutions:**

```bash
# Rebuild dashboard
cd src/web && vite build

# Clear Vite cache
rm -rf src/web/_fresh
rm -rf node_modules/.vite

# Check Fresh logs
deno task dev:fresh 2>&1 | head -100

# Check browser console for errors
# Open DevTools → Console
```

**Common causes:**
- Build artifacts corrupted
- Missing dependencies
- JavaScript errors in islands

---

### 7. Memory Issues

**Symptom:** Process killed, OOM errors

**Solutions:**

```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head -10

# Increase Deno memory limit
DENO_V8_FLAGS="--max-old-space-size=4096" deno task dev

# Monitor during operation
watch -n 1 'ps -o pid,rss,command -p $(pgrep -f "deno.*serve")'
```

**Common causes:**
- Large graph in memory
- Too many embeddings cached
- Memory leak in long-running process

---

### 8. Slow Performance

**Symptom:** Requests take > 5 seconds

**Diagnosis:**

```bash
# Check database query times
psql $DATABASE_URL -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10"

# Check if indexes exist
psql $DATABASE_URL -c "\di"

# Profile specific operation
DENO_PROF=1 deno task dev
```

**Solutions:**

```bash
# Vacuum database
psql $DATABASE_URL -c "VACUUM ANALYZE"

# Rebuild vector index
psql $DATABASE_URL -c "REINDEX INDEX idx_workflow_pattern_embedding"

# Check graph size
deno task cli status | grep -i graph
```

---

### 9. OTEL/Tracing Issues

**Symptom:** No traces in Grafana Tempo

**Solutions:**

```bash
# Check OTEL collector
curl http://localhost:4318/health

# Verify OTEL environment
echo $OTEL_EXPORTER_OTLP_ENDPOINT

# Test trace emission
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[]}'

# Check Docker network
docker network inspect monitoring
```

---

### 10. CI/CD Failures

**Symptom:** GitHub Actions failing

**Local reproduction:**

```bash
# Run same checks as CI
deno lint
deno fmt --check
deno check src/main.ts src/mcp/*.ts src/sandbox/*.ts src/db/*.ts
deno test --allow-all --unstable-worker-options tests/unit/
```

**Common causes:**
- Lint warnings (non-blocking)
- Type errors
- Test failures
- Missing unstable flags

---

## Logs & Debugging

### Log Locations

| Log | Location |
|-----|----------|
| Application | `~/.cai/logs/pml.log` |
| Systemd | `journalctl -u casys-api` |
| Docker | `docker logs <container>` |
| Grafana/Loki | `http://localhost:3000` |

### Debug Mode

```bash
# Enable verbose logging
DEBUG=* deno task dev

# Specific module
DEBUG=mcp:* deno task dev
DEBUG=dag:* deno task dev
DEBUG=graphrag:* deno task dev
```

### Profiling

```bash
# CPU profiling
deno task dev --inspect
# Then open chrome://inspect

# Memory snapshot
deno task dev --inspect-brk
# Capture heap snapshot in DevTools
```

---

## Getting Help

1. **Check existing docs:** `docs/adrs/`, `docs/architecture/`
2. **Search issues:** https://github.com/Casys-AI/casys-pml/issues
3. **Open discussion:** https://github.com/Casys-AI/casys-pml/discussions
4. **Check logs:** Always include relevant log excerpts

### Information to Include

When reporting issues:

```
- PML version: (deno task cli --version)
- Deno version: (deno --version)
- OS: (uname -a)
- Database mode: (PGlite/PostgreSQL)
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs
```
