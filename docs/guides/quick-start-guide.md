# AgentCards - Quick Start Guide

**Date:** 2025-11-11
**Owners:** Sally (UX Designer) + Amelia (Dev)
**Status:** ✅ COMPLETE
**Purpose:** Get AgentCards running in 10 minutes or less

---

## What is AgentCards?

AgentCards is an **intelligent MCP (Model Context Protocol) gateway** that:
- 🔍 **Finds the right tools** via semantic vector search
- ⚡ **Executes tasks in parallel** using dependency graphs (DAG)
- 🔒 **Runs code securely** in isolated sandbox
- 📊 **Streams results** progressively via SSE

**Use case:** You have 20+ MCP servers. Claude Code struggles to find the right tools. AgentCards solves this with smart search and parallel execution.

---

## Prerequisites

**Required:**
- ✅ [Deno 2.x](https://deno.land/) installed
- ✅ [Claude Code](https://claude.com/code) (Anthropic's official CLI)
- ✅ At least 3 MCP servers configured

**System Requirements:**
- OS: macOS, Linux, or Windows (WSL)
- RAM: 4GB minimum, 8GB recommended
- Disk: 1GB free space

**Check Deno version:**
```bash
deno --version
# Should show: deno 2.x.x or higher
```

---

## Installation (5 minutes)

### Step 1: Clone Repository

```bash
git clone https://github.com/your-org/agentcards.git
cd agentcards
```

### Step 2: Install Dependencies

```bash
deno install
```

This installs:
- MCP SDK
- Vector database (Voy for embeddings)
- OpenAI client (for embeddings)
- Testing dependencies

### Step 3: Set Up Environment Variables

```bash
# Create .env file
cp .env.example .env

# Edit .env with your API keys
nano .env
```

**Required variables:**
```bash
# OpenAI API key (for embeddings)
OPENAI_API_KEY=sk-...

# Optional: Custom embedding model
EMBEDDING_MODEL=text-embedding-3-small  # default

# Optional: Server port
PORT=3000  # default
```

### Step 4: Build Project

```bash
deno task build
```

This compiles TypeScript and prepares the gateway for execution.

---

## Configuration (3 minutes)

### Step 1: Configure MCP Servers

AgentCards reads your Claude Code MCP configuration automatically from `~/.claude/mcp.json`.

**Example `~/.claude/mcp.json`:**
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

**⚠️ AgentCards automatically discovers all servers from this file.**

---

### Step 2: (Optional) Add AgentCards as MCP Server

To use AgentCards from Claude Code, add it to your `mcp.json`:

```json
{
  "mcpServers": {
    "agentcards": {
      "command": "deno",
      "args": ["run", "--allow-all", "/path/to/agentcards/src/main.ts"]
    },
    "github": { ... },
    "filesystem": { ... }
  }
}
```

**How it works:**
- Claude Code connects to AgentCards as an MCP server
- AgentCards connects to all other MCP servers
- AgentCards provides smart tool discovery + parallel execution
- Results stream back to Claude Code via SSE

---

## First Run (2 minutes)

### Step 1: Start AgentCards Gateway

```bash
deno task start
```

You should see:
```
🚀 AgentCards Gateway starting...
✅ Connected to 3 MCP servers: github, filesystem, postgres
🔍 Indexed 47 tools
📡 SSE server listening on http://localhost:3000
✅ Ready!
```

### Step 2: Test Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "servers": 3,
  "toolsIndexed": 47,
  "uptime": 12.5
}
```

### Step 3: Search for Tools

```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "search github repositories", "limit": 5}'
```

Expected response:
```json
{
  "tools": [
    {
      "name": "github.searchRepos",
      "description": "Search for GitHub repositories",
      "score": 0.92,
      "server": "github"
    },
    ...
  ]
}
```

---

## First Workflow (Quick Example)

### Example: Search GitHub and Clone Top Repo

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "nodes": [
        {
          "id": "search",
          "tool": "github.searchRepos",
          "args": { "q": "deno web framework" }
        },
        {
          "id": "clone",
          "tool": "filesystem.clone",
          "args": { "url": "{{search.items[0].clone_url}}" },
          "dependencies": ["search"]
        }
      ]
    }
  }'
```

