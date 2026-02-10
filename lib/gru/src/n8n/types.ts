/**
 * Shared types for the n8n data augmentation pipeline.
 *
 * Used by scrape-n8n, embed-n8n-nodes, and build-soft-targets.
 *
 * @module gru/n8n/types
 */

/** A single node scraped from an n8n workflow template. */
export interface N8nScrapedNode {
  type: string;
  displayName: string;
  operation?: string;
  resource?: string;
  paramNames: string[];
}

/** An edge between two nodes in a scraped n8n workflow. */
export interface N8nScrapedEdge {
  fromType: string;
  fromOp?: string;
  toType: string;
  toOp?: string;
}

/** A complete scraped n8n workflow template. */
export interface N8nScrapedWorkflow {
  id: number;
  name: string;
  views: number;
  nodes: N8nScrapedNode[];
  edges: N8nScrapedEdge[];
  /** Human-readable description of what this workflow does (from n8n template). */
  description?: string;
}
