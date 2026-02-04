# Epic: MCP Apps UI for lib/std

Ce dossier contient les tech-specs pour ajouter des UIs interactives aux tools de `@casys/mcp-std`.

## Structure

| # | Fichier | Status | Description |
|---|---------|--------|-------------|
| 00 | `00-infrastructure-audit.md` | ready-for-dev | Infrastructure + audit 48 modules + POC Table Viewer |
| 01 | `01-json-tree-viewer.md` | TODO | JSON Tree + JMESPath query builder |
| 02 | `02-diff-viewer.md` | TODO | Side-by-side diff viewer |
| 03 | `03-git-timeline.md` | TODO | Commit history + branch graph |
| 04 | `04-color-picker.md` | TODO | Color picker + palette visualizer |
| 05 | `05-docker-dashboard.md` | TODO | Container dashboard |
| 06 | `06-sysinfo-dashboard.md` | TODO | System metrics charts |

## Priorités

- **P0** (Specs 00-01): Infrastructure + database + json
- **P1** (Specs 02-04): diff, git, color
- **P2** (Specs 05-06): docker, sysinfo
- **P3**: Autres modules (specs à créer selon besoin)

## Ordre d'implémentation

1. `00-infrastructure-audit.md` - Pose les fondations (types, toMCPFormat, registerResource)
2. Les autres specs dépendent de 00 pour l'infrastructure

## Relation avec Epic 16

- **Epic 16** (`epic-16-mcp-apps-ui-orchestration.md`) couvre la **composition PML** (orchestrer plusieurs UIs ensemble)
- **Ce dossier** couvre l'ajout d'UIs aux **tools individuels** de lib/std
- Les deux sont complémentaires