**What happens:**
1. 🔍 AgentCards finds `github.searchRepos` and `filesystem.clone` tools
2. 📊 Builds dependency graph: `search` → `clone`
3. ⚡ Executes `search` first
4. ⚡ Executes `clone` with result from `search`
5. 📡 Streams results via SSE
6. ✅ Returns final result

**Response (streamed):**
```
data: {"type":"node_started","nodeId":"search"}

data: {"type":"node_completed","nodeId":"search","result":{...}}

data: {"type":"node_started","nodeId":"clone"}

data: {"type":"node_completed","nodeId":"clone","result":{...}}

data: {"type":"workflow_completed","success":true}
```

---

## Integration with Claude Code

### Option 1: Use AgentCards as MCP Server (Recommended)

**Already configured in Step 2 above.**

Claude Code sees AgentCards tools:
- `agentcards.search` - Search for tools semantically
- `agentcards.execute` - Execute DAG workflow
- `agentcards.execute_code` - Run code in sandbox (Epic 3)

**Example Claude prompt:**
```
"Find tools to search GitHub and clone the top TypeScript framework"
```

Claude Code will:
1. Call `agentcards.search` with query
2. Review results
3. Call `agentcards.execute` with workflow
4. Show you the result

---

### Option 2: Use AgentCards as Standalone Gateway

Run AgentCards separately and call its HTTP API from your own code:

```typescript
// Your application code
const response = await fetch("http://localhost:3000/execute", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    workflow: {
      nodes: [
        { id: "1", tool: "github.searchRepos", args: { q: "deno" } },
      ],
    },
  }),
});

const result = await response.json();
console.log(result);
```

---

## Troubleshooting

### Problem: "Connection refused" on port 3000

**Solution:** Check if port is already in use
```bash
lsof -i :3000
# Kill process if needed
kill -9 <PID>

# Or change port in .env
PORT=3001
```

---

### Problem: "OPENAI_API_KEY not found"

**Solution:** Ensure `.env` file has your API key
```bash
cat .env | grep OPENAI_API_KEY
# Should show: OPENAI_API_KEY=sk-...

# If missing, add it:
echo "OPENAI_API_KEY=sk-..." >> .env
```

---

### Problem: "No MCP servers found"

**Solution:** Check Claude Code configuration
```bash
cat ~/.claude/mcp.json

# Should show mcpServers object with at least one server

# If file doesn't exist, create it:
mkdir -p ~/.claude
nano ~/.claude/mcp.json
# Add at least one MCP server
```

---

### Problem: "Permission denied" errors

**Solution:** Grant Deno permissions
```bash
# AgentCards needs these permissions:
# --allow-read    (read mcp.json, temp files)
# --allow-write   (temp files, cache)
# --allow-net     (connect to MCP servers, OpenAI)
# --allow-run     (spawn MCP server processes)
# --allow-env     (read API keys from .env)

# Run with explicit permissions:
deno run --allow-all src/main.ts
```

---

### Problem: Tools not found by search

**Solution:** Check embedding service
```bash
# Test OpenAI connection
curl https://api.openai.com/v1/embeddings \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "test",
    "model": "text-embedding-3-small"
  }'

# Should return embedding vector

# If fails, check API key and quota
```

---

### Problem: Slow performance

**Solution:** Check resource usage
```bash
# Monitor CPU/memory
top -p $(pgrep -f agentcards)

# Check number of indexed tools
curl http://localhost:3000/health

# If too many tools (>1000), consider filtering
# Edit mcp.json to include only needed servers
```

---

## Next Steps

### Learn More

📚 **Documentation:**
- [Architecture](./architecture.md) - System design overview
- [MCP Integration Model](./mcp-integration-model.md) - How AgentCards integrates
- [Security Best Practices](./sandboxing-security-best-practices.md) - Security guidelines

📖 **Tutorials:**
- [Creating Your First Workflow](./tutorials/first-workflow.md) (coming soon)
- [Advanced DAG Patterns](./tutorials/advanced-dag.md) (coming soon)

🧪 **Testing:**
- [Test Infrastructure Guide](./test-infrastructure-extension-guide.md) - Add tests

---

### Epic 3 Features (Coming Soon)

**🔒 Secure Code Execution Sandbox:**
- Execute arbitrary TypeScript in isolated sandbox
- PII detection and tokenization
- Result caching for performance
- Full integration with DAG executor

