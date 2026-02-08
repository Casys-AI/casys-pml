# Hero Section V2 - Use Cases & Workflows

## Concept
"Parlez. L'application apparaît." - Démontrer la puissance de PML avec des workflows réels et des UIs variées.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Hero Section                              │
├──────────────────┬──────────────────────────────────────────────┤
│   Chat Panel     │              Canvas (MCP UI)                  │
│   (260px)        │              (flex-1)                         │
│                  │                                               │
│  ┌────────────┐  │  ┌─────────────────────────────────────────┐ │
│  │ Message 1  │  │  │                                         │ │
│  │ ✓ rendered │  │  │         Real MCP UI Component           │ │
│  ├────────────┤  │  │         (timeline, diff, table,         │ │
│  │ Message 2  │  │  │          waterfall, etc.)               │ │
│  │ ● active   │  │  │                                         │ │
│  ├────────────┤  │  │                                         │ │
│  │ Message 3  │  │  │                                         │ │
│  │ ○ pending  │  │  └─────────────────────────────────────────┘ │
│  └────────────┘  │                                               │
├──────────────────┴──────────────────────────────────────────────┤
│              [ DevOps ]  [ Security ]  [ Data ]                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Use Case 1: DevOps (ex-Deploy)

**Persona**: Site Reliability Engineer, DevOps, Platform Engineer
**Pain point**: Orchestrer des déploiements, monitorer, debugger

### Workflow 1: Deploy to Production
- **Message**: "Deploy api v2.3 to production"
- **UI**: `timeline-viewer`
- **Value**: Voir chaque étape du déploiement en temps réel
- **Mock Data**:
  ```json
  {
    "title": "Deploy api:v2.3 → Production",
    "events": [
      { "timestamp": "T+0s", "type": "info", "title": "Fetching release", "description": "Tag v2.3.0 from main" },
      { "timestamp": "T+2s", "type": "info", "title": "Building image", "description": "api:v2.3.0 → registry" },
      { "timestamp": "T+8s", "type": "info", "title": "Rolling update", "description": "0/3 pods ready" },
      { "timestamp": "T+12s", "type": "success", "title": "Pod 1/3 ready", "description": "api-7d8f9-abc12" },
      { "timestamp": "T+15s", "type": "success", "title": "Pod 2/3 ready", "description": "api-7d8f9-def34" },
      { "timestamp": "T+18s", "type": "success", "title": "Pod 3/3 ready", "description": "api-7d8f9-ghi56" },
      { "timestamp": "T+20s", "type": "success", "title": "Deploy complete", "description": "All pods healthy" }
    ]
  }
  ```

### Workflow 2: Compare Configs (KILLER FEATURE)
- **Message**: "Compare staging vs prod config"
- **UI**: `diff-viewer`
- **Value**: Voir les différences AVANT de déployer - éviter les incidents
- **Mock Data**:
  ```json
  {
    "filename": "config/api.yaml",
    "oldLabel": "staging",
    "newLabel": "production",
    "hunks": [
      {
        "header": "@@ -12,8 +12,8 @@",
        "lines": [
          { "type": "context", "content": "database:" },
          { "type": "context", "content": "  host: db.internal" },
          { "type": "remove", "content": "  pool_size: 10" },
          { "type": "add", "content": "  pool_size: 50" },
          { "type": "remove", "content": "  timeout: 5000" },
          { "type": "add", "content": "  timeout: 30000" },
          { "type": "context", "content": "  ssl: true" }
        ]
      },
      {
        "header": "@@ -28,4 +28,6 @@",
        "lines": [
          { "type": "context", "content": "cache:" },
          { "type": "remove", "content": "  enabled: false" },
          { "type": "add", "content": "  enabled: true" },
          { "type": "add", "content": "  ttl: 3600" },
          { "type": "add", "content": "  provider: redis" }
        ]
      }
    ]
  }
  ```

### Workflow 3: Analyze API Latency (KILLER FEATURE)
- **Message**: "Why is /api/users slow?"
- **UI**: `waterfall-viewer`
- **Value**: Breakdown du timing HTTP - identifier le bottleneck
- **Mock Data**:
  ```json
  {
    "title": "GET /api/users - 847ms",
    "requests": [
      { "url": "/api/users", "method": "GET", "status": 200, "totalTime": 847,
        "phases": { "dns": 12, "connect": 23, "tls": 45, "ttfb": 692, "download": 75 } },
      { "url": "/db/query", "method": "POST", "status": 200, "totalTime": 623,
        "phases": { "dns": 0, "connect": 2, "tls": 0, "ttfb": 618, "download": 3 } },
      { "url": "/cache/get", "method": "GET", "status": 404, "totalTime": 15,
        "phases": { "dns": 0, "connect": 1, "tls": 0, "ttfb": 12, "download": 2 } }
    ]
  }
  ```

---

## Use Case 2: Security

**Persona**: Security Engineer, DevSecOps, SRE
**Pain point**: Auditer, vérifier les certificats, analyser les tokens

### Workflow 1: Check SSL Certificate
- **Message**: "Check SSL cert for api.example.com"
- **UI**: `certificate-viewer`
- **Value**: Voir expiration, chain, SANs - éviter les outages
- **Mock Data**:
  ```json
  {
    "host": "api.example.com",
    "port": 443,
    "valid": true,
    "certificate": {
      "subject": "CN=api.example.com",
      "issuer": "CN=Let's Encrypt Authority X3",
      "validFrom": "2024-01-15T00:00:00Z",
      "validTo": "2024-04-15T00:00:00Z",
      "daysRemaining": 42,
      "sans": ["api.example.com", "*.api.example.com"]
    },
    "chain": [
      { "subject": "CN=api.example.com", "issuer": "CN=Let's Encrypt Authority X3" },
      { "subject": "CN=Let's Encrypt Authority X3", "issuer": "CN=DST Root CA X3" }
    ]
  }
  ```

