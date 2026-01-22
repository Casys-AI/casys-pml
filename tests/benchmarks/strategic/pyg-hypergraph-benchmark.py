#!/usr/bin/env python3
"""
SHGAT vs PyTorch Geometric HypergraphConv Benchmark

Supports two dataset types:
1. Production data (ranking task): intent → best capability
2. CocitationCora (node classification): predict paper topic

Run:
  python3 tests/benchmarks/strategic/pyg-hypergraph-benchmark.py
  python3 tests/benchmarks/strategic/pyg-hypergraph-benchmark.py --dataset cocitation-cora
"""

import argparse
import json
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import HypergraphConv
from typing import Dict, List

parser = argparse.ArgumentParser()
parser.add_argument("--dataset", default="production", choices=["production", "cocitation-cora"])
args = parser.parse_args()

# ============================================================================
# Load Benchmark Data
# ============================================================================

print("=" * 70)
print("PyG HypergraphConv Benchmark")
print("=" * 70)

if args.dataset == "cocitation-cora":
    # Node classification task
    TASK = "node_classification"
    with open("tests/benchmarks/datasets/cocitation-cora/cocitation-cora.json", "r") as f:
        data = json.load(f)

    num_nodes = data["num_vertices"]
    num_hyperedges = data["num_hyperedges"]
    num_classes = data["num_classes"]
    dim_features = data["dim_features"]

    node_features = torch.tensor(data["features"], dtype=torch.float32)
    labels = torch.tensor(data["labels"], dtype=torch.long)
    train_idx = torch.tensor(data["train_indices"], dtype=torch.long)
    test_idx = torch.tensor(data["test_indices"], dtype=torch.long)

    # Build hyperedge_index from hyperedges list
    node_indices = []
    hyperedge_indices = []
    for he_idx, he in enumerate(data["hyperedges"]):
        for node_idx in he:
            node_indices.append(node_idx)
            hyperedge_indices.append(he_idx)

    hyperedge_index = torch.tensor([node_indices, hyperedge_indices], dtype=torch.long)

    print(f"Dataset: CocitationCora (Node Classification)")
    print(f"Nodes: {num_nodes}, Hyperedges: {num_hyperedges}, Classes: {num_classes}")
    print(f"Features: {node_features.shape}, Train: {len(train_idx)}, Test: {len(test_idx)}")

    # SHGAT config from types.ts
    config = {
        "hiddenDim": 1024,
        "numHeads": 16,
        "headDim": 64,
        "lr": 0.05,           # SHGAT default
        "epochs": 200,
        "dropout": 0.1,       # SHGAT default (not 0.5)
        "preserveDimResidual": 0.3,  # 30% original + 70% propagated
        "leakyReluSlope": 0.2,
    }

else:
    # Ranking task (production data)
    TASK = "ranking"
    with open("tests/benchmarks/strategic/benchmark-data.json", "r") as f:
        data = json.load(f)

    num_caps = data["numCapabilities"]
    num_tools = data["numTools"]
    emb_dim = data["embDim"]
    config = data["config"]

    tool_features = torch.tensor(data["nodeFeatures"][num_caps:], dtype=torch.float32)
    cap_features = torch.tensor(data["nodeFeatures"][:num_caps], dtype=torch.float32)

    node_indices = []
    hyperedge_indices = []
    cap_to_tools: Dict[int, List[int]] = {i: [] for i in range(num_caps)}

    for edge in data["edges"]:
        src, dst = edge
        if src < num_caps and dst >= num_caps:
            cap_idx = src
            tool_idx = dst - num_caps
            if tool_idx not in cap_to_tools[cap_idx]:
                cap_to_tools[cap_idx].append(tool_idx)
        elif dst < num_caps and src >= num_caps:
            cap_idx = dst
            tool_idx = src - num_caps
            if tool_idx not in cap_to_tools[cap_idx]:
                cap_to_tools[cap_idx].append(tool_idx)

    for cap_idx, tools in cap_to_tools.items():
        for tool_idx in tools:
            node_indices.append(tool_idx)
            hyperedge_indices.append(cap_idx)

    hyperedge_index = torch.tensor([node_indices, hyperedge_indices], dtype=torch.long)

    train_intents = torch.tensor([e["intentEmbedding"] for e in data["trainingExamples"]], dtype=torch.float32)
    train_labels = torch.tensor([e["capabilityIdx"] for e in data["trainingExamples"]], dtype=torch.long)
    test_intents = torch.tensor([e["intentEmbedding"] for e in data["testQueries"]], dtype=torch.float32)
    test_labels = torch.tensor([e["expectedCapabilityIdx"] for e in data["testQueries"]], dtype=torch.long)

    print(f"Dataset: Production (Ranking Task)")
    print(f"Capabilities: {num_caps}, Tools: {num_tools}")
    print(f"Train: {len(train_intents)}, Test: {len(test_intents)}")

