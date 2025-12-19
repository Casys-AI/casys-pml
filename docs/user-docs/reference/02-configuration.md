# Configuration

> PML configuration files and options

![Configuration Overview](excalidraw:src/web/assets/diagrams/config-overview.excalidraw)

## Environment Variables

PML behavior can be customized via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PML_DB_PATH` | Path to PGlite database | `~/.pml/db` |
| `PML_WORKFLOW_PATH` | Path to workflow templates | `~/.pml/workflows` |
| `PML_NO_PII_PROTECTION` | Set to `1` to disable PII protection | `0` |
| `PML_NO_CACHE` | Set to `1` to disable execution cache | `0` |
| `LOG_LEVEL` | Log level: `debug`, `info`, `warn`, `error` | `info` |
| `SENTRY_DSN` | Sentry DSN for error tracking (optional) | - |
| `SENTRY_ENVIRONMENT` | Sentry environment name | `development` |

### Example

```bash
# Set custom database path
export PML_DB_PATH=/path/to/custom/db

# Enable debug logging
export LOG_LEVEL=debug

# Start PML
./pml serve --config config/mcp-servers.json
```

## Config Files

### MCP Server Configuration

The primary configuration file defines which MCP servers PML will manage.

**Location:** Specified via `--config` flag

**Format:**

```json
{
  "mcpServers": {
    "<server-id>": {
      "command": "<executable>",
      "args": ["<arg1>", "<arg2>", ...],
      "env": {
        "<VAR>": "<value>"
      }
    }
  }
}
```

### Example Configuration

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/home/user/projects"],
      "env": {}
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-memory"],
      "env": {}
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-fetch"],
      "env": {}
    }
  }
}
```

### Server Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | Yes | Executable to run (e.g., `npx`, `node`, `python`) |
| `args` | string[] | Yes | Command-line arguments |
| `env` | object | No | Environment variables for this server |

## Claude Code Integration

To use PML with Claude Code, add it to your Claude configuration:

**Linux/macOS:** `~/.config/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pml": {
      "command": "/absolute/path/to/pml",
      "args": ["serve", "--config", "/absolute/path/to/mcp-servers.json"]
    }
  }
}
```

**Important:** Use absolute paths for both `command` and `--config`.

## Database Configuration

PML uses PGlite (embedded PostgreSQL) for persistent storage.

### Default Location

```
~/.pml/
├── db/                  # PGlite database files
│   ├── base/
│   ├── global/
│   └── ...
├── logs/                # Application logs
│   └── pml.log
└── cache/               # Execution cache
```

### Custom Database Path

```bash
# Via environment variable
PML_DB_PATH=/custom/path/db ./pml serve --config ...

# Or in your shell profile
export PML_DB_PATH=/custom/path/db
```

## Logging Configuration

### Log Levels

| Level | Description |
|-------|-------------|
| `debug` | Verbose debugging information |
| `info` | General operational messages |
| `warn` | Warning conditions |
| `error` | Error conditions |

### Log Files

