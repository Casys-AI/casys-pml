#!/usr/bin/env python3
"""
SHGAT vs PyTorch Geometric GNN Benchmark

Compares SHGAT against official PyG implementations of:
- GCN (Kipf & Welling 2017)
- GAT (Veličković et al. 2018)
- GraphSAGE (Hamilton et al. 2017)

All models use aligned hyperparameters:
- hiddenDim = 1024
- numHeads = 16 (for GAT)
- InfoNCE contrastive loss
- lr = 0.05, temperature = 0.07

Run:
  deno run --allow-all tests/benchmarks/strategic/export-benchmark-data.ts
  python3 tests/benchmarks/strategic/pyg-gnn-benchmark.py
"""

import json
import time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv, GATConv, SAGEConv
from torch_geometric.data import Data
from typing import Dict, List, Tuple

# ============================================================================
# Load Benchmark Data
# ============================================================================

print("=" * 70)
print("SHGAT vs PyTorch Geometric - FAIR COMPARISON")
print("=" * 70)

with open("tests/benchmarks/strategic/benchmark-data.json", "r") as f:
    data = json.load(f)

num_caps = data["numCapabilities"]
num_tools = data["numTools"]
num_nodes = data["numNodes"]
emb_dim = data["embDim"]
config = data["config"]

print(f"Config: hiddenDim={config['hiddenDim']}, numHeads={config['numHeads']}, "
      f"lr={config['lr']}, temp={config['temperature']}, epochs={config['epochs']}")
print(f"Data: {num_caps} caps, {num_tools} tools, {len(data['trainingExamples'])} train, "
      f"{len(data['testQueries'])} test")

# Build PyG graph
node_features = torch.tensor(data["nodeFeatures"], dtype=torch.float32)
edge_index = torch.tensor(data["edges"], dtype=torch.long).t().contiguous()

graph = Data(x=node_features, edge_index=edge_index)

# Training data
train_intents = torch.tensor([e["intentEmbedding"] for e in data["trainingExamples"]], dtype=torch.float32)
train_labels = torch.tensor([e["capabilityIdx"] for e in data["trainingExamples"]], dtype=torch.long)

# Test data
test_intents = torch.tensor([e["intentEmbedding"] for e in data["testQueries"]], dtype=torch.float32)
test_labels = torch.tensor([e["expectedCapabilityIdx"] for e in data["testQueries"]], dtype=torch.long)

print(f"Graph: {graph.num_nodes} nodes, {graph.num_edges} edges")

# ============================================================================
# GNN Models with PyTorch Geometric
# ============================================================================

class GCNModel(nn.Module):
    """GCN (Kipf & Welling 2017) with InfoNCE head"""
    def __init__(self, in_dim: int, hidden_dim: int, num_caps: int):
        super().__init__()
        self.conv1 = GCNConv(in_dim, hidden_dim)
        self.conv2 = GCNConv(hidden_dim, hidden_dim)
        self.query_proj = nn.Linear(in_dim, hidden_dim)
        self.num_caps = num_caps

    def forward(self, x, edge_index):
        h = F.relu(self.conv1(x, edge_index))
        h = self.conv2(h, edge_index)
        return h

    def get_cap_embeddings(self, x, edge_index):
        h = self.forward(x, edge_index)
        return F.normalize(h[:self.num_caps], dim=-1)

    def score(self, intent: torch.Tensor, cap_embs: torch.Tensor, temperature: float):
        q = F.normalize(self.query_proj(intent), dim=-1)
        return torch.matmul(q, cap_embs.t()) / temperature


class GATModel(nn.Module):
    """GAT (Veličković 2018) with 16 heads and InfoNCE head"""
    def __init__(self, in_dim: int, hidden_dim: int, num_caps: int, num_heads: int = 16):
        super().__init__()
        head_dim = hidden_dim // num_heads
        self.conv1 = GATConv(in_dim, head_dim, heads=num_heads, concat=True)
        self.conv2 = GATConv(hidden_dim, head_dim, heads=num_heads, concat=True)
        self.query_proj = nn.Linear(in_dim, hidden_dim)
        self.num_caps = num_caps

    def forward(self, x, edge_index):
        h = F.elu(self.conv1(x, edge_index))
        h = self.conv2(h, edge_index)
        return h

    def get_cap_embeddings(self, x, edge_index):
        h = self.forward(x, edge_index)
        return F.normalize(h[:self.num_caps], dim=-1)

    def score(self, intent: torch.Tensor, cap_embs: torch.Tensor, temperature: float):
        q = F.normalize(self.query_proj(intent), dim=-1)
        return torch.matmul(q, cap_embs.t()) / temperature