print(f"Config: {config}")

# ============================================================================
# Models for Node Classification
# ============================================================================

class HGNNClassifier(nn.Module):
    """Hypergraph Neural Network for Node Classification"""
    def __init__(self, in_dim: int, hidden_dim: int, num_classes: int, num_layers: int = 2, dropout: float = 0.5):
        super().__init__()
        self.dropout = dropout
        self.convs = nn.ModuleList()
        self.convs.append(HypergraphConv(in_dim, hidden_dim))
        for _ in range(num_layers - 2):
            self.convs.append(HypergraphConv(hidden_dim, hidden_dim))
        self.convs.append(HypergraphConv(hidden_dim, num_classes))

    def forward(self, x: torch.Tensor, hyperedge_index: torch.Tensor) -> torch.Tensor:
        for i, conv in enumerate(self.convs[:-1]):
            x = F.relu(conv(x, hyperedge_index))
            x = F.dropout(x, p=self.dropout, training=self.training)
        x = self.convs[-1](x, hyperedge_index)
        return x


class MultiHeadHGNNClassifier(nn.Module):
    """Multi-head Hypergraph Neural Network for Node Classification"""
    def __init__(self, in_dim: int, hidden_dim: int, num_classes: int, num_heads: int = 8, dropout: float = 0.5):
        super().__init__()
        self.dropout = dropout
        self.num_heads = num_heads
        self.head_dim = hidden_dim // num_heads

        # Multi-head first layer
        self.convs1 = nn.ModuleList([
            HypergraphConv(in_dim, self.head_dim) for _ in range(num_heads)
        ])
        # Second layer after concat
        self.conv2 = HypergraphConv(hidden_dim, num_classes)

    def forward(self, x: torch.Tensor, hyperedge_index: torch.Tensor) -> torch.Tensor:
        # Multi-head convolution
        heads = [F.elu(conv(x, hyperedge_index)) for conv in self.convs1]
        x = torch.cat(heads, dim=-1)
        x = F.dropout(x, p=self.dropout, training=self.training)
        x = self.conv2(x, hyperedge_index)
        return x