### Workflow 2: Decode JWT Token (KILLER FEATURE)
- **Message**: "Decode this JWT token"
- **UI**: `jwt-viewer`
- **Value**: Voir header, payload, expiration - debugger l'auth
- **Mock Data**:
  ```json
  {
    "raw": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "header": {
      "alg": "RS256",
      "typ": "JWT",
      "kid": "key-2024-01"
    },
    "payload": {
      "sub": "user_12345",
      "email": "alice@example.com",
      "roles": ["admin", "developer"],
      "iat": 1704067200,
      "exp": 1704153600,
      "iss": "auth.example.com"
    },
    "signature": "valid",
    "expired": false,
    "expiresIn": "23h 45m"
  }
  ```

### Workflow 3: Analyze HTTP Headers
- **Message**: "Check security headers for example.com"
- **UI**: `headers-viewer`
- **Value**: Audit CORS, CSP, HSTS - identifier les failles
- **Mock Data**:
  ```json
  {
    "url": "https://example.com",
    "status": 200,
    "type": "response",
    "headers": {
      "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "x-xss-protection": "1; mode=block",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "geolocation=(), microphone=()"
    },
    "missing": ["Content-Security-Policy-Report-Only"],
    "score": "A"
  }
  ```

---

## Use Case 3: Data

**Persona**: Data Engineer, Analyst, Backend Developer
**Pain point**: Explorer les données, comprendre les schémas, debugger les queries

### Workflow 1: Query Database
- **Message**: "Show top customers by revenue"
- **UI**: `table-viewer`
- **Value**: Table interactive, triable, filtrable
- **Mock Data**:
  ```json
  {
    "columns": ["Customer", "Revenue", "Orders", "Region", "Since"],
    "rows": [
      ["Acme Corp", "$1.2M", 847, "NA", "2019"],
      ["TechStart Inc", "$890K", 523, "EU", "2020"],
      ["GlobalTech", "$654K", 412, "APAC", "2021"],
      ["DataFlow Ltd", "$543K", 389, "NA", "2020"],
      ["CloudNine", "$432K", 298, "EU", "2022"]
    ]
  }
  ```

### Workflow 2: Show Database Schema (KILLER FEATURE)
- **Message**: "Show schema for orders database"
- **UI**: `erd-viewer`
- **Value**: Diagramme ER interactif - comprendre les relations
- **Mock Data**:
  ```json
  {
    "schema": "orders",
    "tables": [
      {
        "name": "customers",
        "columns": [
          { "name": "id", "type": "uuid", "isPrimaryKey": true },
          { "name": "email", "type": "varchar(255)", "isUnique": true },
          { "name": "name", "type": "varchar(100)" },
          { "name": "created_at", "type": "timestamp" }
        ]
      },
      {
        "name": "orders",
        "columns": [
          { "name": "id", "type": "uuid", "isPrimaryKey": true },
          { "name": "customer_id", "type": "uuid", "isForeignKey": true },
          { "name": "total", "type": "decimal(10,2)" },
          { "name": "status", "type": "varchar(20)" },
          { "name": "created_at", "type": "timestamp" }
        ]
      },
      {
        "name": "order_items",
        "columns": [
          { "name": "id", "type": "uuid", "isPrimaryKey": true },
          { "name": "order_id", "type": "uuid", "isForeignKey": true },
          { "name": "product_id", "type": "uuid", "isForeignKey": true },
          { "name": "quantity", "type": "integer" },
          { "name": "price", "type": "decimal(10,2)" }
        ]
      }
    ],
    "relationships": [
      { "from": "orders.customer_id", "to": "customers.id", "type": "many-to-one" },
      { "from": "order_items.order_id", "to": "orders.id", "type": "many-to-one" }
    ]
  }
  ```

### Workflow 3: Explain Query Plan
- **Message**: "Why is this query slow?"
- **UI**: `plan-viewer`
- **Value**: Visualiser le plan d'exécution - optimiser les queries
- **Mock Data**:
  ```json
  {
    "query": "SELECT * FROM orders WHERE customer_id = ? AND status = 'pending'",
    "totalCost": 1247.5,
    "nodes": [
      { "id": 1, "type": "Seq Scan", "table": "orders", "cost": 1247.5, "rows": 50000, "warning": "Missing index" },
      { "id": 2, "type": "Filter", "condition": "status = 'pending'", "cost": 0.1, "rows": 1250 },
      { "id": 3, "type": "Filter", "condition": "customer_id = $1", "cost": 0.1, "rows": 12 }
    ],
    "recommendation": "CREATE INDEX idx_orders_customer_status ON orders(customer_id, status)"
  }
  ```

---

## Timing Configuration

```typescript
const WORKFLOW_ROTATE_MS = 8000;      // 8s entre workflows
const USE_CASE_ROTATE_MS = 45000;     // 45s avant changement use-case
const PAUSE_AFTER_INTERACTION_MS = 30000; // 30s pause après clic
```

---

## Technical Notes

- Chaque workflow est cliquable dans le chat panel
- Les workflows futurs sont grisés avec "○ pending"
- Le workflow actif est surligné avec "● rendering..."
- Les workflows passés affichent "✓ rendered"
- L'auto-rotation se pause au hover et reprend après 30s d'inactivité
