# Development Environment

## Prerequisites

- Deno 2.2+ ([deno.com](https://deno.com))
- Git 2.30+
- VS Code (recommended) with Deno extension

## Setup Commands

```bash
# Clone repository
git clone https://github.com/username/agentcards.git
cd agentcards

# Initialize Deno project (Story 1.1)
deno task init

# Install dependencies (auto via deno.json imports)

# Run tests
deno task test

# Run benchmarks
deno task bench

# Format code
deno task fmt

# Lint code
deno task lint

# Build (compile to binary)
deno task build

# Run locally
deno task dev -- serve
```

## deno.json Tasks

```json
{
  "tasks": {
    "dev": "deno run -A main.ts",
    "test": "deno test -A",
    "bench": "deno bench -A",
    "fmt": "deno fmt",
    "lint": "deno lint",
    "build": "deno compile -A -o dist/agentcards main.ts"
  }
}
```

---
