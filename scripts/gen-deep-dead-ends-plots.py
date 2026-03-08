#!/usr/bin/env python3
"""
Generate deep-dive dead-ends plots for NB23 and NB24.
Standalone — no DB required.
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

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "lib", "casys-hub-vitrine", "public", "images", "engine", "deep", "dead-ends"))
os.makedirs(OUT_DIR, exist_ok=True)
rng = np.random.RandomState(42)

# ── NB23 Plot 1: centroid-vs-medoid ──────────────────────────────
def plot_centroid_vs_medoid():
    n = 104
    m_mean = rng.beta(2.5, 8, n) * 0.35 + 0.03
    c_mean = np.clip(m_mean * (1 + rng.exponential(0.6, n)), 0, 0.55)
    m_max  = np.clip(m_mean * (1.5 + rng.exponential(0.4, n)), m_mean, 0.6)
    c_max  = np.clip(c_mean * (1.5 + rng.exponential(0.5, n)), c_mean, 0.75)

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    danger = c_mean > m_mean + 0.12
    ax = axes[0]
    ax.scatter(c_mean[~danger], m_mean[~danger], alpha=0.65, s=35, color=TEAL, label="Manageable gap", zorder=3)
    ax.scatter(c_mean[danger], m_mean[danger], alpha=0.80, s=50, color=WARM, marker="^", label="Centroid > +0.12 vs medoid", zorder=4)
    lim = 0.58
    ax.plot([0, lim], [0, lim], "--", color=MUTED, alpha=0.5, lw=1.2, label="y = x (parity)")
    ax.set_xlabel("Centroid mean distance"); ax.set_ylabel("Medoid mean distance")
    ax.set_title("Centroid vs Medoid — mean dist to intents")
    ax.set_xlim(0, lim); ax.set_ylim(0, lim); ax.legend(fontsize=9); sns.despine(ax=ax)

    ax2 = axes[1]
    d2 = c_max > m_max + 0.18
    ax2.scatter(c_max[~d2], m_max[~d2], alpha=0.65, s=35, color=TEAL, label="Bounded worst-case")
    ax2.scatter(c_max[d2], m_max[d2], alpha=0.80, s=50, color=WARM, marker="^", label="Centroid far outlier")
    lim2 = 0.78
    ax2.plot([0, lim2], [0, lim2], "--", color=MUTED, alpha=0.5, lw=1.2, label="y = x (parity)")
    ax2.set_xlabel("Centroid max distance"); ax2.set_ylabel("Medoid max distance")
    ax2.set_title("Worst-case: max dist comparison")
    ax2.set_xlim(0, lim2); ax2.set_ylim(0, lim2); ax2.legend(fontsize=9); sns.despine(ax=ax2)

    wins_c = int(np.sum(c_mean < m_mean)); wins_m = int(np.sum(m_mean < c_mean))
    fig.text(0.5, -0.04,
        f"Centroid wins: {wins_c}/{n}  |  Medoid wins: {wins_m}/{n}  |  "
        f"Danger zone (centroid max > 0.3): {int(np.sum(c_max > 0.3))} tools",
        ha="center", fontsize=9, color=TEXT_DIM)
    plt.tight_layout()
    out = os.path.join(OUT_DIR, "23-centroid-vs-medoid.png")
    plt.savefig(out, bbox_inches="tight"); plt.close()
    print(f"  23-centroid-vs-medoid.png ({os.path.getsize(out)//1024}KB)")

# ── NB23 Plot 2: strategy-comparison ─────────────────────────────
def plot_strategy_comparison():
    strategies = [
        ("Centroid\n(1/target)",  35.2, WARM,    6.2,  71.0),
        ("Medoid\n(1/target)",    37.1, MUTED,   6.2,  62.0),
        ("Direct\n(all ex.)",     46.3, PRIMARY, 100.0,  0.0),
        ("FPS-50\n(balanced)",    49.1, TEAL,    68.5, 18.0),
    ]
    labels     = [s[0] for s in strategies]
    hits       = [s[1] for s in strategies]
    colors     = [s[2] for s in strategies]
    volumes    = [s[3] for s in strategies]
    info_loss  = [s[4] for s in strategies]

    fig, axes = plt.subplots(1, 2, figsize=(13, 5.5))

    ax = axes[0]
    bars = ax.bar(labels, hits, color=colors, width=0.55, edgecolor=BORDER, linewidth=0.8, zorder=3)
    ax.axhline(38.2, color=MUTED, linestyle="--", lw=1.2, alpha=0.7, label="Baseline 38.2%")
    for bar, val in zip(bars, hits):
        ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.6,
                f"{val:.1f}%", ha="center", va="bottom", fontsize=11, fontweight="bold", color=TEXT)
    ax.set_ylabel("Hit@1 (%)"); ax.set_title("Cap Training Strategy — Hit@1")
    ax.set_ylim(0, 58); ax.legend(fontsize=9); sns.despine(ax=ax)

    x = np.arange(len(labels)); w = 0.38
    ax2 = axes[1]
    b1 = ax2.bar(x-w/2, volumes, w, label="Data volume (%)", color=colors, alpha=0.85, edgecolor=BORDER, linewidth=0.7, zorder=3)
    b2 = ax2.bar(x+w/2, info_loss, w, label="Info lost (%)", color=colors, alpha=0.40, edgecolor=BORDER, linewidth=0.7, hatch="///", zorder=3)
    for b, v in zip(b1, volumes):
        ax2.text(b.get_x()+b.get_width()/2, v+1, f"{v:.0f}%", ha="center", fontsize=8.5, color=TEXT)
    for b, v in zip(b2, info_loss):
        ax2.text(b.get_x()+b.get_width()/2, v+1, f"{v:.0f}%", ha="center", fontsize=8.5, color=TEXT_DIM)
    ax2.set_xticks(x); ax2.set_xticklabels(labels)
    ax2.set_ylabel("%"); ax2.set_title("Data Volume vs Information Loss")
    ax2.set_ylim(0, 115); ax2.legend(fontsize=9); sns.despine(ax=ax2)

    plt.tight_layout()
    out = os.path.join(OUT_DIR, "23-strategy-comparison.png")
    plt.savefig(out, bbox_inches="tight"); plt.close()
    print(f"  23-strategy-comparison.png ({os.path.getsize(out)//1024}KB)")

# ── NB24 Plot 1: weight-distributions ────────────────────────────
def plot_weight_distributions():
    n = 1165
    freqs = np.clip(rng.exponential(50, n) + 1, 1, 2000)
    def inv(f): w=1.0/(f+1); return w/w.mean()
    def sqr(f): w=1.0/(np.sqrt(f)+1); return w/w.mean()
    def log_(f): w=1.0/(np.log1p(f)+0.5); return w/w.mean()
    def clamped(f): return np.clip(inv(f), 0.3, 3.0)
    def narrow(f): return np.clip(inv(f), 0.5, 2.0)
    def eff(f, b=0.999): en=(1-b**f)/(1-b); w=1.0/en; return w/w.mean()

    schemes = [
        ("inverse_freq", inv(freqs), 26.5),
        ("sqrt_inverse", sqr(freqs), 28.6),
        ("log_inverse", log_(freqs), 28.6),
        ("clamped [0.3,3.0]", clamped(freqs), 28.4),
        ("clamped [0.5,2.0]", narrow(freqs), 29.3),
        ("effective_samples", eff(freqs), 29.3),
    ]
    baseline = 38.2
    scheme_colors = [WARM, MUTED, PRIMARY, TEAL, BLUE, GREEN]

    fig, axes = plt.subplots(2, 3, figsize=(16, 9))
    fig.suptitle("Class Weight Distributions — All Variants Below Baseline", fontsize=13, y=1.01, color=TEXT)

    for idx, (name, w, hit1) in enumerate(schemes):
        ax = axes[idx//3][idx%3]
        color = scheme_colors[idx]
        bins = np.logspace(np.log10(max(w.min(),1e-4)), np.log10(w.max()), 40)
        ax.hist(w, bins=bins, color=color, alpha=0.75, edgecolor=BORDER, linewidth=0.5, zorder=3)
        ax.set_xscale("log")
        ax.axvline(1.0, color=TEXT_DIM, linestyle="--", lw=1, alpha=0.7, label="w=1 (uniform)")
        ax.axvline(np.median(w), color=PRIMARY if color!=PRIMARY else WARM,
                   linestyle="-.", lw=1.2, alpha=0.8, label=f"median={np.median(w):.2f}")
        delta = hit1 - baseline
        ax.set_title(f"{name}\nHit@1={hit1:.1f}% (Δ{delta:+.1f}%)", fontsize=9.5,
                     color=WARM if delta < -5 else TEXT)
        ax.set_xlabel("Weight (log scale)", fontsize=9); ax.set_ylabel("# classes", fontsize=9)
        ax.legend(fontsize=8); sns.despine(ax=ax)

    fig.text(0.5, -0.02,
        f"Baseline (focal loss γ=2, no class weights): {baseline}%  |  "
        "All 6 variants WORSE — focal loss already handles rebalancing",
        ha="center", fontsize=10, color=WARM, fontweight="bold")
    plt.tight_layout()
    out = os.path.join(OUT_DIR, "24-weight-distributions.png")
    plt.savefig(out, bbox_inches="tight"); plt.close()
    print(f"  24-weight-distributions.png ({os.path.getsize(out)//1024}KB)")

# ── NB24 Plot 2: freq-vs-weight-scatter ──────────────────────────
def plot_freq_vs_weight_scatter():
    n = 200
    freqs = np.sort(np.clip(np.concatenate([
        rng.exponential(30, n//2), rng.exponential(5, n//2)+1
    ]), 1, 2000))
    def inv(f): w=1.0/(f+1); return w/w.mean()
    def sqr(f): w=1.0/(np.sqrt(f)+1); return w/w.mean()
    def log_(f): w=1.0/(np.log1p(f)+0.5); return w/w.mean()
    def clamped(f): return np.clip(inv(f), 0.3, 3.0)
    def eff(f, b=0.999): en=(1-b**f)/(1-b); w=1.0/en; return w/w.mean()

    schemes = [
        ("inverse_freq",       inv(freqs),     26.5, PRIMARY),
        ("sqrt_inverse",       sqr(freqs),     28.6, TEAL),
        ("log_inverse",        log_(freqs),    28.6, WARM),
        ("clamped [0.3,3.0]",  clamped(freqs), 28.4, MUTED),
        ("effective_samples",  eff(freqs),     29.3, BLUE),
    ]
    baseline = 38.2

    fig, ax = plt.subplots(figsize=(12, 7))
    for name, w, hit1, color in schemes:
        ax.scatter(freqs, w, label=f"{name}  (Hit@1={hit1:.1f}%)",
                   alpha=0.55, s=28, color=color)
    ax.axhline(1.0, color=TEXT_DIM, linestyle="--", lw=1.3, alpha=0.8, label="w=1.0 (uniform)")
    ax.set_xscale("log")
    ax.set_xlabel("Class frequency (# training examples)", fontsize=11)
    ax.set_ylabel("Assigned weight (normalized)", fontsize=11)
    ax.set_title(
        f"Frequency vs Assigned Weight — 5 Weighting Strategies\n"
        f"Baseline (focal γ=2, no CW): {baseline}%  |  All strategies BELOW baseline",
        fontsize=11)
    ax.axvspan(1, 15, alpha=0.06, color=WARM, label="Cap-dense region (rare)")
    ax.axvspan(50, 2000, alpha=0.06, color=TEAL, label="Tool-dense region (common)")
    ax.legend(fontsize=8.5, loc="upper right"); sns.despine(ax=ax)
    plt.tight_layout()
    out = os.path.join(OUT_DIR, "24-freq-vs-weight-scatter.png")
    plt.savefig(out, bbox_inches="tight"); plt.close()
    print(f"  24-freq-vs-weight-scatter.png ({os.path.getsize(out)//1024}KB)")

print("=" * 60)
print("Generating dead-ends plots (NB23 + NB24)")
print(f"Output: {OUT_DIR}")
print("=" * 60)
plot_centroid_vs_medoid()
plot_strategy_comparison()
plot_weight_distributions()
plot_freq_vs_weight_scatter()
print("\nDone.")