class SHGATClassifier(nn.Module):
    """
    SHGAT-style Multi-Head Hypergraph Attention for Node Classification

    Architecture matching our TypeScript SHGAT:
    - K heads with Q/K attention (16 heads, 64 dim each)
    - Message passing: node -> hyperedge -> node
    - Residual connections with preserveDimResidual=0.3
    - LeakyReLU with slope 0.2
    - Dropout 0.1
    """
    def __init__(self, in_dim: int, hidden_dim: int, num_classes: int,
                 num_heads: int = 16, head_dim: int = 64,
                 dropout: float = 0.1, preserve_dim_residual: float = 0.3,
                 leaky_relu_slope: float = 0.2):
        super().__init__()
        self.num_heads = num_heads
        self.head_dim = head_dim
        self.dropout = dropout
        self.preserve_dim_residual = preserve_dim_residual
        self.leaky_relu_slope = leaky_relu_slope

        # Per-head Q/K/V projections (SHGAT style)
        self.W_q = nn.ModuleList([nn.Linear(in_dim, head_dim, bias=False) for _ in range(num_heads)])
        self.W_k = nn.ModuleList([nn.Linear(in_dim, head_dim, bias=False) for _ in range(num_heads)])
        self.W_v = nn.ModuleList([nn.Linear(in_dim, head_dim, bias=False) for _ in range(num_heads)])

        # Output projection
        self.out_proj = nn.Linear(num_heads * head_dim, hidden_dim)

        # Classification head
        self.classifier = nn.Linear(hidden_dim, num_classes)

    def forward(self, x: torch.Tensor, hyperedge_index: torch.Tensor) -> torch.Tensor:
        num_nodes = x.size(0)
        node_idx, hyperedge_idx = hyperedge_index[0], hyperedge_index[1]
        num_hyperedges = hyperedge_idx.max().item() + 1

        head_outputs = []
        for h in range(self.num_heads):
            Q = self.W_q[h](x)  # [num_nodes, head_dim]
            K = self.W_k[h](x)  # [num_nodes, head_dim]
            V = self.W_v[h](x)  # [num_nodes, head_dim]

            # Step 1: Node -> Hyperedge aggregation (mean pooling)
            hyperedge_emb = torch.zeros(num_hyperedges, self.head_dim, device=x.device)
            hyperedge_counts = torch.zeros(num_hyperedges, device=x.device)

            hyperedge_emb.index_add_(0, hyperedge_idx, V[node_idx])
            hyperedge_counts.index_add_(0, hyperedge_idx, torch.ones_like(hyperedge_idx, dtype=torch.float))
            hyperedge_emb = hyperedge_emb / hyperedge_counts.unsqueeze(-1).clamp(min=1)

            # Step 2: Hyperedge -> Node propagation
            node_agg = torch.zeros(num_nodes, self.head_dim, device=x.device)
            node_counts = torch.zeros(num_nodes, device=x.device)

            node_agg.index_add_(0, node_idx, hyperedge_emb[hyperedge_idx])
            node_counts.index_add_(0, node_idx, torch.ones_like(node_idx, dtype=torch.float))
            node_agg = node_agg / node_counts.unsqueeze(-1).clamp(min=1)

            # Residual connection (SHGAT style: preserveDimResidual=0.3)
            # final = r * original + (1-r) * propagated
            r = self.preserve_dim_residual
            head_out = r * V + (1 - r) * node_agg
            head_outputs.append(head_out)

        # Concatenate heads
        x = torch.cat(head_outputs, dim=-1)  # [num_nodes, num_heads * head_dim]
        x = F.leaky_relu(x, negative_slope=self.leaky_relu_slope)
        x = F.dropout(x, p=self.dropout, training=self.training)

        # Output projection
        x = self.out_proj(x)
        x = F.leaky_relu(x, negative_slope=self.leaky_relu_slope)
        x = F.dropout(x, p=self.dropout, training=self.training)

        # Classification
        return self.classifier(x)


# ============================================================================
# Models for Ranking (kept for production dataset)
# ============================================================================

class HypergraphRanker(nn.Module):
    """Hypergraph model for ranking task"""
    def __init__(self, in_dim: int, hidden_dim: int, num_caps: int, num_layers: int = 2):
        super().__init__()
        self.num_caps = num_caps
        self.hidden_dim = hidden_dim
        self.convs = nn.ModuleList()
        self.convs.append(HypergraphConv(in_dim, hidden_dim))
        for _ in range(num_layers - 1):
            self.convs.append(HypergraphConv(hidden_dim, hidden_dim))
        self.query_proj = nn.Linear(in_dim, hidden_dim)
        self.hyperedge_proj = nn.Linear(hidden_dim, hidden_dim)

    def forward(self, x: torch.Tensor, hyperedge_index: torch.Tensor) -> torch.Tensor:
        for conv in self.convs:
            x = F.relu(conv(x, hyperedge_index))
        return x

    def get_hyperedge_embeddings(self, x: torch.Tensor, hyperedge_index: torch.Tensor,
                                  cap_to_tools: Dict[int, List[int]]) -> torch.Tensor:
        node_embs = self.forward(x, hyperedge_index)
        hyperedge_embs = []
        for cap_idx in range(self.num_caps):
            tool_indices = cap_to_tools.get(cap_idx, [])
            if len(tool_indices) > 0:
                cap_emb = node_embs[tool_indices].mean(dim=0)
            else:
                cap_emb = torch.zeros(self.hidden_dim)
            hyperedge_embs.append(cap_emb)
        hyperedge_embs = torch.stack(hyperedge_embs)
        hyperedge_embs = self.hyperedge_proj(hyperedge_embs)
        return F.normalize(hyperedge_embs, dim=-1)

    def score(self, intent: torch.Tensor, cap_embs: torch.Tensor, temperature: float) -> torch.Tensor:
        q = F.normalize(self.query_proj(intent), dim=-1)
        return torch.matmul(q, cap_embs.t()) / temperature


