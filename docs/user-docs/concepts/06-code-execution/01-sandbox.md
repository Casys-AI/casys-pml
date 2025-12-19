# Sandbox

> Secure code execution with Deno

## En bref

Le sandbox est un environnement d'execution isole qui protege votre systeme contre du code potentiellement dangereux. Pensez-y comme une **aire de jeux securisee pour enfants** : les enfants (le code) peuvent jouer librement a l'interieur, mais ils ne peuvent pas sortir de l'espace delimite ni acceder aux zones dangereuses. Les parents (PML) controlent precisement quels equipements (outils MCP) sont accessibles et surveillent toutes les activites.

### Pourquoi c'est important

La securite est critique dans PML car le systeme execute du code genere dynamiquement. Sans sandbox :

- **Risque de fuite de donnees** : du code malveillant pourrait lire vos fichiers sensibles (`/etc/passwd`, cles SSH, tokens)
- **Compromission du systeme** : du code pourrait modifier des fichiers systeme critiques ou executer des commandes dangereuses
- **Attaques reseau** : du code pourrait envoyer vos donnees vers des serveurs externes
- **Epuisement des ressources** : du code mal ecrit pourrait consommer toute la memoire ou le CPU

Le sandbox transforme ces risques en garanties : meme si du code tente une action malveillante, il est bloque par les multiples couches de protection.

## What is the Sandbox?

PML executes code in a **sandboxed environment**—an isolated container that prevents untrusted code from accessing sensitive resources or affecting the host system.

![Sandbox Architecture](excalidraw:src/web/assets/diagrams/sandbox-architecture.excalidraw)

## Why Deno?

PML uses **Deno** as its sandbox runtime because of its security-first design:

| Feature | Benefit |
|---------|---------|
| **Secure by default** | No permissions unless explicitly granted |
| **TypeScript native** | No build step needed |
| **Modern APIs** | fetch, Web Workers, etc. built-in |
| **Fine-grained permissions** | Control network, fs, env separately |
| **Isolated workers** | Each execution is independent |

## Isolation

Each code execution runs in complete isolation:

### Process Isolation

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Execution 1 │  │ Execution 2 │  │ Execution 3 │
│             │  │             │  │             │
│ Own memory  │  │ Own memory  │  │ Own memory  │
│ Own state   │  │ Own state   │  │ Own state   │
│             │  │             │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
       ▲                ▲                ▲
       │                │                │
       └────── No shared state ──────────┘
```

### What's Isolated

| Resource | Isolation |
|----------|-----------|
| **Memory** | Each execution has its own heap |
| **Variables** | No globals persist between runs |
| **File handles** | Cannot access files from previous runs |
| **Network connections** | Each run starts fresh |
| **Environment variables** | Controlled per-execution |

## Permissions

Deno's permission system controls what code can do:

### Default State: Deny All

```
By default, sandboxed code CANNOT:
  ✗ Read files
  ✗ Write files
  ✗ Access network
  ✗ Read environment variables
  ✗ Run subprocesses
  ✗ Access high-resolution time
```

### Granting Permissions

Permissions are explicitly granted per execution:

```
┌─────────────────────────────────────────────────────────────────┐
│  Execution Request                                               │
│                                                                  │
│  Code: "Read config.json and fetch API data"                    │
│                                                                  │
│  Required Permissions:                                          │
│    ✓ --allow-read=/path/to/config.json                         │
│    ✓ --allow-net=api.example.com                               │
│                                                                  │
│  Result: Code can ONLY read that file and access that host      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Permission Types

| Permission | Flag | Scope |
|------------|------|-------|
| **File Read** | `--allow-read` | Specific paths |
| **File Write** | `--allow-write` | Specific paths |
| **Network** | `--allow-net` | Specific hosts/ports |
| **Environment** | `--allow-env` | Specific variables |
| **Subprocess** | `--allow-run` | Specific commands |

## Security Model

PML's sandbox implements defense in depth:

### Layer 1: Permission Denial

```
Code attempts: Deno.readFile("/etc/passwd")

Result: PermissionDenied error
        Code doesn't have --allow-read=/etc/passwd
```

### Layer 2: Path Restrictions

Even with file access granted, paths are restricted:

```
Granted: --allow-read=/app/data

Allowed:
  ✓ /app/data/config.json
  ✓ /app/data/subdir/file.txt

Blocked:
  ✗ /app/secrets/key.pem
  ✗ /etc/passwd
  ✗ ../../../etc/passwd (path traversal blocked)
```

### Layer 3: Resource Limits

```
┌─────────────────────────────────────────────────────────────────┐
│  Resource Limits                                                 │
│                                                                  │
│  Memory:    512 MB maximum                                      │
│  CPU Time:  30 seconds maximum                                  │
│  Output:    Limited buffer size                                 │
│  Recursion: Stack depth limited                                 │
│                                                                  │
│  Exceeding limits → Execution terminated                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Layer 4: MCP Tool Mediation

Direct system access is replaced with MCP tool calls:

```
Instead of:                     Use:
─────────────                   ────
fs.readFile()                   mcp.filesystem.read_file()
fetch()                         mcp.fetch.fetch()
exec()                          mcp.shell.run_command()

MCP tools have their own permissions and audit logging
```

## Sandbox Lifecycle

```
┌──────────────┐
│ Code Request │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Create       │  Fresh Deno worker
│ Sandbox      │  with minimal permissions
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Inject MCP   │  Add mcp.* functions
│ Tools        │  that proxy to real tools
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Execute      │  Run user code
│ Code         │  with tracing
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Collect      │  Get results,
│ Results      │  traces, metrics
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Destroy      │  Kill worker,
│ Sandbox      │  free resources
└──────────────┘
```

## Error Handling

The sandbox handles errors gracefully:

| Error Type | Handling |
|------------|----------|
| **Permission denied** | Clear error message, no retry |
| **Timeout** | Execution killed, partial results returned |
| **Out of memory** | Worker terminated, error logged |
| **Code error** | Exception captured, stack trace returned |
| **MCP tool error** | Error propagated to code for handling |

## Next

- [Worker Bridge](./02-worker-bridge.md) - Communication with sandbox
- [Tracing](./03-tracing.md) - Execution visibility
