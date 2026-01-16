# Architecture

This document describes the architecture of `@casys/pml`, the lightweight CLI client for PML.

## System Overview

```mermaid
flowchart TB
    subgraph Client["Client Machine"]
        CC[Claude Code / AI Client]
        CLI[pml CLI]

        subgraph PML["@casys/pml"]
            Router[Routing]
            Loader[Capability Loader]
            Sandbox[Sandbox Executor]
            Perms[Permissions]
            BYOK[BYOK Manager]
            Trace[Trace Collector]
        end

        subgraph Local["Local Resources"]
            FS[Filesystem]
            Shell[Shell]
            Docker[Docker]
        end
    end

    subgraph Cloud["pml.casys.ai"]
        Registry[Capability Registry]
        Gateway[MCP Gateway]
        TraceDB[Trace Storage]
    end

    CC -->|MCP| CLI
    CLI --> Router
    Router -->|client tools| Local
    Router -->|server tools| Gateway
    Loader -->|fetch| Registry
    Trace -->|sync| TraceDB
```

## Data Flow

### Tool Execution Flow

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant CLI as pml serve
    participant R as Router
    participant L as Loader
    participant S as Sandbox
    participant Cloud as pml.casys.ai

    CC->>CLI: tools/call (capability:tool)
    CLI->>R: resolveToolRouting()

    alt Client Tool (fs, shell)
        R->>L: loadCapability()
        L->>Cloud: fetch code + metadata
        Cloud-->>L: capability module
        L->>S: execute in sandbox
        S-->>CLI: result
    else Server Tool (search, APIs)
        R->>Cloud: forward request
        Cloud-->>CLI: result
    end

    CLI-->>CC: tool response
```

### Two-Phase Execution (`execute_locally`)

When a tool call involves capabilities with client-side tools (filesystem, shell), the server performs static analysis and returns an `execute_locally` response. The client then executes locally.

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant CLI as pml CLI
    participant Cloud as pml.casys.ai
    participant SW as SandboxWorker
    participant MCP as Local MCP Servers

    CC->>CLI: tools/call (pml_execute)
    CLI->>Cloud: forward request

    Note over Cloud: Static Analysis (SWC)
    Note over Cloud: Resolve FQDNs for multi-tenant

    Cloud-->>CLI: execute_locally response

    Note over CLI: Parse: code + FQDN map + client_tools

    CLI->>SW: execute(code, toolDefs)

    loop For each mcp.* call
        SW->>CLI: RPC call (server:tool)

        alt Client Tool (fs, shell)
            CLI->>MCP: call via StdioManager
            MCP-->>CLI: result
        else Server Tool (API)
            CLI->>Cloud: forward
            Cloud-->>CLI: result
        end

        CLI-->>SW: RPC result
    end

    SW-->>CLI: execution complete
    CLI-->>CC: success + result
```

**The `execute_locally` Response** contains:

| Field | Description |
|-------|-------------|
| `status` | `"execute_locally"` |
| `code` | TypeScript code to execute |
| `client_tools` | Tools routed to client (e.g., `["filesystem", "shell"]`) |
| `tools_used` | Server-resolved FQDN map for multi-tenant (id → fqdn) |
| `workflowId` | Optional: for capability finalization |

**Why Two-Phase?**

1. **Security**: Server does static analysis to validate code structure
2. **Multi-tenant**: Server resolves FQDNs based on user's scope (org.project)
3. **Learning**: Server tracks what code was executed for capability learning
4. **Permissions**: Client handles HIL approval for dangerous tools

### HIL (Human-in-the-Loop) Flow

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant CLI as pml
    participant BYOK as BYOK Manager
    participant User as User Terminal

    CC->>CLI: execute capability
    CLI->>BYOK: checkKeys()

    alt Missing API Key
        BYOK-->>CLI: ApiKeyApprovalRequired
        CLI-->>CC: approval_required response
        CC->>User: Display: "Add TAVILY_API_KEY to .env"
        User->>User: Edit .env file
        User->>CC: Click "Continue"
        CC->>CLI: continue workflow
        CLI->>BYOK: reloadEnv()
        BYOK-->>CLI: keys loaded
        CLI->>CLI: resume execution
    end

    CLI-->>CC: success response
