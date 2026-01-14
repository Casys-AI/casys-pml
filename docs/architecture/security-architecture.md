# Security Architecture

_Last Updated: January 2026_

## Threat Model

### Assets to Protect

| Asset                         | Criticality | Primary Threats                          |
| ----------------------------- | ----------- | ---------------------------------------- |
| User API Keys (BYOK)          | Critical    | Exfiltration, logging exposure           |
| User Code (sandbox)           | High        | Injection, privilege escalation          |
| MCP Data (files, API)         | High        | Unauthorized access, exfiltration        |
| User Database Records         | High        | Cross-tenant access, data leakage        |
| Database (PGlite/PostgreSQL)  | Medium      | Corruption, SQL injection                |
| MCP Configuration             | Medium      | Manipulation, exposed secrets            |
| Embeddings/GraphRAG           | Low         | Model poisoning                          |

### Attack Vectors and Mitigations

```
+-------------------------------------------------------------+
|                    THREAT MODEL                             |
+-------------------------------------------------------------+
|                                                             |
|  [Attacker]                                                 |
|       |                                                     |
|       v                                                     |
|  +-----------+    +-----------+    +-----------+            |
|  | Code      |    | MCP Abuse |    | Data      |            |
|  | Injection |    | (tool)    |    | Exfil     |            |
|  +-----------+    +-----------+    +-----------+            |
|       |                |                |                   |
|       v                v                v                   |
|  +-----------------------------------------------------+   |
|  |              SECURITY CONTROLS                       |   |
|  |  - Deno permissions sandbox (permissions: "none")    |   |
|  |  - Worker RPC isolation (no direct MCP access)       |   |
|  |  - Input validation (JSON Schema via ajv)            |   |
|  |  - API key sanitization (log redaction)              |   |
|  |  - Multi-tenant data isolation (user_id UUID FK)     |   |
|  |  - Rate limiting (sliding window per-client)         |   |
|  |  - BYOK placeholder detection                        |   |
|  +-----------------------------------------------------+   |
|                                                             |
+-------------------------------------------------------------+
```

---

## Authentication Architecture

### Multi-Tenant Auth System (Migration 039)

The system supports two authentication modes:

| Mode  | Trigger                  | user_id Type | Authentication Method        |
| ----- | ------------------------ | ------------ | ---------------------------- |
| Local | No GITHUB_CLIENT_ID      | "local"      | Bypassed (dev mode)          |
| Cloud | GITHUB_CLIENT_ID is set  | UUID         | GitHub OAuth + API Key       |

**Database Schema:**

```sql
-- users table (db/schema/users.ts)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id TEXT UNIQUE,
  username TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  api_key_hash TEXT,           -- Argon2id hash
  api_key_prefix TEXT UNIQUE,  -- First 11 chars for O(1) lookup
  api_key_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### API Key Security

API keys follow a secure generation and storage pattern:

```typescript
// Format: ac_ + 24 random alphanumeric chars = 27 chars total
// Example: ac_A1b2C3d4E5f6G7h8I9j0K1l2

// Security properties:
// - High entropy: 24 chars from 62-char alphabet (~143 bits)
// - Memory-hard hashing: Argon2id (resistant to GPU attacks)
// - O(1) lookup: Prefix-based (first 11 chars) for DB query
// - One-time display: Full key shown once, never retrievable
```

**Validation Flow:**

1. Extract prefix (11 chars) for O(1) database lookup
2. Find user by `api_key_prefix`
3. Verify full key against `api_key_hash` using Argon2id
4. Check user against whitelist (if configured)

### User Whitelist Support

Multi-tenant deployments can restrict access to approved users:

```typescript
// Environment variable: ALLOWED_GITHUB_USERS
// Format: Comma-separated list of GitHub usernames
// Example: ALLOWED_GITHUB_USERS=alice,bob,charlie