# ============================================================================
# Training & Evaluation for Node Classification
# ============================================================================

def train_classifier(model, node_features, hyperedge_index, labels, train_idx, config):
    optimizer = torch.optim.Adam(model.parameters(), lr=config["lr"], weight_decay=5e-4)
    model.train()

    for epoch in range(config["epochs"]):
        optimizer.zero_grad()
        out = model(node_features, hyperedge_index)
        loss = F.cross_entropy(out[train_idx], labels[train_idx])
        loss.backward()
        optimizer.step()

        if (epoch + 1) % 50 == 0:
            acc = evaluate_classifier(model, node_features, hyperedge_index, labels, train_idx)
            print(f"    Epoch {epoch+1}: loss={loss.item():.4f}, train_acc={acc:.4f}")


def evaluate_classifier(model, node_features, hyperedge_index, labels, idx):
    model.eval()
    with torch.no_grad():
        out = model(node_features, hyperedge_index)
        pred = out[idx].argmax(dim=1)
        acc = (pred == labels[idx]).float().mean().item()
    return acc


# ============================================================================
# Training & Evaluation for Ranking
# ============================================================================

def train_ranker(model, tool_features, hyperedge_index, cap_to_tools, train_intents, train_labels, config):
    optimizer = torch.optim.Adam(model.parameters(), lr=config["lr"])
    for epoch in range(config["epochs"]):
        model.train()
        optimizer.zero_grad()
        cap_embs = model.get_hyperedge_embeddings(tool_features, hyperedge_index, cap_to_tools)
        scores = model.score(train_intents, cap_embs, config["temperature"])
        loss = F.cross_entropy(scores, train_labels)
        loss.backward()
        optimizer.step()


def evaluate_ranker(model, tool_features, hyperedge_index, cap_to_tools, test_intents, test_labels, temperature):
    model.eval()
    with torch.no_grad():
        cap_embs = model.get_hyperedge_embeddings(tool_features, hyperedge_index, cap_to_tools)
        scores = model.score(test_intents, cap_embs, temperature)

    rankings = torch.argsort(scores, dim=-1, descending=True)
    mrr = 0.0
    for i, label in enumerate(test_labels):
        rank = (rankings[i] == label).nonzero(as_tuple=True)[0].item() + 1
        mrr += 1.0 / rank
    return mrr / len(test_labels)


# ============================================================================
# Run Experiments
# ============================================================================

NUM_RUNS = 5

