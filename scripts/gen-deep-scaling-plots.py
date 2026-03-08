#!/usr/bin/env python3
"""
Generate deep-dive scaling plots for NB04.
Uses exact data extracted from executed notebook outputs.
"""
import os, numpy as np, pandas as pd, matplotlib.pyplot as plt, seaborn as sns, warnings
warnings.filterwarnings("ignore", category=FutureWarning)

sns.set_theme(style="whitegrid", font_scale=1.15, rc={
    "figure.facecolor": "#ffffff", "axes.facecolor": "#faf1f6",
    "axes.edgecolor": "#cfc3cd", "axes.labelcolor": "#1e1a1e",
    "text.color": "#1e1a1e", "xtick.color": "#4d444c", "ytick.color": "#4d444c",
    "grid.color": "#e8dfe6", "grid.alpha": 0.6, "grid.linewidth": 0.5,
    "legend.facecolor": "#ffffff", "legend.edgecolor": "#cfc3cd", "legend.framealpha": 0.9,
    "savefig.facecolor": "#ffffff", "savefig.dpi": 200, "figure.dpi": 150,
    "font.family": "sans-serif", "axes.spines.top": False, "axes.spines.right": False,
})
PRIMARY="#83468f"; TEAL="#4ECDC4"; WARM="#82524c"; MUTED="#988d97"; BLUE="#60a5fa"; GREEN="#4ade80"
BG="#ffffff"; SURFACE="#faf1f6"; TEXT="#1e1a1e"; TEXT_DIM="#7e747d"; BORDER="#cfc3cd"

OUT_DEEP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "lib", "casys-hub-vitrine", "public", "images", "engine", "deep", "dead-ends"))
OUT_NB   = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "lib", "shgat-for-gru", "notebooks"))
os.makedirs(OUT_DEEP, exist_ok=True)

# ── Exact data from NB04 executed outputs ────────────────────────
# all_results[catalog_size][method_name][metric]
all_results = {
    50: {
        "Top-1 cosine": {"seq_acc": 27.6, "tool_recall": 53.7, "tool_precision": 81.7},
        "Top-3 cosine": {"seq_acc":  0.4, "tool_recall": 76.5, "tool_precision": 53.5},
        "Residual":     {"seq_acc": 22.0, "tool_recall": 65.9, "tool_precision": 68.7},
        "Cooc Walk":    {"seq_acc":  0.0, "tool_recall": 76.1, "tool_precision": 48.1},
        "Dir Walk":     {"seq_acc":  0.0, "tool_recall": 81.4, "tool_precision": 46.5},
        "Dir Boosted":  {"seq_acc":  0.0, "tool_recall": 75.0, "tool_precision": 51.4},
        "GRU Seq":      {"seq_acc":  0.0, "tool_recall": 39.4, "tool_precision": 43.0},
    },
    200: {
        "Top-1 cosine": {"seq_acc": 34.0, "tool_recall": 53.0, "tool_precision": 72.7},
        "Top-3 cosine": {"seq_acc":  0.0, "tool_recall": 68.8, "tool_precision": 43.9},
        "Residual":     {"seq_acc": 17.2, "tool_recall": 61.2, "tool_precision": 58.8},
        "Cooc Walk":    {"seq_acc":  0.0, "tool_recall": 69.9, "tool_precision": 40.5},
        "Dir Walk":     {"seq_acc":  0.0, "tool_recall": 72.9, "tool_precision": 38.5},
        "Dir Boosted":  {"seq_acc":  0.0, "tool_recall": 69.9, "tool_precision": 41.6},
        "GRU Seq":      {"seq_acc":  0.0, "tool_recall": 30.9, "tool_precision": 39.5},
    },
    500: {
        "Top-1 cosine": {"seq_acc": 27.6, "tool_recall": 46.2, "tool_precision": 63.7},
        "Top-3 cosine": {"seq_acc":  0.2, "tool_recall": 63.1, "tool_precision": 39.5},
        "Residual":     {"seq_acc":  7.0, "tool_recall": 55.8, "tool_precision": 49.2},
        "Cooc Walk":    {"seq_acc":  0.0, "tool_recall": 63.8, "tool_precision": 36.4},
        "Dir Walk":     {"seq_acc":  0.0, "tool_recall": 68.8, "tool_precision": 35.9},
        "Dir Boosted":  {"seq_acc":  0.0, "tool_recall": 65.2, "tool_precision": 38.0},
        "GRU Seq":      {"seq_acc":  0.0, "tool_recall": 28.8, "tool_precision": 39.5},
    },
    1000: {
        "Top-1 cosine": {"seq_acc": 27.2, "tool_recall": 43.9, "tool_precision": 59.7},
        "Top-3 cosine": {"seq_acc":  0.0, "tool_recall": 60.0, "tool_precision": 38.3},
        "Residual":     {"seq_acc":  3.2, "tool_recall": 52.2, "tool_precision": 45.1},
        "Cooc Walk":    {"seq_acc":  0.0, "tool_recall": 61.3, "tool_precision": 35.4},
        "Dir Walk":     {"seq_acc":  0.0, "tool_recall": 65.3, "tool_precision": 34.1},
        "Dir Boosted":  {"seq_acc":  0.0, "tool_recall": 63.0, "tool_precision": 36.9},
        "GRU Seq":      {"seq_acc":  0.0, "tool_recall": 27.7, "tool_precision": 40.7},
    },
}

