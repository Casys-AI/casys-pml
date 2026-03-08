#!/usr/bin/env python3
"""
Regenerate engine page plots with Casys Seaborn Theme.
Patches style blocks in notebooks, executes them, copies PNGs.

Usage:
    python3 scripts/regen-engine-plots.py --main       # hero plots only
    python3 scripts/regen-engine-plots.py --all         # everything
    python3 scripts/regen-engine-plots.py --nb 10 12    # specific notebooks
"""
import json
import shutil
import subprocess
import sys
import os
import argparse

NB_DIR = os.path.join(os.path.dirname(__file__), "..", "lib", "shgat-for-gru", "notebooks")
NB_DIR = os.path.abspath(NB_DIR)
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "lib", "casys-hub-vitrine", "public", "images", "engine")
OUT_DIR = os.path.abspath(OUT_DIR)

# ── Casys Seaborn Theme ─────────────────────────────
# Injected as first code cell (or replaces existing style cell)
CASYS_SEABORN_STYLE = r"""
import seaborn as sns
import matplotlib.pyplot as plt
import matplotlib as mpl
import warnings
warnings.filterwarnings('ignore', category=FutureWarning)

# Casys Seaborn Theme (MD3 purple palette)
sns.set_theme(
    style="whitegrid",
    font_scale=1.15,
    rc={
        'figure.facecolor': '#ffffff',
        'axes.facecolor':   '#faf1f6',
        'axes.edgecolor':   '#cfc3cd',
        'axes.labelcolor':  '#1e1a1e',
        'text.color':       '#1e1a1e',
        'xtick.color':      '#4d444c',
        'ytick.color':      '#4d444c',
        'grid.color':       '#e8dfe6',
        'grid.alpha':       0.6,
        'grid.linewidth':   0.5,
        'legend.facecolor': '#ffffff',
        'legend.edgecolor': '#cfc3cd',
        'legend.framealpha': 0.9,
        'savefig.facecolor': '#ffffff',
        'savefig.dpi':       200,
        'figure.dpi':        150,
        'font.family':       'sans-serif',
        'axes.spines.top':   False,
        'axes.spines.right': False,
    }
)

CASYS_PALETTE = ['#83468f', '#4ECDC4', '#82524c', '#988d97', '#60a5fa', '#4ade80']
sns.set_palette(CASYS_PALETTE)

# Semantic color names
PRIMARY  = '#83468f'
TEAL     = '#4ECDC4'
WARM     = '#82524c'
MUTED    = '#988d97'
BLUE     = '#60a5fa'
GREEN    = '#4ade80'
BG       = '#ffffff'
SURFACE  = '#faf1f6'
TEXT     = '#1e1a1e'
TEXT_DIM = '#7e747d'
BORDER   = '#cfc3cd'

# Legacy aliases (notebooks use these names)
ACCENT     = PRIMARY
RED        = WARM
GREY       = MUTED
PURPLE     = PRIMARY
CYAN       = TEAL
LIGHT_BLUE = BLUE
"""

# ── Notebooks and their output images ──────────────────
HERO_NOTEBOOKS = {
    "10-shgat-impact-analysis.ipynb": {
        "images": {
            "10-tsne-raw-vs-enriched.png": "tsne-before-after.png",
            "10-tsne-by-capability.png":   "tsne-by-capability.png",
        },
        "has_style_cells": True,
    },
    "12-preservedim-residual-analysis.ipynb": {
        "images": {
            "12-residual-sweep.png":       "residual-sweep.png",
            "12-pca-residual-comparison.png": "pca-residual.png",
        },
        "has_style_cells": True,
    },
    "16-ve-residual-impact-analysis.ipynb": {
        "images": {
            "16-gamma-vs-nchildren.png":   "gamma-adaptive.png",
        },
        "has_style_cells": True,
    },
    "07-shgat-graph-visualization.ipynb": {
        "images": {
            "07-degree-distributions.png": "graph-degree-dist.png",
        },
        "has_style_cells": False,
    },
    "01-mp-toy-problem.ipynb": {
        "images": {
            "mp-toy-results.png":          "mp-toy-contrastive.png",
        },
        "has_style_cells": False,
    },
}

