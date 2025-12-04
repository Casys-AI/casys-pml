# AgentCards Playground

Interactive Jupyter notebooks demonstrating AgentCards MCP Gateway features.

## Quick Start

### Option 1: GitHub Codespaces (Recommended)

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Casys-AI/mcp-gateway?devcontainer_path=.devcontainer/playground/devcontainer.json)

### Option 2: Local Development

```bash
# Clone and navigate
git clone https://github.com/Casys-AI/mcp-gateway.git
cd AgentCards

# Setup MCP config
cp .mcp-servers.example.json .mcp-servers.json

# Install Jupyter kernel
deno jupyter --install

# Launch notebooks
jupyter notebook playground/notebooks/
```

## Notebooks

Follow the numbered progression for the best learning experience:

| # | Notebook | Description |
|---|----------|-------------|
| 01 | `sandbox-basics.ipynb` | Code execution, error handling, timeouts |
| 02 | `context-injection.ipynb` | Inject data and context into executions |
| 03 | `dag-workflows.ipynb` | Multi-step DAG workflows with dependencies + **visualization** |
| 04 | `mcp-discovery.ipynb` | MCP server discovery and tool aggregation + **GraphRAG viz** |
| 05 | `mcp-usage.ipynb` | LLM + MCP integration with tool calling + **DAG viz** |
| 06 | `llm-integration.ipynb` | Multi-LLM support (OpenAI, Anthropic, Google) |
| 07 | `security-demo.ipynb` | Security boundaries, permissions, limits |
| 08 | `controlled-executor.ipynb` | **Advanced DAG execution** with event streaming, episodic memory, decision points |

## Configuration

All configuration is at **project root**:

```
AgentCards/
├── .mcp-servers.example.json  # Template (copy to .mcp-servers.json)
├── .mcp-servers.json          # Your local config (gitignored)
├── config/
│   ├── workflow-templates.yaml
│   └── speculation_config.yaml
└── playground/
    ├── notebooks/
    └── lib/
```

See [config/README.md](../config/README.md) for details.

## MCP HTTP Server

Start the full MCP Gateway:

```bash
# From AgentCards root
deno task serve:playground
```

**First run:** ~2-3 minutes (downloads BGE-M3 model - 2.2GB)
**Subsequent runs:** ~5 seconds (cached)

### Available Tools

- `agentcards__agentcards_execute_code` - Safe code execution
- `agentcards__agentcards_execute_dag` - DAG workflow execution
- `agentcards__agentcards_search_tools` - Semantic tool search
- `agentcards__agentcards_continue` - Continue DAG execution
- `agentcards__agentcards_abort` - Abort DAG execution
- `agentcards__agentcards_replan` - Replan DAG with new requirements

## Requirements

- Deno 2.0+
- ~3GB disk space (for BGE-M3 model)
- API key for LLM notebooks (OpenAI, Anthropic, or Google)

## Environment Variables

```bash
# Optional - for LLM demos (copy from .env.example)
cp .env.example .env

# Edit .env with your key:
ANTHROPIC_API_KEY="sk-ant-..."
# or
OPENAI_API_KEY="sk-..."
# or
GOOGLE_API_KEY="..."
```
