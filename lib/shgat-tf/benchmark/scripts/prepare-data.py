#!/usr/bin/env python3
"""
ToolRet data preparation for SHGAT-TF benchmark.

Downloads ToolRet datasets from HuggingFace, extracts hierarchy from ToolBench,
and embeds tool/query texts with BGE-M3.

Prerequisites:
    pip install datasets sentence-transformers torch

Usage:
    python3 scripts/prepare-data.py                # Full pipeline (download + embed)
    python3 scripts/prepare-data.py --skip-embed   # Download only (skip BGE-M3)
    python3 scripts/prepare-data.py --subset web   # Only web tools (ToolBench)
    python3 scripts/prepare-data.py --device cuda   # Use GPU for embeddings

Output:
    data/tools.json   - Tool corpus with embeddings and hierarchy metadata
    data/queries.json - Queries with embeddings and ground-truth labels
"""

import argparse
import json
import os
import sys
from pathlib import Path


def download_tools(subset: str = "web") -> list[dict]:
    """Download tools from HuggingFace ToolRet-Tools dataset."""
    from datasets import load_dataset

    print(f"[download] Loading ToolRet-Tools (config={subset})...")
    ds = load_dataset("mangopy/ToolRet-Tools", subset, split="tools")
    print(f"[download] Loaded {len(ds)} tools")

    tools = []
    for item in ds:
        tool_id = item["id"]
        documentation = item["documentation"]
        doc_raw = item["doc"]

        # Parse structured doc to extract hierarchy (ToolBench format)
        category_name = None
        tool_name = None
        api_name = None

        if isinstance(doc_raw, dict):
            category_name = doc_raw.get("category_name")
            tool_name = doc_raw.get("tool_name")
            api_name = doc_raw.get("api_name")
        elif isinstance(doc_raw, str):
            try:
                doc_parsed = json.loads(doc_raw)
                if isinstance(doc_parsed, dict):
                    category_name = doc_parsed.get("category_name")
                    tool_name = doc_parsed.get("tool_name")
                    api_name = doc_parsed.get("api_name")
            except (json.JSONDecodeError, TypeError):
                pass

        tools.append({
            "id": tool_id,
            "documentation": documentation,
            "category_name": category_name,
            "tool_name": tool_name,
            "api_name": api_name,
        })

    return tools


def download_queries(task: str = "toolbench") -> list[dict]:
    """Download queries from HuggingFace ToolRet-Queries dataset."""
    from datasets import load_dataset

    print(f"[download] Loading ToolRet-Queries (config={task})...")
    ds = load_dataset("mangopy/ToolRet-Queries", task, split="queries")
    print(f"[download] Loaded {len(ds)} queries")

    queries = []
    for item in ds:
        labels = json.loads(item["labels"]) if isinstance(item["labels"], str) else item["labels"]
        queries.append({
            "id": item["id"],
            "query": item["query"],
            "labels": labels,  # [{id, relevance}, ...]
        })

    return queries


def embed_texts(texts: list[str], device: str = "cpu", batch_size: int = 64) -> list[list[float]]:
    """Embed texts with BGE-M3 (1024-dim)."""
    from sentence_transformers import SentenceTransformer
    import numpy as np

    print(f"[embed] Loading BGE-M3 on {device}...")
    model = SentenceTransformer("BAAI/bge-m3", device=device)

    print(f"[embed] Encoding {len(texts)} texts (batch_size={batch_size})...")
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=True,
        normalize_embeddings=True,  # L2-normalize for cosine similarity
    )

    # Convert to list of lists (JSON-serializable)
    return embeddings.tolist()


def build_hierarchy(tools: list[dict]) -> dict:
    """
    Extract ToolBench hierarchy from tools.

    Returns:
        {
            "categories": {name: [tool_name, ...]},
            "tool_servers": {tool_name: [api_id, ...]},
            "category_of_tool": {tool_name: category_name},
        }
    """
    categories: dict[str, set[str]] = {}
    tool_servers: dict[str, set[str]] = {}
    category_of_tool: dict[str, str] = {}

    for tool in tools:
        cat = tool.get("category_name")
        tname = tool.get("tool_name")
        tid = tool["id"]

        if cat and tname:
            categories.setdefault(cat, set()).add(tname)
            tool_servers.setdefault(tname, set()).add(tid)
            category_of_tool[tname] = cat

    # Convert sets to sorted lists for JSON
    return {
        "categories": {k: sorted(v) for k, v in categories.items()},
        "tool_servers": {k: sorted(v) for k, v in tool_servers.items()},
        "category_of_tool": category_of_tool,
    }


def main():
    parser = argparse.ArgumentParser(description="Prepare ToolRet data for SHGAT benchmark")
    parser.add_argument("--subset", default="web", choices=["web", "code", "customized"],
                        help="Tool corpus subset (default: web)")
    parser.add_argument("--task", default="toolbench",
                        help="Query task config (default: toolbench)")
    parser.add_argument("--skip-embed", action="store_true",
                        help="Skip BGE-M3 embedding (for testing)")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda", "mps"],
                        help="Device for BGE-M3 (default: cpu)")
    parser.add_argument("--batch-size", type=int, default=64,
                        help="Embedding batch size (default: 64)")
    parser.add_argument("--output-dir", default="data",
                        help="Output directory (default: data)")
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Download tools and queries
    tools = download_tools(args.subset)
    queries = download_queries(args.task)

    # 2. Build hierarchy
    hierarchy = build_hierarchy(tools)
    print(f"[hierarchy] {len(hierarchy['categories'])} categories, "
          f"{len(hierarchy['tool_servers'])} tool servers, "
          f"{sum(len(v) for v in hierarchy['tool_servers'].values())} API endpoints")

    # 3. Embed (optional)
    if not args.skip_embed:
        # Embed tool documentation
        tool_texts = [t["documentation"] for t in tools]
        tool_embeddings = embed_texts(tool_texts, device=args.device, batch_size=args.batch_size)
        for i, emb in enumerate(tool_embeddings):
            tools[i]["embedding"] = emb

        # Embed queries
        query_texts = [q["query"] for q in queries]
        query_embeddings = embed_texts(query_texts, device=args.device, batch_size=args.batch_size)
        for i, emb in enumerate(query_embeddings):
            queries[i]["embedding"] = emb

        print(f"[embed] Embedding dim: {len(tools[0]['embedding'])}")
    else:
        print("[embed] Skipped (use --skip-embed=false to enable)")

    # 4. Save
    tools_path = out_dir / "tools.json"
    queries_path = out_dir / "queries.json"
    hierarchy_path = out_dir / "hierarchy.json"

    with open(tools_path, "w") as f:
        json.dump(tools, f)
    print(f"[save] Tools → {tools_path} ({os.path.getsize(tools_path) / 1e6:.1f} MB)")

    with open(queries_path, "w") as f:
        json.dump(queries, f)
    print(f"[save] Queries → {queries_path} ({os.path.getsize(queries_path) / 1e6:.1f} MB)")

    with open(hierarchy_path, "w") as f:
        json.dump(hierarchy, f, indent=2)
    print(f"[save] Hierarchy → {hierarchy_path}")

    # Summary
    print("\n=== Summary ===")
    print(f"Tools:      {len(tools)}")
    print(f"Queries:    {len(queries)}")
    print(f"Categories: {len(hierarchy['categories'])}")
    print(f"Servers:    {len(hierarchy['tool_servers'])}")
    print(f"Embedded:   {'yes' if not args.skip_embed else 'no'}")
    print(f"\nNext: cd benchmark && npm run bench")


if __name__ == "__main__":
    main()