Logs are written to `~/.pml/logs/pml.log` in structured JSON format:

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Tool executed",
  "tool": "filesystem:read_file",
  "duration_ms": 45
}
```

### Grafana/Loki Integration

PML logs are compatible with Promtail for Grafana/Loki ingestion:

```yaml
# promtail-config.yml
scrape_configs:
  - job_name: pml
    static_configs:
      - targets:
          - localhost
        labels:
          job: pml
          __path__: ~/.pml/logs/*.log
```

## Algorithm Configuration

PML's intelligent algorithms can be tuned via YAML configuration files in the `config/` directory.

### Local Alpha Configuration

**File:** `config/local-alpha.yaml`

Controls the semantic vs graph balance per-node for DAG suggestions (ADR-048).

**What is Alpha?**

Alpha determines how much PML trusts the graph structure vs pure semantic similarity:
- `alpha = 1.0` → Pure semantic (ignore graph structure entirely)
- `alpha = 0.5` → Maximum graph influence (equal weight semantic/graph)

**Four algorithms compute alpha based on context:**

| Algorithm | Used For | Description |
|-----------|----------|-------------|
| **Embeddings Hybrides** | Active search | Compares semantic vs structural embeddings |
| **Heat Diffusion** | Passive tools | Propagates "heat" through graph connectivity |
| **Heat Diffusion Hierarchical** | Passive capabilities | Adds parent/child propagation |
| **Bayesian** | Cold start | Explicit uncertainty when few observations exist |

#### Alpha Bounds

Hard limits for alpha values across all algorithms. Tighter bounds = more predictable, wider = more adaptive.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `alpha_min` | Floor: maximum graph influence allowed | 0.5 |
| `alpha_max` | Ceiling: pure semantic (no graph influence) | 1.0 |

#### Alpha Scaling Factor

Controls how aggressively alpha decreases when confidence is high.

**Formula:** `alpha = max(alpha_min, alpha_max - confidence × alpha_scaling_factor)`

| Value | Effect |
|-------|--------|
| Higher (0.8) | Alpha drops faster → more graph influence |
| Lower (0.3) | Alpha drops slower → stays closer to semantic |
| **Default: 0.5** | Balanced behavior |

#### Cold Start (Bayesian Algorithm)

When a node has few observations, we can't trust graph statistics. The Bayesian algorithm interpolates from prior (don't trust graph) to target (trust graph).

**Formula:** `alpha = prior_alpha × (1 - confidence) + target_alpha × confidence`
where `confidence = observations / threshold`

| Parameter | Description | Default |
|-----------|-------------|---------|
| `threshold` | Minimum observations before exiting cold start. Lower = trust graph sooner, higher = more conservative | 5 |
| `prior_alpha` | Starting alpha (pure semantic - safest default) | 1.0 |
| `target_alpha` | Alpha when exiting cold start (slight graph influence) | 0.7 |

#### Heat Diffusion (Passive Tools)

Computes "heat" for each node based on graph connectivity. Well-connected nodes get more heat → lower alpha → trust graph more.

**Formula:** `heat = intrinsic_weight × node_heat + neighbor_weight × avg_neighbor_heat`

| Parameter | Description | Default |
|-----------|-------------|---------|
| `intrinsic_weight` | Weight of node's own connectivity (degree-based) | 0.6 |
| `neighbor_weight` | Weight of neighbors' connectivity (propagation) | 0.4 |
| `common_neighbor_factor` | Bonus per common neighbor when no direct edge exists. Higher = value indirect connections more | 0.2 |

#### Hierarchy Weights (Capabilities)

For capability/meta nodes, heat combines three sources:
- **intrinsic**: node's own graph connectivity
- **neighbor**: heat from graph neighbors (same level)
- **hierarchy**: heat from parent/children in Tool→Capability→Meta hierarchy

**Important:** Sum of weights MUST equal 1.0 for each node type.

| Node Type | Profile | intrinsic | neighbor | hierarchy |
|-----------|---------|-----------|----------|-----------|
| **tool** | Mostly intrinsic (leaf nodes, direct usage) | 0.5 | 0.3 | 0.2 |
| **capability** | Balanced (middle of hierarchy) | 0.3 | 0.4 | 0.3 |
| **meta** | Mostly hierarchy (abstract, defined by children) | 0.2 | 0.2 | 0.6 |

#### Hierarchy Inheritance Factors

Controls top-down heat propagation. When computing a child's hierarchy heat, it inherits a fraction of its parent's heat.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `meta_to_capability` | Capability inherits X% of meta-capability parent's heat | 0.7 (70%) |
| `capability_to_tool` | Tool inherits X% of capability parent's heat | 0.5 (50%) |

Lower values = children are more independent. Higher values = parent reputation strongly influences children.

#### Structural Confidence Weights

Combines multiple heat signals into a single "structural confidence" score, then used to compute alpha via the scaling factor. Sum should equal 1.0.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `target_heat` | Weight of target node's connectivity | 0.4 |
| `context_heat` | Weight of context nodes' average connectivity | 0.3 |
| `path_heat` | Weight of path strength (direct edges or common neighbors) | 0.3 |

**See also:** [Hybrid Search - Local Adaptive Alpha](../concepts/02-discovery/02-hybrid-search.md#local-adaptive-alpha-α---intelligence-contextuelle)

### Speculation Configuration

**File:** `config/speculation_config.yaml`

Controls speculative execution behavior.

```yaml
# Enable/disable speculation globally
enabled: true

# Minimum confidence for speculation (0.40-0.90)
confidence_threshold: 0.70

# Maximum concurrent speculations
max_concurrent_speculations: 3

# Timeout in milliseconds
speculation_timeout: 10000

# Adaptive threshold adjustment
adaptive:
  enabled: true
  min_threshold: 0.40
  max_threshold: 0.90
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `enabled` | Enable speculative execution | true |
| `confidence_threshold` | Minimum confidence to speculate | 0.70 |
| `max_concurrent_speculations` | Parallel speculation limit | 3 |
| `speculation_timeout` | Max execution time (ms) | 10000 |
| `adaptive.enabled` | Auto-adjust threshold based on success rate | true |

**See also:** [Speculative Execution](../concepts/05-dag-execution/05-speculative-execution.md)

## Security Configuration

### PII Protection

By default, PML protects sensitive data:

```bash
# Disable PII protection (not recommended)
PML_NO_PII_PROTECTION=1 ./pml serve --config ...
```

### Sandbox Permissions

The code execution sandbox runs with minimal permissions by default. Additional paths can be allowed per-execution via `sandbox_config.allowedReadPaths`.

## See Also

- [CLI Reference](./03-cli.md) - Command-line options
- [MCP Tools Reference](./01-mcp-tools.md) - API documentation
- [Installation](../getting-started/01-installation.md) - Setup guide
