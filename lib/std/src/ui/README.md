# MCP Apps UI Components

This directory contains 30 interactive UI components for MiniTools, built with **Preact** and **Panda CSS**. Each component is compiled into a single self-contained HTML file for use with the MCP Apps extension (SEP-1865).

## Architecture

```
src/ui/
├── mod.ts                  # Module exports and loadUiHtml helper
├── build-all.mjs           # Build script for all components
├── vite.single.config.mjs  # Vite config for single-file builds
├── panda.config.ts         # Panda CSS configuration
├── styled-system/          # Generated Panda CSS utilities
├── dist/                   # Built single-file HTML bundles (gitignored)
└── <component-name>/       # Component source folders
    ├── index.html          # Entry point
    └── src/
        └── main.tsx        # Component implementation
```

## Components Reference

### Data Visualization

| Component | Description | Data Properties |
|-----------|-------------|-----------------|
| **chart-viewer** | Bar, line, and pie charts | `{ type: "bar"|"line"|"pie", title?, labels: string[], datasets: [{ label?, data: number[], color? }] }` |
| **gauge** | Circular/linear gauge with thresholds | `{ value: number, min?, max?, label?, unit?, thresholds?: { warning?, critical? }, format?: "circular"|"linear"|"compact" }` |
| **sparkline** | Inline mini charts | `{ values: number[], type?: "line"|"bar", width?, height?, color? }` |
| **metrics-panel** | Dashboard metrics display | `{ metrics: [{ label: string, value: number|string, change?, trend?: "up"|"down" }] }` |
| **resource-monitor** | System resource monitoring | `{ cpu?: number, memory?: number, disk?: number, network?: { in: number, out: number } }` |
| **disk-usage-viewer** | Disk space visualization | `{ total: number, used: number, free: number, partitions?: [{ name, size, used }] }` |

### Data Display

| Component | Description | Data Properties |
|-----------|-------------|-----------------|
| **table-viewer** | Interactive data table | `{ columns: string[], rows: unknown[][], totalCount? }` or `[{ key: value, ... }]` |
| **json-viewer** | Collapsible JSON tree | Any valid JSON structure |
| **yaml-viewer** | YAML syntax display | YAML string or parsed object |
| **xml-viewer** | XML tree viewer | XML string with syntax highlighting |
| **tree-viewer** | Hierarchical tree display | `{ name: string, children?: TreeNode[], expanded?, icon? }` |
| **schema-viewer** | JSON Schema visualization | Valid JSON Schema object |
| **erd-viewer** | Entity-Relationship diagrams | `{ schema: string, tables: [{ name, columns: [{ name, type, isPrimaryKey }] }], relationships: [{ fromTable, fromColumn, toTable, toColumn }] }` |

### Developer Tools

| Component | Description | Data Properties |
|-----------|-------------|-----------------|
| **diff-viewer** | Side-by-side/unified diff | `{ filename?, hunks?: [{ header, lines: [{ type: "add"|"remove"|"context", content }] }], unified?: string }` |
| **blame-viewer** | Git blame annotations | `{ file: string, lines: [{ lineNumber, commitHash, author, timestamp, content, summary }] }` |
| **commit-graph** | Git commit graph | `{ commits: [{ hash, shortHash, message, refs, parents, author, timestamp }], branches }` |
| **log-viewer** | Filterable log display | `{ logs: [{ timestamp?, level?: "debug"|"info"|"warn"|"error", message }], title? }` |
| **headers-viewer** | HTTP headers display | `{ url?, status?, headers: Record<string, string>, type?: "request"|"response" }` |
| **waterfall-viewer** | Request timing waterfall | `{ requests: [{ name, start, duration, type? }], total? }` |
| **timeline-viewer** | Event timeline | `{ events: [{ timestamp, title, description?, type? }] }` |
| **plan-viewer** | Execution plan visualization | `{ nodes: [{ id, type, operation, cost?, rows? }], edges?: [{ from, to }] }` |

### Security and Crypto

| Component | Description | Data Properties |
|-----------|-------------|-----------------|
| **jwt-viewer** | JWT token decoder | `{ header: object, payload: object, signature: string, expired?, expiresAt? }` |
| **certificate-viewer** | SSL/TLS certificate details | `{ host, port, valid, certificate: { subject, issuer, validFrom, validTo, daysRemaining, sans }, chain?, status }` |
| **validation-result** | Validation results display | `{ valid: boolean, errors?: [{ path, message }], warnings?, schema? }` |

### Forms and Input

