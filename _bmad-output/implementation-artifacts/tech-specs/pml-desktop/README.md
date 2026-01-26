# PML Desktop - Implementation Specs

**Parent Spec:** `../tech-spec-pml-desktop.md`

## Overview

PML Desktop découpé en 7 incréments livrables. Chaque incrément produit un livrable fonctionnel.

## Incréments

| # | Spec | Livrable | Tasks |
|---|------|----------|-------|
| 1 | [01-tauri-shell-setup.md](./01-tauri-shell-setup.md) | Tauri window qui compile | 4 |
| 2 | [02-webgpu-renderer.md](./02-webgpu-renderer.md) | Nodes + edges + zoom/pan | 5 |
| 3 | [03-rust-layout.md](./03-rust-layout.md) | Auto-positioning des nodes | 4 |
| 4 | [04-sliding-sidebar.md](./04-sliding-sidebar.md) | Sidebar ↔ graph sync | 4 |
| 5 | [05-terminal.md](./05-terminal.md) | Terminal xterm.js fonctionnel | 4 |
| 6 | [06-mcp-live-sync.md](./06-mcp-live-sync.md) | Tool calls → nodes animés | 5 |
| 7 | [07-pglite-persistence.md](./07-pglite-persistence.md) | Persistence complète | 4 |

**Total: 30 tasks**

## Dépendances

```
01-shell → 02-renderer → 03-layout → 04-sidebar → 05-terminal → 06-mcp-sync → 07-pglite
```

## Pour démarrer

```bash
# Increment 1
/bmad_bmm_quick-dev _bmad-output/implementation-artifacts/pml-desktop/01-tauri-shell-setup.md

# Puis incrément suivant...
/bmad_bmm_quick-dev _bmad-output/implementation-artifacts/pml-desktop/02-webgpu-renderer.md
```

## Stack

- **Shell:** Tauri v2
- **Frontend:** Preact + Signals
- **Rendering:** WebGPU (no fallback)
- **Terminal:** xterm.js + portable-pty
- **Graph DB:** casys_engine (Rust)
- **Metadata DB:** PGlite (WebView)
- **Validation:** AJV
- **MCP:** PML gateway (pas de parsing terminal)

## Layout Final

```
┌────────────────┬───────────────────────────────────┬─────────────────────┐
│  [Sidebar]     │        [Graph Viz - WebGPU]       │    [Terminal]       │
│  2-3 levels    │                                   │    xterm.js         │
│  sliding view  │    ┌─────────┐    ┌─────────┐    │                     │
│                │    │  node   │────│  node   │    │ $ claude --mcp      │
│ [..] parent    │    └─────────┘    └─────────┘    │ > Executing...      │
│ 📁 current     │         │                        │                     │
│   └─ child     │    ┌────┴────┐                   │ Tool: fs:read       │
│   └─ child     │    │  node   │                   │ → node created      │
│ 📁 sibling     │    └─────────┘                   │                     │
└────────────────┴───────────────────────────────────┴─────────────────────┘
```