// Behavior:
// - If not set or empty: All authenticated users allowed
// - If set: Only listed usernames can access
// - Applies to both OAuth sessions and API key auth
```

### Session Management

Sessions are stored in Deno KV with automatic expiration:

| Session Type   | TTL        | Purpose                           |
| -------------- | ---------- | --------------------------------- |
| User Session   | 30 days    | OAuth authentication state        |
| Flash API Key  | 5 minutes  | One-time API key display          |

---

## BYOK (Bring Your Own API Keys) Security Model

### Key Detection and Validation

The BYOK system prevents accidental use of placeholder values:

```typescript
// Invalid key patterns (byok/types.ts)
const INVALID_KEY_PATTERNS = [
  /^$/,                     // Empty
  /^x{2,}$/i,               // xxx, XXX
  /^your[-_]?key/i,         // your-key, yourkey
  /^<.*>$/,                 // <your-key>
  /^TODO$/i,                // TODO
  /^CHANGE[-_]?ME$/i,       // CHANGE_ME
  /^placeholder$/i,         // placeholder
  /^test[-_]?key$/i,        // test-key
  /^fake[-_]?key$/i,        // fake-key
  /^example$/i,             // example
  /^insert[-_]?here$/i,     // insert-here
  /^replace[-_]?me$/i,      // replace-me
];
```

### API Key Sanitization

All logs and error messages are sanitized to prevent key exposure:

```typescript
// Redaction patterns (byok/sanitizer.ts)
const REDACT_PATTERNS = [
  /([A-Z_]+_API_KEY)=([^\s"']+)/gi,  // FOO_API_KEY=abc123
  /(sk-ant-[a-zA-Z0-9-]+)/g,         // Anthropic: sk-ant-api03-...
  /(sk-[a-zA-Z0-9]{20,})/g,          // OpenAI: sk-...
  /(tvly-[a-zA-Z0-9]+)/g,            // Tavily: tvly-...
  /(exa[_-][a-zA-Z0-9]+)/gi,         // Exa: exa-...
  /(Bearer\s+[a-zA-Z0-9._-]+)/gi,    // Bearer tokens
];

// Result: "Using key: sk-ant-api03-xxx" -> "Using key: [REDACTED]"
```

### HIL (Human-in-the-Loop) Key Flow

When capabilities require API keys:

```
1. Capability declares envRequired: ["TAVILY_API_KEY"]
2. PML checks key via checkKeys()
3. If missing/invalid -> HIL pause with instruction
4. User adds key to .env file
5. User clicks "continue"
6. reloadEnv() loads from .env
7. Code re-executes with key available
```

---

## Sandbox Isolation

### Deno Worker Permissions

```typescript
// Worker RPC Bridge (ADR-032)
new Worker(workerScript, {
  type: "module",
  deno: {
    permissions: "none",  // Zero permissions by default
  },
});
```

**Permissions Denied in Sandbox:**

- `--allow-read` - No filesystem access (except injected context)
- `--allow-write` - No write access
- `--allow-net` - No network access
- `--allow-run` - No subprocess execution
- `--allow-env` - No environment variable access
- `--allow-ffi` - No FFI access

### Hybrid Routing Architecture

Tools are routed based on security classification:

```
+------------------------+      +------------------------+
| Main Process           |      | Sandbox Worker         |
| (full permissions)     |      | (permissions: "none")  |
+------------------------+      +------------------------+
| - MCP Clients          |<---->| - Tool Proxies         |
| - WorkerBridge         | RPC  | - User Code Execution  |
| - Rate Limiter         |      | - No direct MCP access |
| - Auth Validator       |      |                        |
+------------------------+      +------------------------+
         |
         v
+------------------------+
| Hybrid Router          |
| - client: local exec   |
| - server: forward to   |
|   cloud endpoint       |
+------------------------+
```

**Routing Types:**

| Routing  | Execution Location | Use Case                     |
| -------- | ------------------ | ---------------------------- |
| client   | Local machine      | Filesystem, local tools      |
| server   | Cloud endpoint     | Database, sensitive APIs     |

### Security Validator

The SecurityValidator class (`src/sandbox/security-validator.ts`) blocks dangerous patterns:

```typescript
const DANGEROUS_PATTERNS = [
  { regex: /\beval\s*\(/,           type: "EVAL_USAGE",           severity: "CRITICAL" },
  { regex: /\bFunction\s*\(/,       type: "FUNCTION_CONSTRUCTOR", severity: "CRITICAL" },
  { regex: /__proto__/,             type: "PROTO_POLLUTION",      severity: "HIGH" },
  { regex: /constructor\s*\[\s*["']prototype["']\s*\]/, type: "CONSTRUCTOR_PROTOTYPE", severity: "HIGH" },
  { regex: /__defineGetter__/,      type: "DEFINE_GETTER",        severity: "HIGH" },
  { regex: /__defineSetter__/,      type: "DEFINE_SETTER",        severity: "HIGH" },
  { regex: /\bimport\s*\(/,         type: "DYNAMIC_IMPORT",       severity: "MEDIUM" },
];

// Context key validation
const DANGEROUS_CONTEXT_KEYS = [
  "__proto__", "constructor", "prototype",
  "__defineGetter__", "__defineSetter__",
  "__lookupGetter__", "__lookupSetter__",
];
```

**Validation Features:**

- Maximum code length: 100KB (configurable)
- Maximum context nesting depth: 10 levels
- No function values in context (must be JSON-serializable)
- Pattern-based detection with severity levels

---

## Rate Limiting

### Sliding Window Rate Limiter

The rate limiter (`lib/server/src/rate-limiter.ts`) provides per-client throttling:

```typescript
const limiter = new RateLimiter({
  maxRequests: 100,  // Requests per window
  windowMs: 60000,   // 1 minute sliding window
});

// Usage
if (limiter.checkLimit(clientId)) {
  // Execute request
} else {
  // Rate limited - return 429
  const waitMs = limiter.getTimeUntilSlot(clientId);
}
```

**Features:**

- Per-key rate limiting (client ID, IP, user_id)
- Sliding window for smooth enforcement
- Automatic cleanup of old timestamps
- Exponential backoff waiting (`waitForSlot()`)
- Metrics for monitoring (`getMetrics()`)

---

## Input Validation

### JSON Schema Validation (ajv)

The SchemaValidator class (`lib/server/src/schema-validator.ts`) validates MCP tool arguments:

```typescript
const validator = new SchemaValidator();

// Register tool schema
validator.addSchema("my_tool", {
  type: "object",
  properties: {
    count: { type: "number", minimum: 0 },
    query: { type: "string", maxLength: 1000 },
  },
  required: ["count"],
});

// Validate (returns detailed errors)
const result = validator.validate("my_tool", args);
if (!result.valid) {
  // result.errors: [{ message, path, value, expected }]
}

// Or throw on invalid
validator.validateOrThrow("my_tool", args);
```

**ajv Configuration:**

```typescript
new Ajv({
  allErrors: true,      // Report all errors, not just first
  strict: false,        // Allow additional keywords
  useDefaults: true,    // Apply default values
  coerceTypes: false,   // Strict type validation
});
```

### CLI Argument Validation

```typescript
// Validation via cliffy
const command = new Command()
  .option("--config <path:file>", "Config file path")  // Validated as file
  .option("--port <port:integer>", "Server port", { default: 3001 })
  .option("--timeout <ms:integer>", "Timeout", { default: 30000 });
```

---

## Multi-Tenant Data Isolation

### User ID Foreign Key Architecture (Migration 039)

All user-specific tables reference the users table via UUID foreign key:

```sql
-- Tables with user_id UUID FK:
-- - capability_records
-- - workflow_pattern
-- - execution_trace
-- - workflow_execution
-- - algorithm_traces
-- - entropy_history

-- Example FK constraint:
ALTER TABLE execution_trace
ADD CONSTRAINT fk_execution_trace_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
```

### Query Filtering

```typescript
// buildUserFilter() from lib/auth.ts
// Cloud mode: Filter by user_id
// Local mode: No filtering (all data visible)

function buildUserFilter(authResult: AuthResult | null): UserFilter {
  if (!isCloudMode() || !authResult || authResult.user_id === "local") {
    return { where: null, params: [] };
  }

  return {
    where: "user_id = $1::uuid",
    params: [authResult.user_id],
  };
}
```

---

## Database Security

### Dual-Mode Database Support

| Mode  | Backend     | Use Case                    | Connection                |
| ----- | ----------- | --------------------------- | ------------------------- |
| Local | PGlite      | Development, single-user    | Embedded file             |
| Cloud | PostgreSQL  | Production, multi-tenant    | DATABASE_URL              |

### SQL Injection Prevention

```sql
-- Always use parameterized queries
SELECT * FROM mcp_tools WHERE server_name = $1 AND tool_name = $2;

-- Never use string interpolation
-- BAD: SELECT * FROM mcp_tools WHERE name = '${userInput}'
```

---

## Network Security

### Transport Modes

| Mode     | Exposure           | Use Case                  |
| -------- | ------------------ | ------------------------- |
| stdio    | None (local IPC)   | Claude Desktop, CLI       |
| HTTP/SSE | localhost:3001     | Dashboard, debugging      |
| HTTPS    | Configurable       | Production deployment     |

### CORS Configuration

```typescript
// Strict CORS for dashboard
const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:8080",
  "Access-Control-Allow-Methods": "GET, POST",
  "Access-Control-Allow-Headers": "Content-Type",
};
```

---

## Production Security Validation

The system refuses to start in production without authentication:

```typescript
// validateAuthConfig() from lib/auth.ts
// DENO_ENV=production + no GITHUB_CLIENT_ID = FAIL

if (!hasAuth && isProduction) {
  throw new Error(
    "SECURITY: Cannot start in production without authentication configured"
  );
}
```

---

## Audit & Logging

### Execution Traces

```typescript
interface ExecutionTrace {
  timestamp: Date;
  operation: "tool_call" | "code_execution" | "dag_step";
  server: string;
  tool: string;
  args_hash: string;  // Hash of arguments (not values)
  result_type: "success" | "error" | "timeout";
  duration_ms: number;
  user_id: string;    // UUID FK (Migration 039)
}
```

### Audited Events

| Event                  | Level | Logged Data                      |
| ---------------------- | ----- | -------------------------------- |
| Tool call              | INFO  | server, tool, duration           |
| Code execution         | INFO  | code_hash, duration              |
| Security violation     | WARN  | pattern, source                  |
| Sandbox escape attempt | ERROR | full context                     |
| API key detected       | DEBUG | count by type (not values)       |
| Rate limit hit         | WARN  | client_id, requests/window       |

---

## Secure Defaults

| Configuration               | Default Value     | Rationale                       |
| --------------------------- | ----------------- | ------------------------------- |
| `piiProtection`             | `true`            | Protection by default           |
| `sandbox.permissions`       | `"none"`          | Principle of least privilege    |
| `network.cors`              | `localhost` only  | No external access              |
| `telemetry`                 | `opt-in`          | Privacy respect                 |
| `speculation.dangerous_ops` | `disabled`        | Security over performance       |
| `ajv.coerceTypes`           | `false`           | Strict type validation          |
| `session.ttl`               | `30 days`         | Balance security/convenience    |
| `flash.ttl`                 | `5 minutes`       | Minimize key exposure window    |

---

## Dangerous Operations Blocklist

Operations never executed in speculative mode:

```typescript
const DANGEROUS_OPS = [
  /delete/i,
  /remove/i,
  /destroy/i,
  /drop/i,
  /deploy/i,
  /publish/i,
  /send_email/i,
  /payment/i,
  /transfer/i,
  /execute_sql/i,  // Raw SQL
];
```

---

_References:_

- [ADR-032: Sandbox Worker RPC Bridge](./architecture-decision-records-adrs.md#adr-032-sandbox-worker-rpc-bridge)
- [Pattern 5: Agent Code Execution](./pattern-5-agent-code-execution-local-processing-epic-3.md)
- [Pattern 6: Worker RPC Bridge](./pattern-6-worker-rpc-bridge-emergent-capabilities-epic-7.md)
- [Migration 039: User FQDN Multi-Tenant](../../src/db/migrations/039_user_fqdn_multi_tenant.ts)
