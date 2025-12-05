# Tech-Spec: Blog Fresh pour inelligence.casys.ai

**Created:** 2025-12-05
**Status:** Ready for Development

## Overview

### Problem Statement

Le site inelligence.casys.ai (Fresh) n'a pas de blog. Les articles sont créés via le workflow `work-to-blog` mais restent en markdown sans être publiés sur le web.

### Solution

1. Implémenter un blog Fresh standard avec routes dynamiques
2. Adapter le workflow `work-to-blog` pour générer un frontmatter complet compatible

### Scope

**In:**
- Routes blog (liste + article individuel)
- Parser markdown avec frontmatter YAML
- Dossier `posts/` à la racine
- Modification du frontmatter dans work-to-blog
- Style basique (réutiliser le design existant)

**Out:**
- Commentaires
- Newsletter/subscription
- CMS admin
- Recherche full-text (v2)
- i18n multi-langue (v2)

## Context for Development

### Codebase Patterns

**Fresh routes existantes:**
```
src/web/routes/
├── index.tsx
└── dashboard.tsx
```

**Workflow work-to-blog:**
```
bmad/custom/src/workflows/work-to-blog/
├── workflow.md
├── steps/
│   ├── step-01-init.md
│   ├── step-02b-input-transform.md
│   ├── step-04-generate.md
│   └── step-05-finalize.md    ← Modifier ici
└── templates/
    ├── article-template.md
    └── linkedin-template.md
```

### Files to Reference

- `src/web/routes/index.tsx` - Pattern de route Fresh
- `bmad/custom/src/workflows/work-to-blog/steps/step-05-finalize.md` - Génération frontmatter actuel
- `docs/blog/draft/2025-12-05-worker-rpc-bridge-hidden-bug.linkedin.md` - Exemple frontmatter actuel

### Technical Decisions

1. **Dossier posts/** - Convention Fresh officielle, à la racine du projet web (`src/web/posts/` ou racine)
2. **gfm module** - Pour le rendu markdown (standard Deno)
3. **Frontmatter unifié** - Format YAML compatible Fresh + enrichi

## Implementation Plan

### Frontmatter Target

```yaml
---
title: "The Hidden Bug That Never Failed"
slug: worker-rpc-bridge-hidden-bug
date: 2025-12-05
category: engineering
tags:
  - typescript
  - debugging
  - deno
snippet: "The code worked perfectly. The tests passed. There was just one problem: it never actually worked."
format: linkedin
language: en
author: Erwan Lee Pesle
---
```

### Tasks

#### Part A: Fresh Blog Implementation

- [ ] Task 1: Créer `posts/` et déplacer un article test
- [ ] Task 2: Créer `src/web/utils/posts.ts` - fonctions getPosts(), getPost(slug)
- [ ] Task 3: Créer `src/web/routes/blog/index.tsx` - page liste des articles
- [ ] Task 4: Créer `src/web/routes/blog/[slug].tsx` - article individuel
- [ ] Task 5: Ajouter styles markdown (gfm CSS)

#### Part B: Intégration Site

- [ ] Task 6: Modifier header nav dans `index.tsx` - ajouter lien "Blog"
- [ ] Task 7: Ajouter section "Latest Posts" sur la landing (avant CTA)
- [ ] Task 8: Créer composant `BlogPreviewCard` pour preview articles

#### Part C: RSS & Automation

- [ ] Task 9: Créer `src/web/routes/blog/feed.xml.ts` - flux RSS Atom
- [ ] Task 10: Ajouter route `/blog/feed.xml` avec métadonnées (title, description, author)
- [ ] Task 11: Webhook endpoint `/api/blog/published` pour notifier Make.com (optionnel)

#### Part D: Workflow work-to-blog Modification

- [ ] Task 12: Modifier `step-05-finalize.md` - enrichir frontmatter avec category, tags, snippet
- [ ] Task 13: Ajouter prompt pour category/tags dans le flow de sauvegarde
- [ ] Task 14: Mettre à jour output folder vers `posts/` (publié) vs `docs/blog/draft/` (brouillon)

### Acceptance Criteria

- [ ] AC1: Articles markdown dans `posts/` sont listés sur `/blog`
- [ ] AC2: Clic sur un article → page `/blog/[slug]` avec contenu rendu
- [ ] AC3: Frontmatter parsé correctement (title, date, tags, snippet affichés)
- [ ] AC4: Lien "Blog" visible dans le menu header du site
- [ ] AC5: Landing page affiche preview des 3 derniers articles
- [ ] AC6: Flux RSS accessible sur `/blog/feed.xml` et valide
- [ ] AC7: Workflow work-to-blog génère le nouveau format frontmatter
- [ ] AC8: Articles existants peuvent être migrés (ajout manuel des champs manquants)

## Additional Context

### Dependencies

```json
{
  "imports": {
    "@std/front-matter": "jsr:@std/front-matter@^1",
    "$gfm": "https://deno.land/x/gfm@0.6.0/mod.ts"
  }
}
```

### Testing Strategy

- Test manuel: créer un article, vérifier rendu
- Vérifier parsing frontmatter avec différents formats
- Tester slug avec caractères spéciaux

### Notes

- Les articles draft restent dans `docs/blog/draft/` jusqu'à publication manuelle
- Migration articles existants: script optionnel ou manuel

### Automation Make.com (Post-MVP)

**Flow envisagé:**
1. Nouvel article publié dans `posts/`
2. RSS feed mis à jour automatiquement
3. Make.com poll le RSS ou reçoit webhook
4. Make.com publie sur LinkedIn avec le snippet + lien

**Option webhook:** Endpoint `/api/blog/published` appelé manuellement ou via git hook post-deploy

### Migration Articles Existants

Les articles actuels dans `docs/blog/` ont un format différent (pas de frontmatter YAML). Options:
1. Les migrer manuellement en ajoutant le frontmatter
2. Les laisser dans l'ancien dossier (archive)
3. Script de migration semi-automatique

---

**Recommandation:** Commencer par Part A (blog Fresh), tester avec 1-2 articles migrés manuellement, puis Part B (workflow).
