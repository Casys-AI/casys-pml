# Landing Page V2 - Overview

**Date:** 2026-02-05
**Source:** Brainstorming Session 2026-02-05
**Route:** `/v2` (nouvelle page, l'actuelle reste intacte)

---

## Positionnement

> **"The Gateway for the Conversational Web"**

**Attitude:** "Boring infrastructure" — sobre, fiable, essentiel. Pas de hype "IA intelligente".

---

## Mapping Fondamental

| Web Classique | Web Conversationnel |
|---------------|---------------------|
| Navigateur | Chat (Claude, ChatGPT, Gemini) |
| HTTP | MCP |
| Sites web | Workflows / MCP Apps |
| Gateway / CDN | **PML** |
| DNS | Registre de capacités |

---

## Personas

| Persona | Message clé |
|---------|-------------|
| **Décideur** | Observable, déterministe, self-hostable, human-in-the-loop |
| **Builder** | Tes MCPs, observables, partageables, sur ton infra |
| **Early Adopter** | Start building |

---

## Structure des Sections

| # | Section | Fichier Spec | Message |
|---|---------|--------------|---------|
| 1 | Hero | `01-hero.md` | Gateway + Your apps accessible |
| 2 | Problem | `02-problem.md` | Black box, no visibility |
| 3 | Solution | `03-solution.md` | See, validate, control |
| 4 | Catalog | `04-catalog.md` | Browse. Use. Or build your own. |
| 5 | QuickStart | `05-quickstart.md` | Get started in minutes |
| 6 | Blog | `06-blog.md` | Insights & Updates |
| 7 | CTA + Beta | `07-cta.md` | Start building |

---

## Route

**IMPORTANT :** Créer une nouvelle page sur `/v2`. L'actuelle (`/`) reste intacte.

```
GET /v2  →  Landing V2
```

---

## Architecture : Atomic Design

**Principes obligatoires :**

1. **Séparation Content / Structure**
   - `src/web/content/landing-v2.ts` → Tout le texte, aucun dans les composants
   - Composants = structure pure, reçoivent le contenu en props

2. **Hiérarchie Atomic Design**
   ```
   atoms/      → Éléments de base (Icon, Badge, Button)
   molecules/  → Combinaisons simples (IconWithLabel, CTAButton)
   organisms/  → Sections complètes (HeroSection, ProblemSection)
   ```

3. **Réutilisabilité**
   - Chaque composant doit être réutilisable avec des props différentes
   - Pas de contenu hardcodé dans les composants
   - Styles via classes Tailwind, pas de styles inline sauf exceptions

4. **Composants existants à réutiliser**
   - `MaterialIcon` → Icônes
   - `SectionLabel` → Labels de section
   - `TraceCarousel` → Visualisation Hero
   - Styles/animations existants

---

## Fichiers à Créer

```
src/web/
  content/
    landing-v2.ts                    # Nouveau contenu (obligatoire)

  routes/
    v2.tsx                           # Nouvelle route (obligatoire)

  components/
    landing-v2/
      sections/
        HeroSectionV2.tsx            # Adapté ou nouveau
        ProblemSection.tsx           # Nouveau
        SolutionSection.tsx          # Nouveau ou adapté de IsolationSection
        CatalogPreviewSectionV2.tsx  # Adapté
        QuickStartSectionV2.tsx      # Adapté
        BlogSectionV2.tsx            # Adapté
        BetaSignupSectionV2.tsx      # Adapté
        CTASectionV2.tsx             # Adapté
      index.ts                       # Barrel export
```

---

## Stratégie de Réutilisation

| Composant Existant | Action |
|--------------------|--------|
| `atoms/*` | Réutiliser tel quel |
| `molecules/*` | Réutiliser tel quel |
| `organisms/TraceCarousel` | Réutiliser tel quel |
| `sections/HeroSection` | Copier + modifier → `HeroSectionV2` |
| `sections/IsolationSection` | Adapter → `SolutionSection` |
| `sections/ArchitectureSection` | Ignorer, créer `ProblemSection` |
| `sections/IntelligenceSection` | Ne pas utiliser (supprimée) |
| Autres sections | Copier + modifier messaging |

---

## Différences vs Landing Actuelle

| Aspect | Actuel | V2 |
|--------|--------|-----|
| Eyebrow | "Procedural Memory for AI Agents" | "The Conversational Web Gateway" |
| Titre | "Your agent repeats itself..." | "The Gateway for the Conversational Web" |
| Pillars | Model-Agnostic, Traceability, Learns Patterns | Observable, Deterministic, Self-Hosted |
| IntelligenceSection | Présente | **Supprimée** (plus de "learns") |
| CTA | "Get Started" | "Start Building" |

---

## Meta & SEO

```typescript
export const meta = {
  title: "PML - The Gateway for the Conversational Web",
  description:
    "Your apps, accessible from any chat. Observable, deterministic, self-hosted. " +
    "Build workflows once, run them from Claude, ChatGPT, or your own interface.",
  ogImage: "https://pml.casys.ai/assets/og/home-v2.png",
};
```

---

## Vérification Finale

- [ ] Route `/v2` fonctionne
- [ ] Hero affiche le nouveau messaging
- [ ] Aucune mention de "intelligent" / "learns" / "smart"
- [ ] Flow : Gateway → Problem → Solution → Catalog → CTA
- [ ] Tous les CTAs : "Start Building"
- [ ] Pillars : Observable, Deterministic, Self-hosted