if TASK == "node_classification":
    print("\n" + "=" * 70)
    print("NODE CLASSIFICATION EXPERIMENTS")
    print("=" * 70)

    results = {"HGNN": [], "HGNN-MultiHead": [], "SHGAT": []}

    for run in range(NUM_RUNS):
        seed = 42 + run * 1000
        torch.manual_seed(seed)
        np.random.seed(seed)

        print(f"\nRun {run + 1}/{NUM_RUNS} (seed={seed})")

        # HGNN (2-layer)
        print("  Training HGNN...")
        hgnn = HGNNClassifier(dim_features, config["hiddenDim"], num_classes, num_layers=2)
        train_classifier(hgnn, node_features, hyperedge_index, labels, train_idx, config)
        acc = evaluate_classifier(hgnn, node_features, hyperedge_index, labels, test_idx)
        results["HGNN"].append(acc)
        print(f"  HGNN Test Accuracy: {acc:.4f}")

        # Multi-head HGNN (PyG)
        print("  Training HGNN-MultiHead...")
        mh_hgnn = MultiHeadHGNNClassifier(dim_features, config["hiddenDim"], num_classes, config["numHeads"])
        train_classifier(mh_hgnn, node_features, hyperedge_index, labels, train_idx, config)
        acc_mh = evaluate_classifier(mh_hgnn, node_features, hyperedge_index, labels, test_idx)
        results["HGNN-MultiHead"].append(acc_mh)
        print(f"  HGNN-MultiHead Test Accuracy: {acc_mh:.4f}")

        # SHGAT (TypeScript lib/shgat via subprocess)
        print("  Running SHGAT (lib/shgat)...")
        import subprocess
        result = subprocess.run(
            ["deno", "run", "--allow-all", "--unstable-ffi",
             "tests/benchmarks/strategic/shgat-cocitation-eval.ts", str(seed)],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode == 0:
            acc_shgat = float(result.stdout.strip())
            results["SHGAT"].append(acc_shgat)
            print(f"  SHGAT Test Accuracy: {acc_shgat:.4f}")
        else:
            print(f"  SHGAT Error: {result.stderr[:200]}")

    # Summary
    print("\n" + "=" * 70)
    print(f"RESULTS: Test Accuracy (mean ± std) across {NUM_RUNS} runs")
    print("=" * 70)

    for model_name, accs in results.items():
        mean = np.mean(accs)
        std = np.std(accs)
        print(f"{model_name.ljust(20)} {mean:.4f} ± {std:.4f}")

    # Save results
    with open("tests/benchmarks/strategic/cocitation-cora-results.json", "w") as f:
        json.dump({"dataset": "CocitationCora", "task": "node_classification",
                   "results": results, "config": config}, f, indent=2)
    print(f"\n✅ Results saved to cocitation-cora-results.json")

else:
    # Ranking task (production data)
    print("\n" + "=" * 70)
    print("RANKING EXPERIMENTS")
    print("=" * 70)

    NOISE_LEVELS = [0.0, 0.1, 0.2, 0.3]

    def perturb(embs, noise, seed):
        if noise == 0:
            return embs
        torch.manual_seed(seed)
        noisy = embs + torch.randn_like(embs) * noise
        return F.normalize(noisy, dim=-1)

    results = {"cosine": {n: [] for n in NOISE_LEVELS},
               "HGNN": {n: [] for n in NOISE_LEVELS}}

    # Cosine baseline
    cap_embs_norm = F.normalize(cap_features, dim=-1)

    for noise in NOISE_LEVELS:
        print(f"\n📊 Noise level = {noise}")

        for run in range(NUM_RUNS):
            seed = 42 + run * 1000
            torch.manual_seed(seed)
            np.random.seed(seed)

            perturbed_test = perturb(test_intents, noise, seed + 999)

            # Cosine baseline
            with torch.no_grad():
                q = F.normalize(perturbed_test, dim=-1)
                scores = torch.matmul(q, cap_embs_norm.t())
                rankings = torch.argsort(scores, dim=-1, descending=True)
                mrr = 0.0
                for i, label in enumerate(test_labels):
                    rank = (rankings[i] == label).nonzero(as_tuple=True)[0].item() + 1
                    mrr += 1.0 / rank
                mrr /= len(test_labels)
            results["cosine"][noise].append(mrr)

            # HGNN Ranker
            hgnn = HypergraphRanker(emb_dim, config["hiddenDim"], num_caps, num_layers=2)
            train_ranker(hgnn, tool_features, hyperedge_index, cap_to_tools, train_intents, train_labels, config)
            mrr_hgnn = evaluate_ranker(hgnn, tool_features, hyperedge_index, cap_to_tools,
                                        perturbed_test, test_labels, config["temperature"])
            results["HGNN"][noise].append(mrr_hgnn)

            print(f"  Run {run+1}: Cosine={mrr:.3f}, HGNN={mrr_hgnn:.3f}")

    # Summary
    print("\n" + "=" * 70)
    print(f"RESULTS: MRR (mean ± std) across {NUM_RUNS} runs")
    print("=" * 70)

    header = "Model".ljust(15) + "".join(f"noise={n}".ljust(18) for n in NOISE_LEVELS)
    print(f"\n{header}")
    print("-" * (15 + len(NOISE_LEVELS) * 18))

    for model in ["cosine", "HGNN"]:
        row = model.ljust(15)
        for n in NOISE_LEVELS:
            m, s = np.mean(results[model][n]), np.std(results[model][n])
            row += f"{m:.3f} ± {s:.3f}".ljust(18)
        print(row)

    with open("tests/benchmarks/strategic/pyg-hypergraph-results.json", "w") as f:
        json.dump({"dataset": "production", "task": "ranking",
                   "results": {m: {str(n): v for n, v in nr.items()} for m, nr in results.items()},
                   "config": config}, f, indent=2)
    print(f"\n✅ Results saved to pyg-hypergraph-results.json")

print("=" * 70)