class GraphSAGEModel(nn.Module):
    """GraphSAGE (Hamilton 2017) with InfoNCE head"""
    def __init__(self, in_dim: int, hidden_dim: int, num_caps: int):
        super().__init__()
        self.conv1 = SAGEConv(in_dim, hidden_dim)
        self.conv2 = SAGEConv(hidden_dim, hidden_dim)
        self.query_proj = nn.Linear(in_dim, hidden_dim)
        self.num_caps = num_caps

    def forward(self, x, edge_index):
        h = F.relu(self.conv1(x, edge_index))
        h = self.conv2(h, edge_index)
        return h

    def get_cap_embeddings(self, x, edge_index):
        h = self.forward(x, edge_index)
        return F.normalize(h[:self.num_caps], dim=-1)

    def score(self, intent: torch.Tensor, cap_embs: torch.Tensor, temperature: float):
        q = F.normalize(self.query_proj(intent), dim=-1)
        return torch.matmul(q, cap_embs.t()) / temperature


# ============================================================================
# Cosine Baseline (no learning)
# ============================================================================

class CosineBaseline:
    def __init__(self, cap_embeddings: torch.Tensor):
        self.cap_embs = F.normalize(cap_embeddings, dim=-1)

    def score(self, intent: torch.Tensor) -> torch.Tensor:
        q = F.normalize(intent, dim=-1)
        return torch.matmul(q, self.cap_embs.t())


# ============================================================================
# Training with InfoNCE Loss
# ============================================================================

def info_nce_loss(scores: torch.Tensor, labels: torch.Tensor) -> torch.Tensor:
    """InfoNCE contrastive loss"""
    return F.cross_entropy(scores, labels)


def train_gnn(model: nn.Module, graph: Data, train_intents: torch.Tensor,
              train_labels: torch.Tensor, config: dict) -> List[float]:
    optimizer = torch.optim.Adam(model.parameters(), lr=config["lr"])
    losses = []

    for epoch in range(config["epochs"]):
        model.train()
        optimizer.zero_grad()

        # Get capability embeddings
        cap_embs = model.get_cap_embeddings(graph.x, graph.edge_index)

        # Score all intents
        scores = model.score(train_intents, cap_embs, config["temperature"])

        # InfoNCE loss
        loss = info_nce_loss(scores, train_labels)
        loss.backward()
        optimizer.step()

        losses.append(loss.item())

    return losses


# ============================================================================
# Evaluation
# ============================================================================

def evaluate(model, graph: Data, test_intents: torch.Tensor,
             test_labels: torch.Tensor, temperature: float) -> Dict[str, float]:
    model.eval()
    with torch.no_grad():
        cap_embs = model.get_cap_embeddings(graph.x, graph.edge_index)
        scores = model.score(test_intents, cap_embs, temperature)

    return compute_metrics(scores, test_labels)


def evaluate_cosine(baseline: CosineBaseline, test_intents: torch.Tensor,
                    test_labels: torch.Tensor) -> Dict[str, float]:
    with torch.no_grad():
        scores = baseline.score(test_intents)
    return compute_metrics(scores, test_labels)


def compute_metrics(scores: torch.Tensor, labels: torch.Tensor) -> Dict[str, float]:
    """Compute MRR, Hit@1, Hit@3"""
    rankings = torch.argsort(scores, dim=-1, descending=True)

    mrr = 0.0
    hit1 = 0
    hit3 = 0

    for i, label in enumerate(labels):
        rank = (rankings[i] == label).nonzero(as_tuple=True)[0].item() + 1
        mrr += 1.0 / rank
        if rank == 1:
            hit1 += 1
        if rank <= 3:
            hit3 += 1

    n = len(labels)
    return {
        "mrr": mrr / n,
        "hit1": hit1 / n,
        "hit3": hit3 / n,
    }


# ============================================================================
# Noise Perturbation for Harder Queries
# ============================================================================

def perturb_embeddings(embs: torch.Tensor, noise_level: float, seed: int) -> torch.Tensor:
    if noise_level == 0:
        return embs
    torch.manual_seed(seed)
    noise = torch.randn_like(embs) * noise_level
    perturbed = embs + noise
    return F.normalize(perturbed, dim=-1)


