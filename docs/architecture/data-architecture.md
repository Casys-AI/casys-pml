# Data Architecture

## Database Schema (PGlite)

```sql
-- Story 1.2: Initial schema

CREATE TABLE tool_schema (
  tool_id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  input_schema JSONB NOT NULL,
  output_schema JSONB,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tool_embedding (
  tool_id TEXT PRIMARY KEY REFERENCES tool_schema(tool_id) ON DELETE CASCADE,
  embedding vector(1024) NOT NULL,  -- BGE-Large-EN-v1.5 dimensions
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for vector similarity search
CREATE INDEX idx_embedding_vector ON tool_embedding
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE config_metadata (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE telemetry_metrics (
  id SERIAL PRIMARY KEY,
  metric_name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  tags JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_timestamp ON telemetry_metrics(timestamp DESC);
CREATE INDEX idx_metrics_name ON telemetry_metrics(metric_name);
```

## Data Models

```typescript
// src/types.ts

export interface ToolSchema {
  toolId: string;
  serverId: string;
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  cachedAt: Date;
}

export interface ToolEmbedding {
  toolId: string;
  embedding: Float32Array; // 1024-dim vector
  createdAt: Date;
}

export interface SearchResult {
  toolId: string;
  score: number; // Cosine similarity [0-1]
  schema: ToolSchema;
}
```

---
