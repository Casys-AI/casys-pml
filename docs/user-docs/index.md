# PML - Quick Start

> Give your AI agent a memory that learns

---

## What is PML?

PML connects your AI (Claude, GPT, etc.) to tools and learns from how you use them.

- **Find tools** — Search by what you want to do, not by name
- **Run code** — Execute with automatic tool access
- **Learn** — PML remembers patterns and suggests smarter workflows

---

## Installation

### 1. Get your API key

Sign up at [pml.casys.ai](https://pml.casys.ai) to get your API key.

### 2. Install PML

```bash
# macOS / Linux
curl -fsSL https://pml.casys.ai/install.sh | sh

# Or with Deno
deno install -Afg jsr:@casys/pml
```

### 3. Initialize your project

```bash
cd your-project
pml init
```

This creates:
- `.pml.json` — your project config
- `.mcp.json` — MCP config that runs `pml stdio` automatically

### 4. Add your API key

```bash
# Add to your .env file
echo "PML_API_KEY=your_key_here" >> .env
```

### 5. Ready!

That's it. When you use Claude Code (or any MCP client), it automatically starts PML via stdio. No need to run anything manually.

---

## Your First Commands

### Find a tool

```typescript
pml:discover({ intent: "read a JSON file" })
```

PML searches and returns the best matching tools.

### Run some code

```typescript
pml:execute({
  intent: "Read package.json and list dependencies",
  code: `
    const content = await mcp.filesystem.read_file({ path: "package.json" });
    const pkg = JSON.parse(content);
    return Object.keys(pkg.dependencies || {});
  `
})
```

PML runs your code with automatic access to MCP tools.

---

## The Three Main Tools

| Tool | What it does |
|------|--------------|
| [**pml:discover**](./discover.md) | Find tools by describing what you need |
| [**pml:execute**](./execute.md) | Run code with MCP tool access |
| [**pml:admin**](./admin.md) | Manage your learned capabilities |

---

## How It Works

```
You describe what you want
        ↓
PML finds the right tools
        ↓
You run code using those tools
        ↓
PML learns the pattern
        ↓
Next time, PML suggests it automatically
```

The more you use it, the smarter it gets.

---

## Next Steps

- [**Discover**](./discover.md) — Learn how to find tools
- [**Execute**](./execute.md) — Learn how to run code
- [**Admin**](./admin.md) — Learn how to manage capabilities

---

_Need help? Join our [Discord](https://discord.gg/pml) or check [GitHub](https://github.com/Casys-AI/casys-pml)_