| Component | Description | Data Properties |
|-----------|-------------|-----------------|
| **form-viewer** | Dynamic form from JSON Schema | `{ schema: JSONSchema, values?, title?, submitLabel? }` |
| **color-picker** | Color selection tool | `{ value?: string, format?: "hex"|"rgb"|"hsl", palette?: string[] }` |
| **palette-viewer** | Color palette display | `{ colors: [{ name?, value: string, variants? }], title? }` |

### Utilities

| Component | Description | Data Properties |
|-----------|-------------|-----------------|
| **qr-viewer** | QR code display | `{ svg?: string, dataUrl?, ascii?, data?, size?, errorCorrection? }` |
| **map-viewer** | Geographic data viewer | `{ points?: [{ lat, lng, label?, color? }], lines?: [{ from, to, distance? }], polygons?, title? }` |
| **status-badge** | Status indicator | `{ status: "success"|"warning"|"error"|"info"|"pending", label?, message? }` |

## Usage Examples

### table-viewer

Displays tabular data with sorting, filtering, and pagination.

```typescript
// Tool output format (array of objects)
[
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" }
]

// Alternative format (columns + rows)
{
  "columns": ["id", "name", "email"],
  "rows": [[1, "Alice", "alice@example.com"], [2, "Bob", "bob@example.com"]],
  "totalCount": 2
}
```

**Events emitted:** `select`, `filter`, `sort`, `paginate`

### json-viewer

Interactive JSON tree with collapsible nodes and path copying.

```typescript
// Any JSON structure
{
  "user": {
    "name": "Alice",
    "roles": ["admin", "developer"],
    "settings": { "theme": "dark" }
  }
}
```

**Events emitted:** `select`, `copy`, `expand`, `collapse`

### chart-viewer

SVG-based charts with bar, line, and pie types.

```typescript
{
  "type": "bar",
  "title": "Monthly Sales",
  "labels": ["Jan", "Feb", "Mar", "Apr"],
  "datasets": [
    { "label": "2024", "data": [100, 150, 120, 180], "color": "#3b82f6" },
    { "label": "2023", "data": [80, 120, 100, 150], "color": "#10b981" }
  ]
}
```

**Events emitted:** `click` (with label, value, dataset)

### gauge

Displays a value with optional thresholds for status coloring.

```typescript
{
  "value": 75,
  "min": 0,
  "max": 100,
  "label": "CPU Usage",
  "unit": "%",
  "thresholds": { "warning": 70, "critical": 90 },
  "format": "circular"  // "circular" | "linear" | "compact"
}
```

### diff-viewer

Shows code differences with syntax highlighting.

```typescript
{
  "filename": "src/main.ts",
  "unified": "@@ -1,3 +1,4 @@\n function hello() {\n-  console.log('Hello');\n+  console.log('Hello, World!');\n+  return true;\n }"
}
```

**Events emitted:** `navigate`, `click`

### jwt-viewer

Decodes and displays JWT tokens with expiration status.

```typescript
{
  "header": { "alg": "RS256", "typ": "JWT" },
  "payload": {
    "sub": "1234567890",
    "name": "John Doe",
    "iat": 1516239022,
    "exp": 1716239022
  },
  "signature": "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
}
```

**Events emitted:** `copyHeader`, `copyPayload`, `copySignature`

### log-viewer

Displays logs with level filtering and text search.

```typescript
{
  "title": "Application Logs",
  "logs": [
    { "timestamp": "2024-01-15T10:30:00Z", "level": "info", "message": "Server started" },
    { "timestamp": "2024-01-15T10:30:05Z", "level": "error", "message": "Connection failed" }
  ]
}

// Also accepts raw log strings
["2024-01-15 10:30:00 INFO Server started", "2024-01-15 10:30:05 ERROR Connection failed"]
```

**Events emitted:** `filterLevel`, `filterText`, `selectLine`

### map-viewer

Displays geographic points, lines, and polygons.

```typescript
{
  "title": "Office Locations",
  "points": [
    { "lat": 48.8566, "lng": 2.3522, "label": "Paris HQ", "color": "#3b82f6" },
    { "lat": 40.7128, "lng": -74.0060, "label": "NYC Office", "color": "#ef4444" }
  ],
  "lines": [
    { "from": { "lat": 48.8566, "lng": 2.3522 }, "to": { "lat": 40.7128, "lng": -74.0060 } }
  ]
}
```

**Events emitted:** `selectPoint`, `copy`

### form-viewer

Generates forms from JSON Schema with validation.

```typescript
{
  "title": "User Registration",
  "submitLabel": "Register",
  "schema": {
    "type": "object",
    "required": ["email", "password"],
    "properties": {
      "email": { "type": "string", "format": "email", "title": "Email Address" },
      "password": { "type": "string", "title": "Password", "minLength": 8 },
      "newsletter": { "type": "boolean", "title": "Subscribe to newsletter", "default": false }
    }
  }
}
```

