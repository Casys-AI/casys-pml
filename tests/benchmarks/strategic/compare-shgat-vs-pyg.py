#!/usr/bin/env python3
"""
Compare SHGAT vs PyTorch Geometric GNNs

Run after:
  1. deno run --allow-all tests/benchmarks/strategic/quick-shgat-eval.ts > /tmp/shgat-results.json
  2. python3 tests/benchmarks/strategic/pyg-gnn-benchmark.py

Usage: python3 tests/benchmarks/strategic/compare-shgat-vs-pyg.py
"""

import json
import numpy as np
import sys

# Load PyG results
try:
    with open("tests/benchmarks/strategic/pyg-results.json", "r") as f:
        pyg_results = json.load(f)
except FileNotFoundError:
    print("ERROR: Run pyg-gnn-benchmark.py first")
    sys.exit(1)

# Load SHGAT results
try:
    with open("/tmp/shgat-results.json", "r") as f:
        content = f.read()
        # Find the JSON line (last line that's valid JSON)
        for line in reversed(content.strip().split('\n')):
            try:
                shgat_results = json.loads(line)
                break
            except:
                continue
        else:
            raise ValueError("No JSON found in SHGAT results")
except FileNotFoundError:
    print("ERROR: Run quick-shgat-eval.ts first:")
    print("  deno run --allow-all tests/benchmarks/strategic/quick-shgat-eval.ts > /tmp/shgat-results.json 2>&1")
    sys.exit(1)

print("=" * 70)
print("SHGAT vs PyTorch Geometric - FINAL COMPARISON")
print("=" * 70)

noise_levels = [0.0, 0.1, 0.2, 0.3]

print("\nMRR Results (mean ± std)")
print("-" * 90)
header = "Model".ljust(15) + "Library".ljust(12) + "".join(f"noise={n}".ljust(16) for n in noise_levels)
print(header)
print("-" * 90)

def get_stats(results_dict, noise):
    """Get values for a noise level, handling both int and str keys"""
    vals = results_dict.get(str(noise), results_dict.get(noise, results_dict.get(int(noise), [0])))
    return np.mean(vals), np.std(vals)

# SHGAT
row = "SHGAT".ljust(15) + "lib/shgat".ljust(12)
for n in noise_levels:
    m, s = get_stats(shgat_results, n)
    row += f"{m:.3f} ± {s:.3f}".ljust(16)
print(row)

# PyG models
for model in ["gat", "gcn", "graphsage"]:
    row = model.upper().ljust(15) + "PyG".ljust(12)
    for n in noise_levels:
        vals = pyg_results["results"][model][str(n)]
        m, s = np.mean(vals), np.std(vals)
        row += f"{m:.3f} ± {s:.3f}".ljust(16)
    print(row)

# Cosine
row = "Cosine".ljust(15) + "baseline".ljust(12)
for n in noise_levels:
    vals = pyg_results["results"]["cosine"][str(n)]
    m, s = np.mean(vals), np.std(vals)
    row += f"{m:.3f} ± {s:.3f}".ljust(16)
print(row)

# ============================================================================
# Winner at Each Noise Level
# ============================================================================

print("\n" + "=" * 70)
print("WINNERS BY NOISE LEVEL")
print("=" * 70)

for n in noise_levels:
    shgat_m, _ = get_stats(shgat_results, n)
    all_models = {
        "SHGAT": shgat_m,
        "GAT (PyG)": np.mean(pyg_results["results"]["gat"][str(n)]),
        "GCN (PyG)": np.mean(pyg_results["results"]["gcn"][str(n)]),
        "GraphSAGE (PyG)": np.mean(pyg_results["results"]["graphsage"][str(n)]),
        "Cosine": np.mean(pyg_results["results"]["cosine"][str(n)]),
    }
    winner = max(all_models.items(), key=lambda x: x[1])
    print(f"noise={n}: 🏆 {winner[0]} (MRR={winner[1]:.3f})")

# SHGAT vs best PyG
print("\n" + "=" * 70)
print("SHGAT vs BEST PyG GNN MODEL")
print("=" * 70)

for n in noise_levels:
    shgat_mrr, _ = get_stats(shgat_results, n)
    pyg_best = max(
        np.mean(pyg_results["results"]["gat"][str(n)]),
        np.mean(pyg_results["results"]["gcn"][str(n)]),
        np.mean(pyg_results["results"]["graphsage"][str(n)]),
    )
    pyg_best_name = "GAT" if np.mean(pyg_results["results"]["gat"][str(n)]) == pyg_best else \
                    "GCN" if np.mean(pyg_results["results"]["gcn"][str(n)]) == pyg_best else "GraphSAGE"
    improvement = ((shgat_mrr - pyg_best) / pyg_best * 100) if pyg_best > 0 else 0
    status = "✅" if shgat_mrr > pyg_best else "❌"
    print(f"noise={n}: SHGAT={shgat_mrr:.3f} vs {pyg_best_name}={pyg_best:.3f} ({improvement:+.1f}%) {status}")

print("\n" + "=" * 70)
print("CONCLUSION")
print("=" * 70)

# Overall winner
hardest = 0.3
shgat_hard, _ = get_stats(shgat_results, hardest)
pyg_best_hard = max(
    np.mean(pyg_results["results"]["gat"][str(hardest)]),
    np.mean(pyg_results["results"]["gcn"][str(hardest)]),
    np.mean(pyg_results["results"]["graphsage"][str(hardest)]),
)

if shgat_hard > pyg_best_hard:
    pct = ((shgat_hard - pyg_best_hard) / pyg_best_hard * 100)
    print(f"✅ SHGAT WINS on hardest queries (noise=0.3)")
    print(f"   SHGAT: {shgat_hard:.3f} MRR")
    print(f"   Best PyG: {pyg_best_hard:.3f} MRR")
    print(f"   Improvement: +{pct:.1f}%")
else:
    pct = ((pyg_best_hard - shgat_hard) / shgat_hard * 100)
    print(f"❌ PyG GNN WINS on hardest queries (noise=0.3)")
    print(f"   SHGAT: {shgat_hard:.3f} MRR")
    print(f"   Best PyG: {pyg_best_hard:.3f} MRR")
    print(f"   Gap: -{pct:.1f}%")

print("=" * 70)
