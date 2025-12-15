# Worker Bridge

> RPC communication with the sandbox

## En bref

Le Worker Bridge est un canal de communication securise entre le code isole dans le sandbox et les outils MCP reel. Pensez-y comme un **interphone entre deux pieces isolees** : une personne dans une piece securisee (le sandbox) peut parler a travers l'interphone pour demander a quelqu'un dans l'autre piece (le processus principal) d'executer des actions pour elle. La personne isolee ne peut jamais quitter sa piece, mais elle peut faire des demandes precises via l'interphone.

### Pourquoi c'est important

Le Worker Bridge resout un probleme fondamental : comment permettre au code isole d'etre utile tout en maintenant la securite ?

- **Isolation maintenue** : le code reste dans le sandbox, mais peut utiliser des outils puissants (filesystem, GitHub, etc.)
- **Controle centralise** : toutes les actions passent par le bridge qui peut valider, auditer et tracer chaque appel
- **API unifiee** : le code sandbox utilise simplement `mcp.tool()` sans se soucier de la complexite sous-jacente
- **Debugging facilite** : chaque message RPC peut etre logue et inspecte

Sans le bridge, il faudrait soit donner des permissions directes au sandbox (dangereux), soit ne rien pouvoir faire d'utile (inutile). Le bridge offre le meilleur des deux mondes.

## What is the Worker Bridge?

The **Worker Bridge** is the communication layer between PML's main process and the sandboxed code execution environment. It enables isolated code to call MCP tools while maintaining security boundaries.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Main Process                          Sandbox (Worker)         │
│   ────────────                          ─────────────────       │
│                                                                  │
│  ┌─────────────┐                      ┌─────────────────┐       │
│  │ PML Gateway │◀────── Bridge ──────▶│  User Code      │       │
│  │             │                      │                 │       │
│  │ MCP Servers │                      │  mcp.read_file()│       │
│  └─────────────┘                      └─────────────────┘       │
│                                                                  │
│        Real tools                        Isolated code           │
│        execute here                      runs here               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture

The bridge connects two isolated environments:

### Main Process Side

```
┌─────────────────────────────────────────────────────────────────┐
│  Main Process                                                    │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │ Bridge Handler  │    │ MCP Gateway     │                     │
│  │                 │───▶│                 │                     │
│  │ • Receives RPC  │    │ • Routes calls  │                     │
│  │ • Validates     │    │ • Executes tools│                     │
│  │ • Returns result│    │ • Returns data  │                     │
│  └─────────────────┘    └─────────────────┘                     │
│           │                                                      │
│           │ postMessage                                         │
│           ▼                                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Worker Side

```
┌─────────────────────────────────────────────────────────────────┐
│  Sandbox Worker                                                  │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │ MCP Proxy       │    │ User Code       │                     │
│  │                 │◀───│                 │                     │
│  │ • mcp.server.*  │    │ await mcp.      │                     │
│  │ • Serializes    │    │   read_file()   │                     │
│  │ • Awaits reply  │    │                 │                     │
│  └─────────────────┘    └─────────────────┘                     │
│           │                                                      │
│           │ postMessage                                         │
│           ▼                                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Message Protocol

Communication uses a structured RPC protocol:

### Request Message

```
┌─────────────────────────────────────────────────────────────────┐
│  RPC Request                                                     │
│                                                                  │
│  {                                                               │
│    type: "rpc_request",                                         │
│    id: "req_123",           // Unique request ID                │
│    method: "call_tool",     // What to do                       │
│    payload: {                                                    │
│      server: "filesystem",  // MCP server                       │
│      tool: "read_file",     // Tool name                        │
│      args: {                // Tool parameters                  │
│        path: "data.json"                                        │
│      }                                                           │
│    }                                                             │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Response Message

```
┌─────────────────────────────────────────────────────────────────┐
│  RPC Response                                                    │
│                                                                  │
│  {                                                               │
│    type: "rpc_response",                                        │
│    id: "req_123",           // Matches request ID               │
│    success: true,           // Did it work?                     │
│    result: {                // Tool output                      │
│      content: "{ ... }"                                         │
│    }                                                             │
│  }                                                               │
│                                                                  │
│  OR on error:                                                   │
│                                                                  │
│  {                                                               │
│    type: "rpc_response",                                        │
│    id: "req_123",                                               │
│    success: false,                                              │
│    error: {                                                      │
│      code: "TOOL_ERROR",                                        │
│      message: "File not found"                                  │
│    }                                                             │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Message Flow

```
User Code                Bridge              Main Process
─────────                ──────              ────────────
    │                        │                    │
    │ mcp.read_file()        │                    │
    │───────────────────────▶│                    │
    │                        │ RPC Request        │
    │                        │───────────────────▶│
    │                        │                    │ Execute tool
    │                        │                    │
    │                        │    RPC Response    │
    │                        │◀───────────────────│
    │   Return value         │                    │
    │◀───────────────────────│                    │
    │                        │                    │
```

## MCP Injection

Before code runs, PML injects MCP tool functions into the sandbox:

### Injection Process

```
┌─────────────────────────────────────────────────────────────────┐
│  Before Execution                                                │
│                                                                  │
│  1. Discover available MCP tools from gateway                   │
│                                                                  │
│  2. Generate proxy functions:                                   │
│                                                                  │
│     mcp = {                                                      │
│       filesystem: {                                              │
│         read_file: (args) => bridge.call("filesystem", "read_file", args),
│         write_file: (args) => bridge.call("filesystem", "write_file", args),
│         list_files: (args) => bridge.call("filesystem", "list_files", args)
│       },                                                         │
│       github: {                                                  │
│         create_issue: (args) => bridge.call("github", "create_issue", args),
│         ...                                                      │
│       }                                                          │
│     }                                                            │
│                                                                  │
│  3. Inject `mcp` object into worker global scope                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Using Injected Tools

In user code, MCP tools are available as:

```
// Automatically available in sandbox
const content = await mcp.filesystem.read_file({ path: "data.json" });
const parsed = JSON.parse(content);

await mcp.github.create_issue({
  title: "Found issue",
  body: parsed.error_message
});
```

### Tool Discovery

The bridge knows which tools exist by querying the gateway:

```
Available Tools:
  filesystem:
    - read_file
    - write_file
    - list_files
  github:
    - create_issue
    - get_issue
    - add_comment
  fetch:
    - fetch

Each becomes: mcp.{server}.{tool}()
```

## Error Handling

The bridge handles various error conditions:

| Error | Handling |
|-------|----------|
| **Tool not found** | Clear error with available alternatives |
| **Invalid parameters** | Schema validation error returned |
| **Tool execution failed** | Error propagated to calling code |
| **Timeout** | Request cancelled, error returned |
| **Worker crashed** | Graceful failure, error logged |

### Error Example

```
// In user code
try {
  await mcp.filesystem.read_file({ path: "/nonexistent" });
} catch (error) {
  // Error from bridge:
  // {
  //   code: "TOOL_ERROR",
  //   message: "File not found: /nonexistent",
  //   tool: "filesystem:read_file"
  // }
}
```

## Performance

The bridge is optimized for low latency:

| Optimization | Benefit |
|--------------|---------|
| **Message pooling** | Reduce allocation overhead |
| **Binary serialization** | Faster than JSON for large data |
| **Request batching** | Multiple calls in one message |
| **Keep-alive workers** | Avoid startup cost |

## Next

- [Tracing](./03-tracing.md) - How tool calls are tracked
- [Feedback Loop](../03-learning/04-feedback-loop.md) - How execution feeds learning