sizes = sorted(all_results.keys())
method_order = ["Top-1 cosine", "Top-3 cosine", "Residual", "Cooc Walk", "Dir Walk", "Dir Boosted", "GRU Seq"]
method_colors = {
    "Top-1 cosine": PRIMARY,
    "Top-3 cosine": TEAL,
    "Residual":     WARM,
    "Cooc Walk":    MUTED,
    "Dir Walk":     BLUE,
    "Dir Boosted":  GREEN,
    "GRU Seq":      "#c084fc",
}
method_markers = {"Top-1 cosine":"o","Top-3 cosine":"s","Residual":"^","Cooc Walk":"x","Dir Walk":"D","Dir Boosted":"v","GRU Seq":"P"}
method_styles  = {"Top-1 cosine":"-","Top-3 cosine":"-","Residual":"-","Cooc Walk":":","Dir Walk":"--","Dir Boosted":"--","GRU Seq":"--"}

def plot_04_scaling():
    fig, axes = plt.subplots(1, 3, figsize=(18, 5.5))

    for col, (metric, title) in enumerate([
        ("seq_acc",        "Seq Accuracy (%)"),
        ("tool_recall",    "Tool Recall (%)"),
        ("tool_precision", "Tool Precision (%)"),
    ]):
        ax = axes[col]
        for name in method_order:
            vals = [all_results[s][name][metric] for s in sizes]
            if any(v > 0 for v in vals):
                sns.lineplot(
                    x=sizes, y=vals,
                    ax=ax,
                    label=name,
                    color=method_colors[name],
                    marker=method_markers[name],
                    linestyle=method_styles[name],
                    markersize=7, linewidth=2,
                )
        ax.set_xlabel("Catalog Size")
        ax.set_ylabel("%")
        ax.set_title(title)
        ax.set_xscale("log")
        ax.axhline(y=80, color=WARM, linestyle=":", alpha=0.35, linewidth=1)
        ax.set_ylim(0, 105)
        ax.legend(fontsize=7.5, loc="best")
        sns.despine(ax=ax)

    plt.suptitle("Sequential Graph vs Flat vs Co-occurrence — Scaling", fontsize=13, y=1.02, color=TEXT)
    plt.tight_layout()

    out_nb   = os.path.join(OUT_NB,   "04-sequential-graph-scaling.png")
    out_deep = os.path.join(OUT_DEEP, "04-sequential-graph-scaling.png")
    plt.savefig(out_nb,   bbox_inches="tight")
    plt.savefig(out_deep, bbox_inches="tight")
    plt.close()
    print(f"  04-sequential-graph-scaling.png  NB:   ({os.path.getsize(out_nb)//1024}KB)")
    print(f"  04-sequential-graph-scaling.png  DEEP: ({os.path.getsize(out_deep)//1024}KB)")

print("=" * 60)
print("Generating scaling plots (NB04)")
print("=" * 60)
plot_04_scaling()
print("\nDone.")