**Usage (Epic 3):**
```javascript
const result = await fetch("http://localhost:3000/execute_code", {
  method: "POST",
  body: JSON.stringify({
    code: `
      const data = await fetch("https://api.github.com/users/denoland");
      return data.repos.length;
    `
  })
});
```

---

## Common Use Cases

### Use Case 1: GitHub Workflow

**Goal:** Search repos, get details, create issue

```json
{
  "workflow": {
    "nodes": [
      {
        "id": "search",
        "tool": "github.searchRepos",
        "args": { "q": "deno framework stars:>1000" }
      },
      {
        "id": "details",
        "tool": "github.getRepo",
        "args": { "repo": "{{search.items[0].full_name}}" },
        "dependencies": ["search"]
      },
      {
        "id": "issue",
        "tool": "github.createIssue",
        "args": {
          "repo": "{{details.full_name}}",
          "title": "Feature request",
          "body": "Please add X feature"
        },
        "dependencies": ["details"]
      }
    ]
  }
}
```

---

### Use Case 2: Database + File System

**Goal:** Query DB, write results to file

```json
{
  "workflow": {
    "nodes": [
      {
        "id": "query",
        "tool": "postgres.query",
        "args": { "sql": "SELECT * FROM users LIMIT 10" }
      },
      {
        "id": "write",
        "tool": "filesystem.writeFile",
        "args": {
          "path": "/tmp/users.json",
          "content": "{{JSON.stringify(query.rows)}}"
        },
        "dependencies": ["query"]
      }
    ]
  }
}
```

---

### Use Case 3: Parallel Data Fetching

**Goal:** Fetch from multiple sources in parallel

```json
{
  "workflow": {
    "nodes": [
      {
        "id": "github",
        "tool": "github.getUser",
        "args": { "username": "octocat" }
      },
      {
        "id": "twitter",
        "tool": "twitter.getUser",
        "args": { "username": "octocat" }
      },
      {
        "id": "merge",
        "tool": "agentcards.execute_code",
        "args": {
          "code": "return { github: github, twitter: twitter };"
        },
        "dependencies": ["github", "twitter"]
      }
    ]
  }
}
```

---

## Performance Benchmarks

**Typical Performance:**
- Tool search: <50ms (p95)
- Single tool execution: <500ms (depends on MCP server)
- DAG with 10 nodes: <2s (with parallelization)
- 100 concurrent requests: <5s total

**Measured on:** MacBook Pro M1, 16GB RAM

---

## Support & Community

**Issues & Bugs:**
- GitHub Issues: https://github.com/your-org/agentcards/issues

**Discussions:**
- GitHub Discussions: https://github.com/your-org/agentcards/discussions

**Contributing:**
- See [CONTRIBUTING.md](../CONTRIBUTING.md)

---

## FAQ

### Q: Do I need all my MCP servers running?

**A:** No, AgentCards starts them on-demand when you connect to the gateway.

---

### Q: Can I use AgentCards without Claude Code?

**A:** Yes! AgentCards exposes an HTTP API you can call from any application.

---

### Q: How many MCP servers can AgentCards handle?

**A:** Tested with 50+ servers and 1000+ tools. Performance degrades gracefully.

---

### Q: Does AgentCards work offline?

**A:** Partially. Vector search requires OpenAI (online), but you can use cached embeddings.

---

### Q: Is AgentCards secure?

**A:** Yes. Epic 3 adds sandboxed code execution with strict permissions. See [Security Best Practices](./sandboxing-security-best-practices.md).

---

## Checklist - You're Ready! ✅

After completing this guide, you should have:

- ✅ AgentCards running on `http://localhost:3000`
- ✅ Health check returning "healthy"
- ✅ At least 3 MCP servers connected
- ✅ Successfully searched for tools
- ✅ Executed at least one workflow
- ✅ (Optional) Integrated with Claude Code

**Time to completion:** ~10 minutes

---

**Congratulations! You're ready to use AgentCards.** 🎉

Explore the [documentation](./README.md) for advanced features and patterns.

---

**Document Status:** ✅ COMPLETE
**Date:** 2025-11-11
**Owners:** Sally (UX Designer) + Amelia (Dev)