```

## Component Architecture

### Routing Layer

The router determines where each tool executes:

```mermaid
flowchart LR
    subgraph Input
        Tool[tool:action]
    end

    subgraph Router
        Extract[Extract Namespace]
        Check{In clientTools?}
        Default[Default Routing]
    end

    subgraph Output
        Client[Execute Locally]
        Server[Forward to Cloud]
    end

    Tool --> Extract
    Extract --> Check
    Check -->|Yes| Client
    Check -->|No| Default
    Default -->|client| Client
    Default -->|server| Server
```

**Client tools** (execute on user's machine):
- `filesystem:*` - File operations
- `shell:*` - Command execution
- `docker:*` - Container management
- `git:*` - Version control

**Server tools** (forward to cloud):
- `tavily:*` - Web search
- `exa:*` - AI search
- Stateless computation capabilities

### Sandbox Execution (ADR-032)

Code runs in an isolated Deno worker with restricted permissions. The RPC bridge pattern is inspired by Cloudflare Code Mode and SandpackVM.

> **Note:** This documents the **client sandbox** (`SandboxWorker`). The server has a richer `WorkerBridge` with GraphRAG integration. See [MODULES.md](MODULES.md#client-vs-server-sandbox) for comparison.

```mermaid
flowchart TB
    subgraph Main["Main Process"]
        Loader[Capability Loader]
        Bridge[RPC Bridge]
    end

    subgraph Worker["Deno Worker (isolated)"]
        Code[Capability Code]
        MCP[mcp.* proxy]
    end

    subgraph Tools["MCP Tools"]
        FS[filesystem]
        Shell[shell]
        API[external APIs]
    end

    Loader -->|spawn| Worker
    Code -->|call| MCP
    MCP -->|JSON-RPC| Bridge
    Bridge --> Tools
    Tools -->|result| Bridge
    Bridge -->|response| MCP
```

**Security model:**
- Worker has `permissions: "none"` by default
- All I/O goes through RPC bridge
- Path validation prevents traversal attacks
- Workspace containment enforced

### RPC Protocol (ADR-032)

The Worker and Main process communicate via `postMessage` with typed messages:

```typescript
// Worker → Main: Tool call request
interface RPCCallMessage {
  type: "rpc_call";
  id: string;              // UUID for correlation
  server: string;          // "filesystem"
  tool: string;            // "read_file"
  args: Record<string, unknown>;
  parent_trace_id?: string; // For hierarchical tracing (ADR-041)
}

// Main → Worker: Tool call result
interface RPCResultMessage {
  type: "rpc_result";
  id: string;              // Matching request ID
  success: boolean;
  result?: unknown;
  error?: string;
}

// Main → Worker: Start execution
interface ExecuteMessage {
  type: "execute";
  code: string;
  tools: ToolDefinition[];
  context?: Record<string, unknown>;
}

// Worker → Main: Execution complete
interface ExecutionCompleteMessage {
  type: "execution_complete";
  success: boolean;
  result?: unknown;
  error?: string;
}
```

**Key insight:** Tracing happens natively in the RPC bridge, not via stdout parsing. Every tool call passes through the bridge, which captures timing and results automatically.

### Trace Collection (ADR-041)

Execution traces are collected and synced to the cloud for learning. Traces include hierarchical relationships via `parent_trace_id`.

```mermaid
flowchart LR
    subgraph Execution
        Cap[Capability]
        Collector[TraceCollector]
    end

    subgraph Processing
        Sanitizer[Sanitizer]
        Queue[Batch Queue]
    end

    subgraph Cloud
        Syncer[TraceSyncer]
        Storage[Trace DB]
    end

    Cap -->|recordMcpCall| Collector
    Collector -->|finalize| Sanitizer
    Sanitizer -->|redact PII| Queue
    Queue -->|batch| Syncer
    Syncer -->|POST| Storage
