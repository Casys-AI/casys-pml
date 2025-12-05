---
workflowName: 'work-to-blog'
targetModule: 'custom'
workflowType: 'document-workflow'
flowPattern: 'branching-linear'
date: 2025-12-05
user_name: Erwan
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
lastStep: 'review'
planApproved: true
buildComplete: true
workflowComplete: true
completedAt: 2025-12-05
associatedAgent: 'tech-blogger'
---

# Workflow Creation Plan: work-to-blog

**Created:** 2025-12-05
**Author:** Erwan
**Module:** custom
**Type:** content-generation

## Executive Summary

Workflow pour transformer le travail technique en cours (décisions techniques, spikes, découvertes) en articles de blog. Supporte deux formats de sortie : posts LinkedIn courts et articles détaillés. Déclenchement manuel. Les drafts sont sauvegardés dans `docs/blog/draft/`.

## Requirements Analysis

### Workflow Purpose

- **Problem to Solve**: Transformer le travail technique en cours (décisions techniques, spikes, découvertes) en articles de blog publiables
- **Primary Users**: Erwan (développeur/architecte)
- **Main Outcome**: Articles de blog (LinkedIn courts + articles détaillés)
- **Usage Frequency**: Manuel, à la demande

### Workflow Classification

- **Type**: Document Workflow (génération de contenu)
- **Flow Pattern**: Branching-linear (deux modes: Création / Transformation)
- **Interaction Style**: Conversationnel, collaboratif
- **Instruction Style**: Intent-based (flexible, adaptatif)
- **Autonomy Level**: Semi-autonome (choix utilisateur à chaque étape)

### Input Requirements

- **Required Inputs**:
  - Mode Création: Texte libre décrivant la découverte/décision OU chemin vers fichier existant
  - Mode Transformation: Chemin vers article existant
- **Optional Inputs**: Contexte additionnel, tags, audience cible
- **Prerequisites**: Aucun

### Output Specifications

- **Primary Output**: Fichier markdown dans `docs/blog/draft/`
- **Output Formats**:
  - Article détaillé: `YYYY-MM-DD-slug.md`
  - LinkedIn: `YYYY-MM-DD-slug.linkedin.md`
- **Languages**: Français / Anglais (choix à chaque génération)

### Workflow Modes

1. **Mode Création [C]**
   - Input: texte libre ou fichier
   - Choix format (LinkedIn / Article)
   - Choix langue (FR / EN)
   - Génération et sauvegarde

2. **Mode Transformation [T]**
   - Input: article existant
   - Choix format cible
   - Choix langue cible
   - Conversion et sauvegarde

### Technical Constraints

- **Dependencies**: Agent `tech-blogger` (à créer)
- **Integrations**: Système de fichiers local
- **Performance Requirements**: Génération rapide, pas de dépendances externes

### Target Location

- **Module**: custom
- **Folder Name**: work-to-blog
- **Target Path**: `{project-root}/bmad/custom/src/workflows/work-to-blog`
- **Output Path**: `docs/blog/draft/`

### Success Criteria

- **Quality Metrics**: Articles engageants, bien structurés, prêts à publier avec minimal editing
- **Success Indicators**: Draft généré dans le bon format et la bonne langue
- **User Satisfaction**: Capture fidèle de l'idée technique, ton approprié pour la plateforme cible

## Tool Requirements Summary

### Selected Tools

| Tool | Type | Status | Notes |
|------|------|--------|-------|
| `file-io` | LLM Feature | ✅ Requis | Lecture input, écriture output |
| `sub-agents` | LLM Feature | ✅ Requis | Invocation agent `tech-blogger` |
| `sidecar-file` | Memory | 📋 Optionnel | Persistance style/préférences |
| `image-gen` | MCP | 📋 V2 | Cover images (quand MCP dispo) |

### Installation Willingness
- Pas d'installation externe requise pour V1
- Prêt à ajouter MCP image generation pour V2

### Architecture Notes
- Step optionnel prévu pour cover image (désactivé V1)
- Agent `tech-blogger` à créer en parallèle

## Core Tools Configuration

### Workflows & Tasks

| Tool | Status | Integration Point |
|------|--------|-------------------|
| **Party-Mode** | ❌ Exclu | - |
| **Advanced Elicitation** | ✅ Inclus | Avant génération - affiner l'angle et le message clé |
| **Brainstorming** | ❌ Exclu | - |

### LLM Tool Features

| Tool | Status | Integration Point |
|------|--------|-------------------|
| **Web-Browsing** | ✅ Inclus | Pendant génération - enrichir avec sources/refs externes |
| **File I/O** | ✅ Inclus | Lecture input (fichiers), écriture output (drafts) |
| **Sub-Agents** | ✅ Inclus | Invocation agent `tech-blogger` pour génération |
| **Sub-Processes** | ❌ Exclu | - |

### Tool-Memory

| Tool | Status | Use Case |
|------|--------|----------|
| **Sidecar File** | ✅ Inclus | Persistance style/préférences utilisateur |

