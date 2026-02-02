# MCP Apps UI for lib/std

This folder contains interactive UI components for MiniTools, using the MCP Apps extension (SEP-1865).

## Architecture

```
src/ui/
├── mod.ts                # Module exports and loadUiHtml helper
├── README.md             # This file
├── dist/                 # Built single-file HTML bundles (gitignored)
└── <ui-name>/            # UI source folders
    ├── index.html        # Entry point
    ├── src/
    │   └── main.ts       # UI logic
    └── vite.config.ts    # Optional per-UI Vite config
```

## Adding a New UI

### 1. Create the UI folder

```bash
mkdir -p src/ui/my-viewer/src
```

### 2. Create index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Viewer</title>
  <style>
    /* Styles - use CSS variables for theming */
    :root {
      --bg-color: #ffffff;
      --text-color: #1a1a1a;
      --border-color: #e0e0e0;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #1a1a1a;
        --text-color: #ffffff;
        --border-color: #333333;
      }
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./src/main.ts"></script>
</body>
</html>
```

### 3. Create src/main.ts

```typescript
import { App } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "My Viewer", version: "1.0.0" });
await app.connect();

// Handle tool results
app.ontoolresult = (result) => {
  const data = JSON.parse(result.content?.find(c => c.type === "text")?.text ?? "{}");
  renderData(data);
};

function renderData(data: unknown) {
  const container = document.getElementById("app")!;
  container.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}
```

### 4. Register in mod.ts

Add your UI to the `UI_RESOURCES` registry:

```typescript
export const UI_RESOURCES: Record<string, UIResourceMeta> = {
  // ... existing UIs
  "ui://mcp-std/my-viewer": {
    name: "My Viewer",
    description: "Description of what this UI does",
    tools: ["tool_name_1", "tool_name_2"],
  },
};
```

### 5. Add _meta.ui to your tool

```typescript
// In src/tools/mymodule.ts
{
  name: "my_tool",
  description: "Description",
  category: "mymodule",
  inputSchema: { ... },
  _meta: {
    ui: {
      resourceUri: "ui://mcp-std/my-viewer",
      emits: ["select", "filter"],
      accepts: ["setData", "highlight"]
    }
  },
  handler: async (args) => { ... }
}
```

### 6. Build and test

```bash
# Build all UIs
deno task build:ui

# Test with the MCP server
deno run -A server.ts
```

## Building

UIs are built using Vite with `vite-plugin-singlefile` to produce a single self-contained HTML file.

```bash
# Build all UIs
deno task build:ui

# Build specific UI (from ui folder)
cd src/ui/table-viewer && npx vite build
```

## Testing

Use the `ext-apps` basic-host example to test UIs:

```bash
# Clone ext-apps repo
git clone https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps/examples/basic-host

# Run with mcp-std server
SERVERS='["stdio:deno run -A /path/to/lib/std/server.ts"]' npm start
```

## Events

### emits
Events the UI can send to inform the model:
- `filter` - User applied a filter
- `sort` - User sorted data
- `select` - User selected a row/item
- `paginate` - User changed page

### accepts
Events the UI can receive:
- `setData` - Replace displayed data
- `highlight` - Highlight specific items
- `scrollTo` - Scroll to specific position
- `refresh` - Reload data from server

## Styling Guidelines

- Use CSS custom properties for theming
- Support both light and dark modes
- Keep styles minimal - hosts may override
- Avoid fixed dimensions - use responsive layouts