**Events emitted:** `change`, `submit`

## Adding a New Component

### 1. Create the component folder

```bash
mkdir -p src/ui/my-component/src
```

### 2. Create index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Component</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./src/main.tsx"></script>
</body>
</html>
```

### 3. Create src/main.tsx

```tsx
import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// Types
interface MyData {
  value: string;
  // ... your data structure
}

// MCP App Connection
const app = new App({ name: "My Component", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// Component
function MyComponent() {
  const [data, setData] = useState<MyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
    }).catch(() => {});

    app.ontoolresult = (result) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          setData(JSON.parse(textContent.text));
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    };
  }, []);

  if (loading) {
    return <div class={styles.container}>Loading...</div>;
  }

  if (!data) {
    return <div class={styles.container}>No data</div>;
  }

  return (
    <div class={styles.container}>
      {/* Your component UI */}
    </div>
  );
}

// Styles
const styles = {
  container: css({
    p: "4",
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
  }),
};

// Mount
render(<MyComponent />, document.getElementById("app")!);
```

### 4. Create src/styles.css (optional)

```css
/* Additional styles if needed */
```

### 5. Build the component

```bash
cd lib/std/src/ui
node build-all.mjs
```

## Build System

### Build all components

```bash
# From project root
deno task build:ui

# Or from ui folder
cd lib/std/src/ui
node build-all.mjs
```

### Build output

Each component is compiled into a single self-contained HTML file in `dist/<component>/index.html`. The build uses:

- **Vite** with `vite-plugin-singlefile` for bundling
- **Preact** for reactive UI
- **Panda CSS** for styling with dark mode support

## MCP Apps Integration

### Adding _meta.ui to a tool

Reference a UI in your tool definition:

```typescript
{
  name: "my_tool",
  description: "Tool description",
  category: "mymodule",
  inputSchema: { /* ... */ },
  _meta: {
    ui: {
      resourceUri: "ui://mcp-std/my-component",
      emits: ["select", "filter"],      // Events the UI sends to the model
      accepts: ["setData", "highlight"] // Events the UI can receive
    }
  },
  handler: async (args) => { /* ... */ }
}
```

### Event Communication

**UI to Model (emits):**
- `select` - User selected an item
- `filter` - User applied a filter
- `sort` - User sorted data
- `copy` - User copied content
- `submit` - User submitted a form

**Model to UI (accepts):**
- `setData` - Replace displayed data
- `highlight` - Highlight specific items
- `scrollTo` - Scroll to specific position
- `refresh` - Reload data from server

## Events Reference

Components communicate with the MCP host via `notifyModel()`. Each event sends a `structuredContent` object with the event name and relevant data.

### Emits (Component -> Host)

| Component | Event | Payload | Description |
|-----------|-------|---------|-------------|
| **table-viewer** | `select` | `{ rowIndex, row }` | Row clicked |
| **table-viewer** | `sort` | `{ column, direction }` | Column sorted (asc/desc) |
| **table-viewer** | `filter` | `{ text }` | Filter text changed |
| **json-viewer** | `select` | `{ path, value }` | Node selected |
| **json-viewer** | `copy` | `{ path }` | Path copied to clipboard |
| **chart-viewer** | `click` | `{ label, value, dataset }` | Data point clicked |
| **map-viewer** | `selectPoint` | `{ point }` | Marker selected |
| **map-viewer** | `copy` | `{ text }` | Coordinates copied |
| **diff-viewer** | `viewModeChange` | `{ mode }` | Toggle inline/side-by-side |
| **diff-viewer** | `navigate` | `{ hunk, direction }` | Navigate between hunks |
| **diff-viewer** | `click` | `{ hunk, line, type }` | Line clicked |

### Accepts (Host -> Component)

Components receive data via `app.ontoolresult`. The host can update displayed data by sending new tool results.

| Component | Method | Description |
|-----------|--------|-------------|
| All | `ontoolresult` | Replace displayed data with new content |
| All | `ontoolinputpartial` | Show loading state |

## Styling Guidelines

- Use Panda CSS tokens for theming: `color: "fg.default"`, `bg: "bg.canvas"`
- Support both light and dark modes via `_dark` variants
- Use responsive layouts with `flexWrap`, `gap`, etc.
- Keep components minimal - hosts may override styles
- Avoid fixed dimensions where possible

## Testing

Use the test host for development:

```bash
# Start dev server
cd lib/std/src/ui
npx vite --config vite.single.config.mjs

# Open test-host.html in browser with your component
```

Or test with the full MCP server:

```bash
# Start MCP server
deno run -A server.ts

# Use ext-apps basic-host example
SERVERS='["stdio:deno run -A /path/to/lib/std/server.ts"]' npm start
```