```

**Hierarchical Tracing:**

Traces capture the call hierarchy, not just temporal order:

```text
capability_start (cap1, trace_id: "cap1")
├── tool_start (read_file, trace_id: "t1", parent_trace_id: "cap1")
│   └── tool_end (read_file, trace_id: "t1")
├── tool_start (write_file, trace_id: "t2", parent_trace_id: "cap1")
│   └── tool_end (write_file, trace_id: "t2")
└── capability_end (cap1, trace_id: "cap1")
```

This enables the cloud to learn true causal relationships (A calls B) vs temporal (A before B).

**Sanitization rules:**
- API keys redacted
- PII patterns masked
- Large payloads truncated (>10KB)
- File contents summarized

### BYOK Categories (ADR-040)

PML supports three categories of MCP tools:

| Category    | Examples                        | API Key Source              |
| ----------- | ------------------------------- | --------------------------- |
| **Managed** | filesystem, memory, fetch       | None (PML provides)         |
| **OAuth**   | github                          | User's OAuth token          |
| **BYOK**    | tavily, brave, openai, airtable | User provides in `.env`     |

**Data isolation model:**

```text
┌─────────────────────────────────────────────────────────────────┐
│  GLOBAL (shared - network effect)                               │
│  • Tool schemas from all MCPs                                   │
│  • Tool relationship graph (GraphRAG)                           │
│  • Learned capabilities (anonymized)                            │
├─────────────────────────────────────────────────────────────────┤
│  PRIVATE (isolated per user)                                    │
│  • Execution traces                                             │
│  • API keys (encrypted AES-256-GCM)                             │
│  • Workflow history                                             │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration Files

### `.pml.json` Structure

```mermaid
erDiagram
    PmlConfig {
        string version
        string workspace
    }
    CloudConfig {
        string url
    }
    ServerConfig {
        int port
    }
    Permissions {
        array allow
        array deny
        array ask
    }

    PmlConfig ||--o| CloudConfig : cloud
    PmlConfig ||--o| ServerConfig : server
    PmlConfig ||--o| Permissions : permissions
```

### Permission Resolution

```mermaid
flowchart TD
    Tool[Tool Name]

    subgraph Check["Permission Check"]
        Deny{In deny list?}
        Allow{In allow list?}
        Ask{In ask list?}
        Default[Default: ask]
    end

    subgraph Result
        Blocked[DENIED]
        Auto[AUTO - execute]
        HIL[HIL - prompt user]
    end

    Tool --> Deny
    Deny -->|Yes| Blocked
    Deny -->|No| Allow
    Allow -->|Yes| Auto
    Allow -->|No| Ask
    Ask -->|Yes| HIL
    Ask -->|No| Default
    Default --> HIL
```

## Deployment Modes

### HTTP Mode (`pml serve`)

```text
┌─────────────────┐     HTTP/SSE      ┌─────────────────┐
│  Claude Code    │ ◄───────────────► │  pml serve      │
│  (MCP Client)   │    :3003/mcp      │  (HTTP Server)  │
└─────────────────┘                   └─────────────────┘
```

### Stdio Mode (`pml stdio`)

```text
┌─────────────────┐      stdio        ┌─────────────────┐
│  Claude Code    │ ◄───────────────► │  pml stdio      │
│  (MCP Client)   │   stdin/stdout    │  (MCP Server)   │
└─────────────────┘                   └─────────────────┘
```

## Related Architecture

For the full PML platform architecture including GraphRAG, DAG execution, and the capability learning system, see the main repository documentation at `@casys/mcp-gateway`.

## Architecture Decision Records

Key ADRs that inform this package's design:

| ADR | Title | Relevance |
|-----|-------|-----------|
| [ADR-032](../../../docs/adrs/ADR-032-sandbox-worker-rpc-bridge.md) | Sandbox Worker RPC Bridge | RPC protocol, Worker isolation |
| [ADR-040](../../../docs/adrs/ADR-040-multi-tenant-mcp-secrets-management.md) | Multi-tenant MCP & Secrets | BYOK categories, data isolation |
| [ADR-041](../../../docs/adrs/ADR-041-hierarchical-trace-tracking.md) | Hierarchical Trace Tracking | parent_trace_id, trace structure |
| [ADR-052](../../../docs/adrs/ADR-052-dynamic-capability-routing.md) | Dynamic Capability Routing | FQDN resolution, static analysis |