## Memory Configuration

### Memory Requirements

| Type | Status | Use Case |
|------|--------|----------|
| **Sidecar File** | ✅ Sélectionné | Persistance style + historique articles |
| **Vector Database** | ❌ Non requis | Overkill pour ce workflow |

### Sidecar Implementation

- **Fichier**: `work-to-blog.history.md`
- **Location**: Racine du workflow ou `docs/blog/`
- **Contenu**:
  - Style preferences (ton, emojis, structure)
  - Historique des articles générés
  - Langue par défaut
  - Stats d'utilisation

### Memory Management

- **Cleanup**: Manuel (l'utilisateur peut éditer le fichier)
- **Privacy**: Local uniquement, pas de données sensibles
- **Access**: Chargé au début du workflow, mis à jour à la fin

## External Tools Configuration

### V1 - Aucun MCP externe requis

| MCP | Status | Notes |
|-----|--------|-------|
| Context-7 | ❌ | Pas de docs API |
| Playwright | ❌ | Pas de browser automation |
| Git | ❌ | File-io suffit |
| Database | ❌ | Pas de DB |
| RAG-agent (Vector) | 📋 V2 | Recherche sémantique historique |
| Image Gen | 📋 V2 | Cover images |

### V2 Roadmap

- **Image Generation** : Quand MCP disponible (Replicate, DALL-E)
- **Vector DB** : Si besoin de recherche sémantique sur historique

## Final Tools Configuration Summary

### Tools Inventory

| Catégorie | Count | Outils |
|-----------|-------|--------|
| Core BMAD | 1 | Advanced Elicitation |
| LLM Features | 3 | File-io, Sub-agents, Web-browsing |
| Memory | 1 | Sidecar file |
| MCP externes | 0 | (V2: Image Gen, Vector DB) |
| **Total** | **5** | |

### Integration Strategy

- **User Experience** : Conversationnel, choix à chaque étape
- **Checkpoint Approach** : Elicitation avant génération pour affiner l'angle
- **Performance** : Léger, pas de dépendances externes
- **Installation** : Zéro setup requis

### Ready for Design ✅

## Detailed Design

### Workflow Structure (5 Steps)

| Step | Nom | But | Branching |
|------|-----|-----|-----------|
| 1 | init | Charger sidecar, choisir mode (Créer/Transformer) | → 2a ou 2b |
| 2a | input-create | Collecter input (texte libre ou fichier) | → 3 |
| 2b | input-transform | Sélectionner article existant à transformer | → 3 |
| 3 | configure | Choisir format + langue + affiner angle | → 4 |
| 4 | generate | Invoquer tech-blogger + web search | → 5 |
| 5 | finalize | Preview, révision, sauvegarde | → fin |

### Flow Diagram

```
[Init] → [C]réer → [Input-Create] → [Configure] → [Generate] → [Finalize]
       → [T]ransformer → [Input-Transform] ↗
```

### File Structure

```
bmad/custom/src/workflows/work-to-blog/
├── workflow.md
├── steps/
│   ├── step-01-init.md
│   ├── step-02a-input-create.md
│   ├── step-02b-input-transform.md
│   ├── step-03-configure.md
│   ├── step-04-generate.md
│   └── step-05-finalize.md
├── templates/
│   ├── article-template.md
│   └── linkedin-template.md
└── data/
    └── style-guide.md
```

### Interaction Pattern

- **Step 1**: Menu [C]/[T]
- **Step 2**: Input libre ou file picker
- **Step 3**: Menu [L]/[A] + [FR]/[EN] + option elicitation
- **Step 4**: Autonome (génération)
- **Step 5**: Menu [S]/[R]/[A] (Save/Revise/Another format)

### Data Flow

1. **Sidecar** → chargé au Step 1, mis à jour au Step 5
2. **Input** → collecté Step 2, passé à Step 4
3. **Config** → collectée Step 3, passée à Step 4
4. **Draft** → généré Step 4, reviewé/sauvé Step 5

### Output Location

- `docs/blog/draft/YYYY-MM-DD-slug.md` (Article)
- `docs/blog/draft/YYYY-MM-DD-slug.linkedin.md` (LinkedIn)

## Implementation Plan

[Implementation plan will be appended here from step 4]

## Review and Validation

[Review results will be appended here from step 5]

---

## Final Configuration

### Output Files to Generate

- TBD in design phase

### Target Location

- **Folder**: `{project-root}/bmad/custom/src/workflows/work-to-blog`
- **Module**: custom
- **Output Location**: `docs/blog/draft/`

### Final Checklist

- [x] Workflow name confirmed
- [x] Target module selected
- [ ] All requirements documented
- [ ] Workflow designed and approved
- [ ] Files generated successfully
- [ ] Workflow tested and validated

## Ready for Implementation

When you approve this plan, I'll generate all the workflow files in the specified location with the exact structure and content outlined above.
