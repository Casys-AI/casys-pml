# Configuration

> PML configuration files and options

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
