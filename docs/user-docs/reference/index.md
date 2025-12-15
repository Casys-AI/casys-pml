# Reference

Technical reference documentation for PML.

---

## API & Configuration

| Document | Description |
|----------|-------------|
| [MCP Tools](./01-mcp-tools.md) | PML's exposed MCP tools and their schemas |
| [Configuration](./02-configuration.md) | Config files and environment variables |
| [CLI](./03-cli.md) | Command-line interface reference |

---

## Quick Reference

### Start PML Server

```bash
deno task mcp
```

### Run with specific config

```bash
PML_DB_PATH=./my-project.db deno task mcp
```

### Available MCP Tools

- `pml_execute_dag` - Execute multi-tool workflows
- `pml_search_tools` - Discover available tools
- `pml_search_capabilities` - Find learned patterns
- `pml_execute_code` - Run code in sandbox
