# AgentCards Fresh Dashboard

Modern, interactive graph visualization dashboard built with **Deno Fresh**.

## Features

- ✅ **Server-Side Rendering (SSR)** with Preact
- ✅ **Islands Architecture** for interactive components
- ✅ **Real-time updates** via Server-Sent Events (SSE)
- ✅ **Interactive graph visualization** with Cytoscape.js
- ✅ **Responsive design** with Tailwind CSS
- ✅ **TypeScript** end-to-end
- ✅ **Zero build step** (Deno native)

## Quick Start

### 1. Start the AgentCards Gateway (required)

The Fresh dashboard fetches data from the AgentCards gateway API.

```bash
# Start gateway on port 3001
deno run --allow-all src/main.ts serve --port 3001 --config playground/config/mcp-servers.json
```

### 2. Start the Fresh Dashboard

```bash
# Development mode with hot reload
deno task dev:fresh

# Or directly
deno run -A src/web/dev.ts
```

The dashboard will be available at:
- **Dashboard:** http://localhost:8080/dashboard
- **Gateway API:** http://localhost:3001

## Architecture

```
src/web/
├── routes/
│   └── dashboard.tsx       # SSR route for /dashboard
├── islands/
│   └── GraphVisualization.tsx  # Interactive graph component
├── components/
│   ├── Legend.tsx          # Server filter legend
│   └── NodeDetails.tsx     # Node details panel
├── static/                 # Static assets
├── fresh.config.ts         # Fresh configuration
├── fresh.gen.ts            # Generated manifest (auto)
└── dev.ts                  # Server entry point
```

## How It Works

### SSR + Islands

1. **Route (`dashboard.tsx`):**
   - Server-side rendered
   - Loads Cytoscape.js from CDN
   - Hydrates GraphVisualization island

2. **Island (`GraphVisualization.tsx`):**
   - Client-side interactive
   - Fetches initial graph data from `/api/graph/snapshot`
   - Connects to `/events/stream` for real-time updates
   - Manages Cytoscape instance and user interactions

3. **Components:**
   - `Legend.tsx`: MCP server filtering
   - `NodeDetails.tsx`: Node information panel

### Real-Time Updates

The dashboard listens to SSE events from the gateway:

```typescript
const eventSource = new EventSource('/events/stream');

eventSource.addEventListener('node_created', (event) => {
  // Add new node to graph
});

eventSource.addEventListener('edge_created', (event) => {
  // Add new edge to graph
});
```

## Environment Variables

```bash
# Fresh server port (default: 8080)
FRESH_PORT=8080

# AgentCards gateway API base URL (default: http://localhost:3001)
API_BASE=http://localhost:3001
```

## Development

```bash
# Start with custom port
FRESH_PORT=9000 deno task dev:fresh

# Type check
deno check src/web/**/*.ts src/web/**/*.tsx

# Format code
deno fmt src/web/
```

## Deployment

Fresh runs natively on Deno Deploy with zero configuration:

```bash
# Build for production (optional - Fresh is runtime)
deno task fresh:build

# Or deploy directly
deployctl deploy
```

## Migration from HTML Dashboard

The original HTML dashboard (`public/dashboard.html`) is now replaced with this Fresh implementation:

**Before (HTML):**
- 530 lines of HTML/CSS/JS in one file
- Manual DOM manipulation
- No component structure
- Hard to test and maintain

**After (Fresh):**
- Clean component architecture
- TypeScript type safety
- Hot reload in development
- Reusable islands and components
- Server-side rendering for better performance

## Troubleshooting

### Dashboard shows empty graph

1. Ensure gateway is running on port 3001
2. Check if workflows are synced to database:
   ```bash
   deno task cli workflows sync --file playground/config/workflow-templates.yaml --force
   ```
3. Restart gateway to reload graph from database

### SSE connection fails

- Verify `/events/stream` endpoint is accessible
- Check browser console for connection errors
- Ensure no CORS issues (Fresh and gateway on same origin or CORS enabled)

### Cytoscape not loading

- Check browser console for CDN errors
- Verify internet connection (Cytoscape loaded from CDN)
- Consider vendoring Cytoscape for offline use

## Related Documentation

- [Story 6.2 - Interactive Graph Visualization Dashboard](../../docs/stories/6-2-interactive-graph-visualization-dashboard.md)
- [ADR-020 - Graceful Shutdown with Timeout Guard](../../docs/adr/ADR-020-graceful-shutdown-timeout.md)
- [Fresh Documentation](https://fresh.deno.dev/)
- [Cytoscape.js Documentation](https://js.cytoscape.org/)