# Keywords that identify a style/config cell to be replaced
STYLE_KEYWORDS = [
    "plt.style.use", "ACCENT =", "ACCENT=",
    "BLUE =", "BLUE=", "RED =", "RED=",
    "GREY =", "GREY=", "BG =", "BG=",
    "LIGHT_BLUE =", "GREEN =", "PURPLE =",
    "plt.rcParams.update", "'figure.facecolor'",
    "'axes.facecolor'", "'savefig.facecolor'",
    "dark_background", "set_theme",
]

# Color replacements in plotting cells (old amber/dark → new casys)
COLOR_REPLACEMENTS = {
    "'#FFB86F'": "PRIMARY",
    '"#FFB86F"': "PRIMARY",
    "'#ffb86f'": "PRIMARY",
    '"#ffb86f"': "PRIMARY",
    "'#6FA8FF'": "TEAL",
    '"#6FA8FF"': "TEAL",
    "'#6fa8ff'": "TEAL",
    '"#6fa8ff"': "TEAL",
    "'#c44e52'": "WARM",
    '"#c44e52"': "WARM",
    "'#4c72b0'": "BLUE",
    '"#4c72b0"': "BLUE",
    "'#55a868'": "GREEN",
    '"#55a868"': "GREEN",
    "'#08080a'": "TEXT",
    '"#08080a"': "TEXT",
    "'#666'": "MUTED",
    '"#666"': "MUTED",
    "edgecolor='#08080a'": "edgecolor=BORDER",
    'edgecolor="#08080a"': "edgecolor=BORDER",
    "edgecolor='white'":   "edgecolor=BG",
    'edgecolor="white"':   "edgecolor=BG",
}


def is_style_cell(src: str) -> bool:
    """Check if a code cell is a style/config cell."""
    return any(k in src for k in STYLE_KEYWORDS)


def strip_style_lines(src: str) -> str:
    """Remove style-related lines from a code cell, keep everything else."""
    lines = src.split("\n")
    kept = []
    in_rcparams = False
    for line in lines:
        stripped = line.strip()

        # Detect start of plt.rcParams.update({
        if "plt.rcParams.update" in line:
            in_rcparams = True
            continue

        # Skip lines inside rcParams dict
        if in_rcparams:
            if stripped == "})":
                in_rcparams = False
            continue

        # Skip individual style lines
        if any(k in line for k in [
            "plt.style.use", "set_theme",
            "ACCENT =", "ACCENT=",
            "BLUE =", "BLUE=", "RED =", "RED=",
            "GREY =", "GREY=", "BG =", "BG=",
            "LIGHT_BLUE =", "GREEN =", "PURPLE =",
            "CYAN =", "CYAN=",
        ]):
            continue

        kept.append(line)

    return "\n".join(kept)


def patch_notebook(nb_data: dict, has_style_cells: bool) -> int:
    """Patch notebook: inject Casys seaborn theme, strip old style lines."""
    patched = 0
    theme_injected = False

    for i, cell in enumerate(nb_data["cells"]):
        if cell["cell_type"] != "code":
            continue
        src = "".join(cell["source"]) if isinstance(cell["source"], list) else cell["source"]

        if has_style_cells and is_style_cell(src):
            # Strip style lines but KEEP imports, DB connections, etc.
            cleaned = strip_style_lines(src)

            if not theme_injected:
                # Prepend theme to cleaned cell content
                cell["source"] = CASYS_SEABORN_STYLE.strip() + "\n\n" + cleaned.strip()
                theme_injected = True
            else:
                cell["source"] = cleaned.strip() if cleaned.strip() else "pass"
            patched += 1

        # Replace hardcoded colors in all code cells
        new_src = "".join(cell["source"]) if isinstance(cell["source"], list) else cell["source"]
        for old, new in COLOR_REPLACEMENTS.items():
            new_src = new_src.replace(old, new)
        cell["source"] = new_src

    if not has_style_cells and not theme_injected:
        # Inject theme as new first code cell
        theme_cell = {
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": CASYS_SEABORN_STYLE.strip(),
        }
        # Insert after first markdown cell (title)
        insert_idx = 0
        for j, c in enumerate(nb_data["cells"]):
            if c["cell_type"] == "markdown":
                insert_idx = j + 1
                break
        nb_data["cells"].insert(insert_idx, theme_cell)
        patched += 1

    return patched