# ============================================================================
# Run Experiments
# ============================================================================

NUM_RUNS = 5
NOISE_LEVELS = [0.0, 0.1, 0.2, 0.3]

print("\n" + "=" * 70)
print("RUNNING EXPERIMENTS")
print("=" * 70)

# Store results: model -> noise -> list of MRRs
results: Dict[str, Dict[float, List[float]]] = {
    "cosine": {n: [] for n in NOISE_LEVELS},
    "gcn": {n: [] for n in NOISE_LEVELS},
    "gat": {n: [] for n in NOISE_LEVELS},
    "graphsage": {n: [] for n in NOISE_LEVELS},
}

# Cosine baseline (no training needed)
cosine_baseline = CosineBaseline(node_features[:num_caps])

for noise in NOISE_LEVELS:
    print(f"\n📊 Noise level = {noise}")

    for run in range(NUM_RUNS):
        seed = 42 + run * 1000
        torch.manual_seed(seed)
        np.random.seed(seed)

        # Perturb test queries
        perturbed_test = perturb_embeddings(test_intents, noise, seed + 999)

        print(f"  Run {run + 1}/{NUM_RUNS} (seed={seed})...", end="", flush=True)

        # Cosine baseline
        cosine_metrics = evaluate_cosine(cosine_baseline, perturbed_test, test_labels)
        results["cosine"][noise].append(cosine_metrics["mrr"])

        # GCN
        gcn = GCNModel(emb_dim, config["hiddenDim"], num_caps)
        train_gnn(gcn, graph, train_intents, train_labels, config)
        gcn_metrics = evaluate(gcn, graph, perturbed_test, test_labels, config["temperature"])
        results["gcn"][noise].append(gcn_metrics["mrr"])

        # GAT (16 heads)
        gat = GATModel(emb_dim, config["hiddenDim"], num_caps, config["numHeads"])
        train_gnn(gat, graph, train_intents, train_labels, config)
        gat_metrics = evaluate(gat, graph, perturbed_test, test_labels, config["temperature"])
        results["gat"][noise].append(gat_metrics["mrr"])

        # GraphSAGE
        sage = GraphSAGEModel(emb_dim, config["hiddenDim"], num_caps)
        train_gnn(sage, graph, train_intents, train_labels, config)
        sage_metrics = evaluate(sage, graph, perturbed_test, test_labels, config["temperature"])
        results["graphsage"][noise].append(sage_metrics["mrr"])

        print(f" GAT={gat_metrics['mrr']:.3f}, GCN={gcn_metrics['mrr']:.3f}")

# ============================================================================
# Results Summary
# ============================================================================

print("\n" + "=" * 70)
print(f"RESULTS: MRR (mean ± std) across {NUM_RUNS} runs")
print("=" * 70)

def mean_std(arr):
    return np.mean(arr), np.std(arr)

header = "Model".ljust(15) + "".join(f"noise={n}".ljust(18) for n in NOISE_LEVELS)
print(f"\n{header}")
print("-" * (15 + len(NOISE_LEVELS) * 18))

for model in ["cosine", "gcn", "gat", "graphsage"]:
    row = model.ljust(15)
    for noise in NOISE_LEVELS:
        m, s = mean_std(results[model][noise])
        row += f"{m:.3f} ± {s:.3f}".ljust(18)
    print(row)

# Final ranking at hardest noise level
hardest = NOISE_LEVELS[-1]
print("\n" + "=" * 70)
print(f"FINAL RANKING (noise={hardest}, hardest queries)")
print("=" * 70)

ranking = sorted(
    [(model, np.mean(results[model][hardest]), np.std(results[model][hardest]))
     for model in results],
    key=lambda x: -x[1]
)

medals = ["🥇", "🥈", "🥉", "  "]
for i, (model, mrr, std) in enumerate(ranking):
    print(f"{medals[i]} {i+1}. {model.ljust(12)} MRR: {mrr:.3f} ± {std:.3f}")

# Save results for SHGAT comparison
with open("tests/benchmarks/strategic/pyg-results.json", "w") as f:
    json.dump({
        "results": {m: {str(n): v for n, v in noise_results.items()}
                   for m, noise_results in results.items()},
        "config": config,
        "noise_levels": NOISE_LEVELS,
        "num_runs": NUM_RUNS,
    }, f, indent=2)

print(f"\n✅ Results saved to tests/benchmarks/strategic/pyg-results.json")
print("=" * 70)
