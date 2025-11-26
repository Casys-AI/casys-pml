# AgentCards Playground

Interactive Jupyter notebooks demonstrating AgentCards MCP Gateway features.

## Quick Start

### Option 1: GitHub Codespaces (Recommended)

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Casys-AI/AgentCards?devcontainer_path=.devcontainer/playground/devcontainer.json)

### Option 2: Local Development

```bash
# Clone and navigate
git clone https://github.com/Casys-AI/AgentCards.git
cd AgentCards/playground

# Install Jupyter kernel
deno jupyter --install

# Launch notebooks
jupyter notebook notebooks/
```

## Notebooks

### Core Features

| Notebook | Description |
|----------|-------------|
| `sandbox-basics.ipynb` | Code execution, error handling, timeouts |
| `context-injection.ipynb` | Inject data and context into executions |
| `security-demo.ipynb` | Security boundaries, permissions, limits |

### Advanced Features

| Notebook | Description |
|----------|-------------|
| `dag-workflows.ipynb` | Multi-step DAG workflows with dependencies |
| `mcp-discovery.ipynb` | MCP server discovery and tool aggregation |
| `mcp-usage.ipynb` | LLM + MCP integration with tool calling |
| `llm-demo.ipynb` | Multi-LLM support (OpenAI, Anthropic, Google) |

## MCP HTTP Server

Start the full MCP Gateway with HTTP access:

```bash
# From AgentCards root
deno run --allow-all playground/examples/server.ts
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
# Optional - for LLM demos
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GOOGLE_API_KEY="..."
```