def execute_notebook(nb_path: str, out_name: str) -> bool:
    """Execute notebook and save executed version."""
    cmd = [
        sys.executable, "-m", "nbconvert",
        "--to", "notebook",
        "--execute",
        "--ExecutePreprocessor.timeout=300",
        "--ExecutePreprocessor.kernel_name=python3",
        "--output", out_name,
        nb_path,
    ]
    print(f"  Executing: {os.path.basename(nb_path)}")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=NB_DIR)
    if result.returncode != 0:
        # Show last 600 chars of stderr for debugging
        err = result.stderr[-600:] if len(result.stderr) > 600 else result.stderr
        print(f"  ERROR:\n{err}")
        return False
    print(f"  OK")
    return True


def copy_images(image_map: dict) -> int:
    """Copy generated PNGs to engine public dir."""
    os.makedirs(OUT_DIR, exist_ok=True)
    copied = 0
    for src_name, dst_name in image_map.items():
        src = os.path.join(NB_DIR, src_name)
        if os.path.exists(src):
            dst = os.path.join(OUT_DIR, dst_name)
            shutil.copy2(src, dst)
            size_kb = os.path.getsize(dst) // 1024
            print(f"  {src_name} → {dst_name} ({size_kb}KB)")
            copied += 1
        else:
            print(f"  MISSING: {src_name}")
    return copied


def process_notebook(nb_name: str, config: dict) -> bool:
    """Process a single notebook: patch, execute, copy images."""
    nb_path = os.path.join(NB_DIR, nb_name)
    if not os.path.exists(nb_path):
        print(f"\nSKIP: {nb_name} not found")
        return False

    print(f"\n── {nb_name} ──")

    # Read notebook
    with open(nb_path) as f:
        nb_data = json.load(f)

    # Patch style
    patched = patch_notebook(nb_data, config["has_style_cells"])
    print(f"  Patched {patched} cell(s)")

    # Write patched version
    patched_path = os.path.join(NB_DIR, f"_patched_{nb_name}")
    with open(patched_path, "w") as f:
        json.dump(nb_data, f)

    # Execute
    executed_name = f"_executed_{nb_name}"
    ok = execute_notebook(patched_path, executed_name)

    # Cleanup temp files
    for tmp in [patched_path, os.path.join(NB_DIR, executed_name)]:
        if os.path.exists(tmp):
            os.remove(tmp)

    if not ok:
        print(f"  FAILED — skipping image copy")
        return False

    return True


def main():
    parser = argparse.ArgumentParser(description="Regenerate engine plots with Casys Seaborn theme")
    parser.add_argument("--main", action="store_true", help="Hero plots only (NB-10,12,16,07,01)")
    parser.add_argument("--all", action="store_true", help="All notebooks")
    parser.add_argument("--nb", nargs="+", help="Specific notebook numbers (e.g. 10 12)")
    args = parser.parse_args()

    if not any([args.main, args.all, args.nb]):
        args.main = True

    # Determine which notebooks to process
    if args.main or args.all:
        targets = HERO_NOTEBOOKS
    elif args.nb:
        targets = {}
        for nb_num in args.nb:
            for name, config in HERO_NOTEBOOKS.items():
                if name.startswith(f"{nb_num.zfill(2)}-"):
                    targets[name] = config
                    break
            else:
                print(f"WARNING: No notebook matching number {nb_num}")

    print("=" * 60)
    print("Regenerating engine plots — Casys Seaborn Theme")
    print("=" * 60)

    all_images = {}
    for nb_name, config in targets.items():
        ok = process_notebook(nb_name, config)
        if ok:
            all_images.update(config["images"])

    print(f"\n── Copying images ──")
    n = copy_images(all_images)
    total = sum(len(c["images"]) for c in targets.values())
    print(f"\n{'=' * 60}")
    print(f"Done: {n}/{total} images copied to {OUT_DIR}")


if __name__ == "__main__":
    main()
