# Refonte Landing Page Casys.ai - Applied AI Research

**Date**: 2025-11-15 (Updated from 2025-11-12)
**Auteur**: Erwzn
**Objectif**: Adapter le site vitrine pour positionnement "Applied AI Research" multi-projets
**Base**: Story de positionnement créée le 2025-11-15 ([story-2025-11-11.md](./story-2025-11-11.md))

---

## Table des Matières

1. [Vision & Positionnement](#1-vision--positionnement)
2. [Sections du Site](#2-sections-du-site)
3. [Contenus Détaillés par Section](#3-contenus-détaillés-par-section)
4. [Design & Styling Guidelines](#4-design--styling-guidelines)
5. [Implémentation Technique](#5-implémentation-technique)

---

## 1. Vision & Positionnement

### Ancien Positionnement (remplacé)
- **V1**: "CASYS - Automated Linking Platform" (SEO-focused)
- **V2**: "Context Management pour Systèmes Agentiques" (AgentsCards-focused)

### Nouveau Positionnement
- **Identité**: Casys - Applied AI Research
- **Promesse**: "We explore AI architectures, build open-source tools, and share what we learn"
- **Cible**: CTOs, Tech Leads, Researchers, Developers (multi-domain AI)
- **Business Model**: Hybrid - Open Source (MIT) + Consulting + Research

### Projets
- **Active**: Casys MCP Gateway, CasysDB
- **Archived**: Living Content Ecosystem, Solo RPG

### Voix de la Marque
- ✅ Direct, factuel, no bullshit
- ✅ Curious & exploratory (research lab vibe)
- ✅ Multi-domain (not locked into one buzzword)
- ✅ Humble about expertise (10+ years = fact, not brag)
- ✅ Practical (we ship production systems)
- ✅ Open (MIT license, share research)
- ❌ Pas de hype ("revolutionary", "game-changing")
- ❌ Pas de single-focus ("we only do agents")
- ❌ Pas de corporate pompousness

---

## 2. Sections du Site

### Structure Proposée

| Section Actuelle | Section Nouvelle | Action | Priorité |
|------------------|------------------|--------|----------|
| Hero | Hero | 🔄 Adapter | P0 |
| SegmentSelector | — | ❌ Supprimer | P0 |
| WhatWeDo | WhatWeDo | 🔄 Adapter | P0 |
| WhyAgentsCards | Projects | 🔄 Remplacer | P0 |
| WhyCasysAI | WhyCasys | 🔄 Adapter | P0 |
| WorkWithUs | WorkWithUs | ✏️ Adapter | P0 |
| SocialProof | SocialProof | ✏️ Adapter | P1 |
| Pricing | — | ❌ Supprimer | P1 |
| FAQ | FAQ | 🔄 Adapter | P1 |
| WorksWith | — | ❌ Supprimer | P2 |
| Contact | Contact | ✅ Garder | P2 |
| FinalCta | FinalCta | ✏️ Adapter | P2 |

**Changements clés vs version précédente:**
- ❌ **Supprimer Pricing** - Pas de pricing AgentsCards (freemium pas encore lancé)
- ❌ **Supprimer WorksWith** - Pas de focus sur MCP servers logos
- 🔄 **Projects** remplace WhyAgentsCards - Section dédiée à tous les projets
- ✏️ **WhatWeDo** - Focus Research/Open Source/Consulting (pas Product first)

---

## 3. Contenus Détaillés par Section

### 3.1 Hero Section

**Objectif**: Communiquer immédiatement le positionnement "Applied AI Research"

#### Contenu EN (Primaire)

```yaml
title: "Applied AI Research"
titleHighlight: "" # Pas de highlight, sobre
subtitle: "We explore AI architectures, build open-source tools, and share what we learn."

# Trust Badge / Sub-subtitle
trustBadge: "Current projects: MCP Gateway • CasysDB • Research archive"
secondaryBadge: "10+ years: Knowledge Management → Graph DBs → Agentic Systems"

# CTAs
primaryCTA:
  text: "Explore Projects"
  url: "#projects"
  icon: "rocket_launch"

secondaryCTAs:
  - text: "Consulting"
    url: "#consulting"
    icon: "engineering"
  - text: "Follow Research"
    url: "#research"
    icon: "article"

# Preview Items (3 key messages)
previewItems:
  - "Multi-domain expertise (not locked into one buzzword)"
  - "All MIT licensed, consulting optional"
  - "Practical research that ships in production"
```

#### Contenu FR (Secondaire)

```yaml
title: "Applied AI Research"
titleHighlight: ""
subtitle: "On explore les architectures AI, on build des outils open-source, on partage ce qu'on apprend."

trustBadge: "Projets actuels : MCP Gateway • CasysDB • Archive de recherche"
secondaryBadge: "10+ ans : Knowledge Management → Graph DBs → Systèmes Agentiques"

primaryCTA:
  text: "Explorer Projets"
  url: "#projects"
  icon: "rocket_launch"

secondaryCTAs:
  - text: "Consulting"
    url: "#consulting"
    icon: "engineering"
  - text: "Suivre Recherche"
    url: "#research"
    icon: "article"

previewItems:
  - "Expertise multi-domaine (pas locked sur un buzzword)"
  - "Tout en MIT, consulting optionnel"
  - "Recherche pratique qui ship en production"
```

#### Notes d'Implémentation
- **SUPPRIMER**: SegmentSelector (teams/agencies) - plus besoin
- **SUPPRIMER**: Email newsletter form (si présent)
- **SIMPLE**: 1 CTA principal + 2 secondaires (pas 3 équivalents)
- **Sobre**: Pas de gradient text sauf si vraiment besoin d'accentuer
- **Layout**: Hero simple, direct, pas de carousel ou tabs

---

### 3.2 WhatWeDo Section
**Objectif**: Présenter les 3 piliers Research / Open Source / Consulting
**Layout**: 3 colonnes horizontales (cards)

#### Contenu EN

```yaml
section:
  title: "What We Do"
  subtitle: "Applied AI research combining exploration, open source, and consulting"

cards:
  - id: "research"
    icon: "school"
    iconColor: "primary"
    title: "Research & Exploration"
    subtitle: "Multi-domain AI architectures"
    description: "We investigate interesting problems across AI domains. From knowledge management (2013+) to modern agentic systems."

    areas:
      - icon: "storage"
        text: "Knowledge Management"
        detail: "10+ years building KM systems, graphs, semantic search"
      - icon: "hub"
        text: "Agentic Systems"
        detail: "Context optimization, orchestration, multi-agent architectures"
      - icon: "language"
        text: "Content Intelligence"
        detail: "Graph-based content systems, automated relationships"
      - icon: "database"
        text: "Database Systems"
        detail: "Embedded graphs, MVCC, time travel"

    philosophy:
      - "Depth over breadth - but not afraid to explore"
      - "Open research - we publish what we learn"
      - "Practical - ships in production systems"

    cta:
      text: "See Research Areas"
      url: "#research"
      icon: "arrow_forward"

  - id: "opensource"
    icon: "code"
    iconColor: "secondary"
    title: "Open Source Projects"
    subtitle: "MIT licensed tools solving real problems"
    description: "We build tools and share them openly. You can use them, read them, modify them, learn from them."

    projects:
      - name: "Casys MCP Gateway"
        description: "Context management for AI agents"
        tech: "Deno, TypeScript, SQLite"
        status: "Active - Epic 3"
        url: "https://github.com/casys-ai/mcp-gateway"

      - name: "CasysDB"
        description: "Embedded graph database with branches"
        tech: "Rust, Python, TypeScript"
        status: "Active Development"
        url: "https://github.com/casysai/casysdb"

    approach:
      - "All MIT licensed"
      - "Production-ready, not just prototypes"
      - "Consulting optional - tools are free"

    cta:
      text: "Explore Projects"
      url: "#projects"
      icon: "rocket_launch"

  - id: "consulting"
    icon: "engineering"
    iconColor: "tertiary"
    title: "Consulting & Knowledge Sharing"
    subtitle: "Hands-on help for AI architectures"
    description: "We help teams who need expertise in our research areas. Direct access to people who build the tools."

    services:
      - icon: "architecture"
        text: "Architecture & Strategy"
        detail: "Review, design, bottleneck analysis"
      - icon: "integration_instructions"
        text: "Implementation & Deployment"
        detail: "Custom integrations, production deployment"
      - icon: "school"
        text: "Training & Workshops"
        detail: "Hands-on programs, team onboarding"

    approach:
      - "€800-1,200/day (mid-market accessible)"
      - "No minimum engagement"
      - "Fast iteration, no bureaucracy"
      - "Direct access to builders, not account managers"

    knowledgeSharing:
      - "Publications (LinkedIn, blog)"
      - "Workshops (Alegria Group)"
      - "Community talks (French Tech Taiwan)"

    cta:
      text: "Book a Call"
      url: "#contact"
      icon: "calendar_today"
```

#### Contenu FR

```yaml
section:
  title: "Ce qu'on Fait"
  subtitle: "Recherche AI appliquée combinant exploration, open source et consulting"

cards:
  - id: "research"
    icon: "school"
    iconColor: "primary"
    title: "Research & Exploration"
    subtitle: "Architectures AI multi-domaines"
    description: "On investigue des problèmes intéressants à travers les domaines AI. De knowledge management (2013+) aux systèmes agentiques modernes."

    areas:
      - icon: "storage"
        text: "Knowledge Management"
        detail: "10+ ans à build systèmes KM, graphs, semantic search"
      - icon: "hub"
        text: "Systèmes Agentiques"
        detail: "Context optimization, orchestration, architectures multi-agents"
      - icon: "language"
        text: "Content Intelligence"
        detail: "Systèmes content graph-based, relations automatisées"
      - icon: "database"
        text: "Systèmes Database"
        detail: "Embedded graphs, MVCC, time travel"

    philosophy:
      - "Profondeur > largeur - mais pas peur d'explorer"
      - "Recherche ouverte - on publie ce qu'on apprend"
      - "Pratique - ship en production"

    cta:
      text: "Voir Domaines Recherche"
      url: "#research"
      icon: "arrow_forward"

  - id: "opensource"
    icon: "code"
    iconColor: "secondary"
    title: "Projets Open Source"
    subtitle: "Outils MIT licensed résolvant vrais problèmes"
    description: "On build des outils et on les partage ouvertement. Vous pouvez les utiliser, les lire, les modifier, apprendre d'eux."

    projects:
      - name: "Casys MCP Gateway"
        description: "Context management pour agents AI"
        tech: "Deno, TypeScript, SQLite"
        status: "Actif - Epic 3"
        url: "https://github.com/casys-ai/mcp-gateway"

      - name: "CasysDB"
        description: "Graph database embedded avec branches"
        tech: "Rust, Python, TypeScript"
        status: "Développement Actif"
        url: "https://github.com/casysai/casysdb"

    approach:
      - "Tout en MIT licensed"
      - "Production-ready, pas juste prototypes"
      - "Consulting optionnel - outils gratuits"

    cta:
      text: "Explorer Projets"
      url: "#projects"
      icon: "rocket_launch"

  - id: "consulting"
    icon: "engineering"
    iconColor: "tertiary"
    title: "Consulting & Partage Connaissances"
    subtitle: "Aide hands-on pour architectures AI"
    description: "On aide les équipes qui ont besoin d'expertise dans nos domaines de recherche. Accès direct aux gens qui build les outils."

    services:
      - icon: "architecture"
        text: "Architecture & Strategy"
        detail: "Review, design, analyse bottlenecks"
      - icon: "integration_instructions"
        text: "Implémentation & Déploiement"
        detail: "Intégrations custom, déploiement production"
      - icon: "school"
        text: "Formations & Workshops"
        detail: "Programmes hands-on, onboarding équipe"

    approach:
      - "€800-1,200/jour (mid-market accessible)"
      - "Pas d'engagement minimum"
      - "Itération rapide, pas de bureaucratie"
      - "Accès direct aux builders, pas account managers"

    knowledgeSharing:
      - "Publications (LinkedIn, blog)"
      - "Workshops (Alegria Group)"
      - "Talks community (French Tech Taiwan)"

    cta:
      text: "Réserver Appel"
      url: "#contact"
      icon: "calendar_today"
```

#### Notes d'Implémentation
- **Layout**: Grid 3 colonnes desktop, stack mobile
- **Cards**: `.card-elevated` avec hover states
- **Icons**: Material Icons avec couleurs brand
- **CTAs**: Outline style, pas de gradient
- **Focus**: Research first (pas Product first comme avant)

---

### 3.3 Projects Section
**Remplace**: WhyAgentsCards
**Objectif**: Présenter tous les projets (actifs + archived)

#### Contenu EN

```yaml
section:
  title: "Our Projects"
  subtitle: "Open-source tools exploring different facets of AI systems"

# Active Projects
activeProjects:
  - id: "mcp-gateway"
    name: "Casys MCP Gateway"
    tagline: "Context Intelligence for AI Agents"
    status: "Active - Epic 3 in progress"
    license: "MIT Open Source"

    problem:
      title: "The Problem"
      items:
        - "30-50% of LLM context wasted on MCP schemas"
        - "Sequential execution causes 5x latency cascade"
        - "Maximum 7-8 MCP servers before overflow"

    solution:
      title: "Our Solution"
      features:
        - icon: "psychology"
          name: "Context Optimization"
          description: "Vector search for on-demand tool loading (30-50% → <5%)"

        - icon: "account_tree"
          name: "DAG Execution"
          description: "Intelligent parallelization (5x latency reduction)"

        - icon: "storage"
          name: "SQLite-First"
          description: "Zero-infrastructure, portable, edge-ready"

    results:
      - stat: "15+"
        label: "MCP servers supported"
        comparison: "vs 7-8 currently"

      - stat: "90%"
        label: "Context recovered"
        comparison: "vs 50-70% naive loading"

      - stat: "5x"
        label: "Faster workflows"
        comparison: "Parallel vs sequential"

    tech:
      stack: "Deno, TypeScript, SQLite, sqlite-vec"

    links:
      github: "https://github.com/casys-ai/mcp-gateway"
      docs: "#"

  - id: "casysdb"
    name: "CasysDB"
    tagline: "Your Data, Naturally Connected"
    status: "Active Development"
    license: "MIT Open Source"

    problem:
      title: "The Problem"
      items:
        - "Graph databases require server management (Neo4j, ArangoDB)"
        - "SQL databases aren't optimized for graph queries"
        - "No embedded solution with MVCC + time travel"

    solution:
      title: "Our Solution"
      features:
        - icon: "flash_on"
          name: "Embedded"
          description: "Zero servers, runs in your process (like SQLite)"

        - icon: "language"
          name: "ISO GQL"
          description: "Standard graph query language"

        - icon: "refresh"
          name: "MVCC + PITR"
          description: "Isolated transactions + Point-in-Time Recovery"

        - icon: "account_tree"
          name: "Git-like Branches"
          description: "Test changes safely, branch from any commit"

    useCases:
      - "Knowledge graphs for RAG systems"
      - "Social networks and recommendations"
      - "Network analysis and fraud detection"
      - "Semantic search and ontologies"

    tech:
      stack: "Rust engine, Python/TypeScript bindings, zero dependencies"

    links:
      website: "https://y-wheat-rho-70.vercel.app/"
      github: "https://github.com/casysai/casysdb"
      docs: "https://y-wheat-rho-70.vercel.app/docs/getting-started/installation/"

# Research Archive
archivedProjects:
  - id: "living-content"
    name: "Living Content Ecosystem"
    tagline: "SEO & Content Intelligence (2023-2024)"
    status: "Archived - Research continues in MCP Gateway"

    description: "Research project exploring graph-based content systems, automated relationships, knowledge graph generation. Foundation for current context management work."

    learnings:
      - "Graph-based content relationship mapping"
      - "Automated context extraction"
      - "Knowledge graph generation from content"
      - "Informed current MCP Gateway architecture"

  - id: "solo-rpg"
    name: "Solo RPG"
    tagline: "Dynamic Narrative Systems (Experimental)"
    status: "Experimental articles"

    description: "Exploring AI-driven storytelling and narrative generation through LinkedIn article series. Experimental narrative mechanics and dynamic story evolution."

    links:
      articles: "#"
```

#### Contenu FR

```yaml
section:
  title: "Nos Projets"
  subtitle: "Outils open-source explorant différentes facettes des systèmes AI"

activeProjects:
  - id: "mcp-gateway"
    name: "Casys MCP Gateway"
    tagline: "Context Intelligence pour Agents AI"
    status: "Actif - Epic 3 en cours"
    license: "MIT Open Source"

    problem:
      title: "Le Problème"
      items:
        - "30-50% du contexte LLM gaspillé sur schemas MCP"
        - "Exécution séquentielle cause cascade latence 5x"
        - "Maximum 7-8 MCP servers avant overflow"

    solution:
      title: "Notre Solution"
      features:
        - icon: "psychology"
          name: "Context Optimization"
          description: "Vector search pour chargement on-demand (30-50% → <5%)"

        - icon: "account_tree"
          name: "Exécution DAG"
          description: "Parallélisation intelligente (réduction latence 5x)"

        - icon: "storage"
          name: "SQLite-First"
          description: "Zero-infrastructure, portable, edge-ready"

    results:
      - stat: "15+"
        label: "MCP servers supportés"
        comparison: "vs 7-8 actuellement"

      - stat: "90%"
        label: "Contexte récupéré"
        comparison: "vs 50-70% chargement naïf"

      - stat: "5x"
        label: "Workflows plus rapides"
        comparison: "Parallèle vs séquentiel"

    tech:
      stack: "Deno, TypeScript, SQLite, sqlite-vec"

    links:
      github: "https://github.com/casys-ai/mcp-gateway"
      docs: "#"

  - id: "casysdb"
    name: "CasysDB"
    tagline: "Vos Données, Naturellement Connectées"
    status: "Développement Actif"
    license: "MIT Open Source"

    problem:
      title: "Le Problème"
      items:
        - "Graph databases nécessitent gestion serveur (Neo4j, ArangoDB)"
        - "Bases SQL pas optimisées pour queries graph"
        - "Pas de solution embedded avec MVCC + time travel"

    solution:
      title: "Notre Solution"
      features:
        - icon: "flash_on"
          name: "Embedded"
          description: "Zero serveurs, tourne dans votre process (comme SQLite)"

        - icon: "language"
          name: "ISO GQL"
          description: "Langage graph query standard"

        - icon: "refresh"
          name: "MVCC + PITR"
          description: "Transactions isolées + Point-in-Time Recovery"

        - icon: "account_tree"
          name: "Branches Git-like"
          description: "Tester changements safely, brancher depuis n'importe quel commit"

    useCases:
      - "Knowledge graphs pour systèmes RAG"
      - "Réseaux sociaux et recommandations"
      - "Analyse réseau et détection fraude"
      - "Semantic search et ontologies"

    tech:
      stack: "Moteur Rust, bindings Python/TypeScript, zero dépendances"

    links:
      website: "https://y-wheat-rho-70.vercel.app/"
      github: "https://github.com/casysai/casysdb"
      docs: "https://y-wheat-rho-70.vercel.app/docs/getting-started/installation/"

archivedProjects:
  - id: "living-content"
    name: "Living Content Ecosystem"
    tagline: "SEO & Content Intelligence (2023-2024)"
    status: "Archivé - Recherche continue dans MCP Gateway"

    description: "Projet recherche explorant systèmes content graph-based, relations automatisées, génération knowledge graph. Fondation pour travail actuel context management."

    learnings:
      - "Mapping relations content graph-based"
      - "Extraction contexte automatisée"
      - "Génération knowledge graph depuis content"
      - "Informé architecture actuelle MCP Gateway"

  - id: "solo-rpg"
    name: "Solo RPG"
    tagline: "Systèmes Narratifs Dynamiques (Expérimental)"
    status: "Articles expérimentaux"

    description: "Explorer storytelling AI-driven et génération narrative via série articles LinkedIn. Mécaniques narrative expérimentales et évolution story dynamique."

    links:
      articles: "#"
```

#### Notes d'Implémentation
- **Layout**:
  - Active Projects: Cards grandes avec screenshots/demos
  - Archived Projects: Cards plus petites, style "badge"
- **Visual**:
  - Status badges (Active/Archived)
  - License badges (MIT)
  - Tech stack tags
- **CTAs**: Links vers GitHub, docs, website
- **Stats**: Grandes et visibles pour active projects
- **Accordions**: Optionnel pour problem/solution details

---

### 3.4 WhyCasys Section
**Adapté de**: WhyCasysAI
**Objectif**: Différenciation multi-domaine

#### Contenu EN

```yaml
section:
  title: "Why Casys?"
  subtitle: "What makes us different from other AI labs and consultancies"

differentiation:
  - id: "multi-domain"
    icon: "hub"
    title: "Multi-Domain Expertise"
    description: "Most labs specialize in one area. We connect multiple domains for unique insights."

    evolution:
      - period: "2013-2018"
        focus: "Knowledge Management Systems"
      - period: "2018-2021"
        focus: "Graph Databases & Semantic Search"
      - period: "2021-2023"
        focus: "Content Intelligence & DAG Orchestration"
      - period: "2023-2025"
        focus: "Agentic Systems & Context Management"
      - period: "2025+"
        focus: "Multi-domain AI architectures"

    benefit: "Cross-pollination creates insights (e.g., Content → Context Management)"

  - id: "continuity"
    icon: "timeline"
    title: "10+ Years Continuity"
    description: "We're not AI newcomers riding the hype wave. Building knowledge systems since 2013."

    proof:
      - "10+ years track record"
      - "Evolved through multiple technology waves"
      - "Deep expertise, not surface-level hype"
      - "Each phase builds on the last - expertise compounds"

  - id: "opensource"
    icon: "code_blocks"
    title: "Open Source First"
    description: "Everything we build is MIT licensed. Tools are free, consulting is optional."

    philosophy:
      - "Share the research"
      - "Monetize the expertise (if needed)"
      - "You can use it, read it, modify it, learn from it"
      - "No vendor lock-in"

  - id: "practical"
    icon: "rocket_launch"
    title: "Practical Research"
    description: "We don't just write papers. We ship production systems that solve real problems."

    approach:
      - "Production-ready, not just prototypes"
      - "Battle-tested in real environments"
      - "We use our own tools"
      - "Research → Tool → Production → Lessons → Next Research"

  - id: "accessible"
    icon: "handshake"
    title: "Mid-Market Accessible"
    description: "No corporate overhead. Direct access to people who build the tools."

    pricing:
      - "€800-1,200/day (vs €2k-5k+ big consultancies)"
      - "No minimum engagement sizes"
      - "Fast iteration, transparent pricing"
      - "Direct access to builders, not account managers"

bottomLine:
  text: "We're a small lab with deep expertise across multiple AI domains. We build real tools, share what we learn, and help teams when needed."
  cta:
    text: "See If We're a Fit"
    url: "#contact"
    icon: "arrow_forward"
```

#### Contenu FR

```yaml
section:
  title: "Pourquoi Casys?"
  subtitle: "Ce qui nous rend différents des autres labs AI et consultances"

differentiation:
  - id: "multi-domain"
    icon: "hub"
    title: "Expertise Multi-Domaine"
    description: "La plupart des labs se spécialisent dans un domaine. On connecte plusieurs domaines pour insights uniques."

    evolution:
      - period: "2013-2018"
        focus: "Systèmes Knowledge Management"
      - period: "2018-2021"
        focus: "Graph Databases & Semantic Search"
      - period: "2021-2023"
        focus: "Content Intelligence & Orchestration DAG"
      - period: "2023-2025"
        focus: "Systèmes Agentiques & Context Management"
      - period: "2025+"
        focus: "Architectures AI multi-domaines"

    benefit: "Cross-pollination crée insights (ex: Content → Context Management)"

  - id: "continuity"
    icon: "timeline"
    title: "10+ Ans Continuité"
    description: "On n'est pas des newcomers AI qui surfent la hype. On build systèmes knowledge depuis 2013."

    proof:
      - "Track record 10+ ans"
      - "Évolué à travers multiples vagues technologiques"
      - "Expertise profonde, pas hype superficielle"
      - "Chaque phase build sur la dernière - expertise compound"

  - id: "opensource"
    icon: "code_blocks"
    title: "Open Source First"
    description: "Tout ce qu'on build est MIT licensed. Outils gratuits, consulting optionnel."

    philosophy:
      - "Partager la recherche"
      - "Monétiser l'expertise (si besoin)"
      - "Vous pouvez l'utiliser, le lire, le modifier, apprendre"
      - "Pas de vendor lock-in"

  - id: "practical"
    icon: "rocket_launch"
    title: "Recherche Pratique"
    description: "On n'écrit pas juste des papers. On ship systèmes production qui résolvent vrais problèmes."

    approach:
      - "Production-ready, pas juste prototypes"
      - "Battle-tested dans environnements réels"
      - "On utilise nos propres outils"
      - "Research → Tool → Production → Lessons → Next Research"

  - id: "accessible"
    icon: "handshake"
    title: "Mid-Market Accessible"
    description: "Pas de corporate overhead. Accès direct aux gens qui build les outils."

    pricing:
      - "€800-1,200/jour (vs €2k-5k+ grandes consultances)"
      - "Pas d'engagements minimums"
      - "Itération rapide, pricing transparent"
      - "Accès direct aux builders, pas account managers"

bottomLine:
  text: "On est un petit lab avec expertise profonde à travers plusieurs domaines AI. On build vrais outils, partage ce qu'on apprend, aide équipes si besoin."
  cta:
    text: "Voir Si On Matche"
    url: "#contact"
    icon: "arrow_forward"
```

#### Notes d'Implémentation
- **Layout**: 5 avantages en grid (2-3 colonnes desktop)
- **Timeline**: Visual timeline pour evolution 2013-2025
- **Icons**: Material Icons avec couleurs brand
- **Tone**: Factuel, humble, pas arrogant
- **Bottom line**: Callout box avec CTA

---

### 3.5 WorkWithUs Section
**Adapté**: Focus sur Tools / Consulting / Training / Follow
**Objectif**: 4 options claires (pas 3 tabs)

#### Contenu EN

```yaml
section:
  title: "Work With Us"
  subtitle: "Choose your level of engagement"

options:
  - id: "tools"
    icon: "code"
    title: "Use Our Open Source Tools"
    subtitle: "Free forever, MIT License"

    description: "Self-host, modify, contribute, learn. No consulting needed."

    projects:
      - name: "Casys MCP Gateway"
        url: "https://github.com/casys-ai/mcp-gateway"
      - name: "CasysDB"
        url: "https://github.com/casysai/casysdb"
      - name: "All future projects"
        url: "https://github.com/casys-ai"

    cta:
      text: "Explore on GitHub"
      url: "https://github.com/casys-ai"
      icon: "code"

  - id: "consulting"
    icon: "engineering"
    title: "Consulting Services"
    subtitle: "Hands-on help for your AI architecture"

    description: "Direct access to people who build the tools. €800-1,200/day, no minimum engagement."

    services:
      - "Architecture review & strategy"
      - "Context management for AI agents"
      - "Knowledge graph design"
      - "Agentic system implementation"
      - "Custom integrations"
      - "Team training"

    typical:
      - engagement: "Architecture Review"
        duration: "2-5 days"
        price: "€2k-6k"
      - engagement: "Implementation Project"
        duration: "2-4 weeks"
        price: "€15k-50k"
      - engagement: "Monthly Retainer"
        duration: "8 days/month"
        price: "€6k-10k/month"

    cta:
      text: "Book a Call"
      url: "#contact"
      icon: "calendar_today"

  - id: "training"
    icon: "school"
    title: "Training & Workshops"
    subtitle: "Level up your team"

    description: "Custom programs on agentic architecture, context management, knowledge graphs."

    programs:
      - name: "Agentic Architecture Workshop"
        duration: "2-3 days"
        audience: "CTOs, Tech Leads, Senior Engineers"

      - name: "Casys Tools Hands-On"
        duration: "1 day"
        audience: "Engineers, DevOps"

      - name: "Knowledge Graph Fundamentals"
        duration: "1/2 day"
        audience: "Product Managers, Engineers, Architects"

    delivery:
      - "On-site (Taiwan, Asia-Pacific)"
      - "Remote (worldwide)"
      - "Hybrid"

    partners:
      - "Alegria Group (regular workshops in Taiwan)"
      - "French Tech Taiwan (community events)"

    cta:
      text: "Request Training"
      url: "#contact"
      icon: "school"

  - id: "research"
    icon: "article"
    title: "Follow Our Research"
    subtitle: "Stay updated with our discoveries"

    description: "We publish what we learn. Project updates, technical discoveries, architecture patterns."

    channels:
      - platform: "LinkedIn"
        type: "Case studies, discoveries"
        url: "#"

      - platform: "Blog"
        type: "Technical deep-dives"
        url: "/blog"

      - platform: "GitHub"
        type: "Code, documentation"
        url: "https://github.com/casys-ai"

      - platform: "Talks"
        type: "Alegria, French Tech Taiwan"
        url: "#"

    cta:
      text: "Follow on LinkedIn"
      url: "#"
      icon: "link"
```

#### Contenu FR

```yaml
section:
  title: "Travailler Avec Nous"
  subtitle: "Choisissez votre niveau d'engagement"

options:
  - id: "tools"
    icon: "code"
    title: "Utiliser Nos Outils Open Source"
    subtitle: "Gratuit pour toujours, MIT License"

    description: "Auto-hébergez, modifiez, contribuez, apprenez. Pas besoin consulting."

    projects:
      - name: "Casys MCP Gateway"
        url: "https://github.com/casys-ai/mcp-gateway"
      - name: "CasysDB"
        url: "https://github.com/casysai/casysdb"
      - name: "Tous futurs projets"
        url: "https://github.com/casys-ai"

    cta:
      text: "Explorer sur GitHub"
      url: "https://github.com/casys-ai"
      icon: "code"

  - id: "consulting"
    icon: "engineering"
    title: "Services Consulting"
    subtitle: "Aide hands-on pour votre architecture AI"

    description: "Accès direct aux gens qui build les outils. €800-1,200/jour, pas engagement minimum."

    services:
      - "Architecture review & strategy"
      - "Context management pour agents AI"
      - "Design knowledge graph"
      - "Implémentation système agentique"
      - "Intégrations custom"
      - "Formation équipe"

    typical:
      - engagement: "Architecture Review"
        duration: "2-5 jours"
        price: "€2k-6k"
      - engagement: "Projet Implémentation"
        duration: "2-4 semaines"
        price: "€15k-50k"
      - engagement: "Retainer Mensuel"
        duration: "8 jours/mois"
        price: "€6k-10k/mois"

    cta:
      text: "Réserver Appel"
      url: "#contact"
      icon: "calendar_today"

  - id: "training"
    icon: "school"
    title: "Formations & Workshops"
    subtitle: "Level up votre équipe"

    description: "Programmes custom sur architecture agentique, context management, knowledge graphs."

    programs:
      - name: "Workshop Architecture Agentique"
        duration: "2-3 jours"
        audience: "CTOs, Tech Leads, Senior Engineers"

      - name: "Casys Tools Hands-On"
        duration: "1 jour"
        audience: "Engineers, DevOps"

      - name: "Fondamentaux Knowledge Graph"
        duration: "1/2 jour"
        audience: "Product Managers, Engineers, Architects"

    delivery:
      - "Sur site (Taiwan, Asia-Pacific)"
      - "Remote (worldwide)"
      - "Hybride"

    partners:
      - "Alegria Group (workshops réguliers Taiwan)"
      - "French Tech Taiwan (événements community)"

    cta:
      text: "Demander Formation"
      url: "#contact"
      icon: "school"

  - id: "research"
    icon: "article"
    title: "Suivre Notre Recherche"
    subtitle: "Rester à jour avec nos découvertes"

    description: "On publie ce qu'on apprend. Updates projets, découvertes techniques, patterns architecture."

    channels:
      - platform: "LinkedIn"
        type: "Case studies, découvertes"
        url: "#"

      - platform: "Blog"
        type: "Deep-dives techniques"
        url: "/blog"

      - platform: "GitHub"
        type: "Code, documentation"
        url: "https://github.com/casys-ai"

      - platform: "Talks"
        type: "Alegria, French Tech Taiwan"
        url: "#"

    cta:
      text: "Suivre sur LinkedIn"
      url: "#"
      icon: "link"
```

#### Notes d'Implémentation
- **Layout**: 4 options en grid (2x2 desktop, stack mobile)
- **Pas de tabs**: Tout visible en même temps (vs tabs precedent)
- **Cards**: `.card-elevated` avec icons
- **CTAs**: Primary CTA pour chaque option
- **Simple**: Pas de pricing tiers compliqués

---

### 3.6 SocialProof Section
**Adapté**: Building in public stats

#### Contenu EN

```yaml
section:
  title: "Building in Public"
  subtitle: "Progress and community"

stats:
  - icon: "code"
    stat: "2"
    label: "Active Projects"
    description: "MCP Gateway (Epic 3) + CasysDB"
    link:
      text: "Follow on GitHub"
      url: "https://github.com/casys-ai"

  - icon: "timeline"
    stat: "10+"
    label: "Years Experience"
    description: "Knowledge Management → Graph DBs → DAGs → Agents"
    link:
      text: "Read Our Story"
      url: "/about"

  - icon: "groups"
    stat: "MIT"
    label: "Open Source"
    description: "All projects freely available"
    link:
      text: "Explore Projects"
      url: "#projects"

  - icon: "public"
    stat: "French Tech"
    label: "Taiwan"
    description: "Active community member"
    link:
      text: "See Our Talks"
      url: "#"

# Testimonials placeholder
testimonials:
  note: "More testimonials coming as projects reach production users. Join our community to be part of the journey."
  cta:
    text: "Follow Our Progress"
    url: "https://github.com/casys-ai"
```

#### Contenu FR

```yaml
section:
  title: "Building in Public"
  subtitle: "Progrès et communauté"

stats:
  - icon: "code"
    stat: "2"
    label: "Projets Actifs"
    description: "MCP Gateway (Epic 3) + CasysDB"
    link:
      text: "Suivre sur GitHub"
      url: "https://github.com/casys-ai"

  - icon: "timeline"
    stat: "10+"
    label: "Ans d'Expérience"
    description: "Knowledge Management → Graph DBs → DAGs → Agents"
    link:
      text: "Lire Notre Histoire"
      url: "/about"

  - icon: "groups"
    stat: "MIT"
    label: "Open Source"
    description: "Tous projets librement disponibles"
    link:
      text: "Explorer Projets"
      url: "#projects"

  - icon: "public"
    stat: "French Tech"
    label: "Taiwan"
    description: "Membre actif communauté"
    link:
      text: "Voir Nos Talks"
      url: "#"

testimonials:
  note: "Plus de testimonials à venir quand projets atteignent users production. Rejoignez notre communauté pour faire partie du voyage."
  cta:
    text: "Suivre Notre Progrès"
    url: "https://github.com/casys-ai"
```

#### Notes d'Implémentation
- **Simple**: 4 stat cards
- **Pas de testimonials**: Placeholder avec CTA
- **Links**: Chaque stat a un link vers plus d'info
- **Humble**: "Building in public" vibe, pas de bragging

---

### 3.7 FAQ Section
**Adapté**: Questions multi-projets

#### Contenu EN

```yaml
section:
  title: "Frequently Asked Questions"
  subtitle: "Everything you need to know about Casys"

faqs:
  # General
  - category: "General"
    q: "What is Casys?"
    a: "Casys is a research lab exploring AI architectures across multiple domains. We build open-source tools (MIT licensed), publish our research, and help teams when they need expertise."

  - category: "General"
    q: "What makes you different from other AI labs?"
    a: "Multi-domain expertise (not locked into one buzzword), 10+ years continuity, everything open source (MIT), practical research that ships in production, mid-market accessible consulting."

  - category: "General"
    q: "Who is Casys for?"
    a: "CTOs, tech leads, researchers, developers interested in AI systems, knowledge management, agentic architectures. Anyone who needs expertise in our research areas or wants to use our tools."

  # Projects
  - category: "Projects"
    q: "What projects do you have?"
    a: "Active: Casys MCP Gateway (context management for AI agents) and CasysDB (embedded graph database). Archived: Living Content Ecosystem, Solo RPG. All MIT licensed."

  - category: "Projects"
    q: "Can I use your tools for free?"
    a: "Yes. Everything is MIT licensed. You can self-host, modify, contribute, learn. Consulting is optional if you need help."

  - category: "Projects"
    q: "Do I need to use all your tools together?"
    a: "No. Each project solves a specific problem. Use what you need. MCP Gateway and CasysDB can be used independently or together."

  # Consulting
  - category: "Consulting"
    q: "What does consulting include?"
    a: "Architecture review, implementation help, context management for AI agents, knowledge graph design, system implementation, team training. €800-1,200/day, no minimum engagement."

  - category: "Consulting"
    q: "Can you help with topics outside your projects?"
    a: "Yes. Our expertise is broader than our projects. We consult on AI architecture, context management, knowledge graphs, agentic systems - whether or not you use our tools."

  - category: "Consulting"
    q: "Why €800-1,200/day vs cheaper alternatives?"
    a: "Direct access to people who build the tools. 10+ years expertise. No account managers or overhead. Mid-market accessible vs €2k-5k+ big consultancies."

  # Research
  - category: "Research"
    q: "Where do you publish research?"
    a: "LinkedIn articles, blog posts, GitHub documentation, community talks (Alegria Group, French Tech Taiwan). We share what we learn - discoveries, patterns, lessons."

  - category: "Research"
    q: "What are your research areas?"
    a: "Knowledge Management, Agentic Systems, Context Optimization, Graph Databases, DAG Architectures, Content Intelligence, Semantic Search. We explore what's interesting and useful."
```

#### Contenu FR

```yaml
section:
  title: "Questions Fréquentes"
  subtitle: "Tout ce qu'il faut savoir sur Casys"

faqs:
  # General
  - category: "Général"
    q: "C'est quoi Casys?"
    a: "Casys est un lab de recherche explorant architectures AI à travers plusieurs domaines. On build outils open-source (MIT licensed), publie notre recherche, aide équipes si besoin expertise."

  - category: "Général"
    q: "Ce qui vous rend différents des autres labs AI?"
    a: "Expertise multi-domaine (pas locked sur un buzzword), continuité 10+ ans, tout open source (MIT), recherche pratique qui ship en production, consulting mid-market accessible."

  - category: "Général"
    q: "Casys c'est pour qui?"
    a: "CTOs, tech leads, chercheurs, développeurs intéressés par systèmes AI, knowledge management, architectures agentiques. Quiconque a besoin expertise nos domaines ou veut utiliser nos outils."

  # Projects
  - category: "Projets"
    q: "Quels projets vous avez?"
    a: "Actifs: Casys MCP Gateway (context management pour agents AI) et CasysDB (graph database embedded). Archivés: Living Content Ecosystem, Solo RPG. Tout MIT licensed."

  - category: "Projets"
    q: "Je peux utiliser vos outils gratuitement?"
    a: "Oui. Tout est MIT licensed. Vous pouvez auto-héberger, modifier, contribuer, apprendre. Consulting optionnel si besoin aide."

  - category: "Projets"
    q: "Je dois utiliser tous vos outils ensemble?"
    a: "Non. Chaque projet résout problème spécifique. Utilisez ce dont vous avez besoin. MCP Gateway et CasysDB peuvent être utilisés indépendamment ou ensemble."

  # Consulting
  - category: "Consulting"
    q: "Qu'est-ce qui est inclus dans consulting?"
    a: "Architecture review, aide implémentation, context management pour agents AI, design knowledge graph, implémentation système, formation équipe. €800-1,200/jour, pas engagement minimum."

  - category: "Consulting"
    q: "Vous pouvez aider sur sujets hors vos projets?"
    a: "Oui. Notre expertise est plus large que nos projets. On consulte sur architecture AI, context management, knowledge graphs, systèmes agentiques - que vous utilisiez nos outils ou non."

  - category: "Consulting"
    q: "Pourquoi €800-1,200/jour vs alternatives moins chères?"
    a: "Accès direct aux gens qui build les outils. Expertise 10+ ans. Pas d'account managers ou overhead. Mid-market accessible vs €2k-5k+ grandes consultances."

  # Research
  - category: "Recherche"
    q: "Où vous publiez recherche?"
    a: "Articles LinkedIn, blog posts, documentation GitHub, talks community (Alegria Group, French Tech Taiwan). On partage ce qu'on apprend - découvertes, patterns, lessons."

  - category: "Recherche"
    q: "Quels sont vos domaines recherche?"
    a: "Knowledge Management, Systèmes Agentiques, Context Optimization, Graph Databases, Architectures DAG, Content Intelligence, Semantic Search. On explore ce qui est intéressant et utile."
```

#### Notes d'Implémentation
- **Categories**: General, Projects, Consulting, Research
- **Accordions**: Garder UI existante
- **Ordre**: General first, puis par catégorie
- **Tone**: Direct, factuel, helpful

---

### 3.8 Contact Section
**Action**: Garder (déjà bon)

Ajustements mineurs optionnels:
- Placeholder text: "I want to use your tools / get consulting help / request training / follow your research"

---

### 3.9 FinalCta Section
**Adapté**: Wording multi-projets

#### Contenu EN

```yaml
section:
  title: "Ready to Explore?"
  subtitle: "Choose your next step"

ctas:
  - icon: "code"
    text: "Explore Projects"
    subtext: "MIT licensed, free forever"
    url: "#projects"

  - icon: "engineering"
    text: "Get Consulting Help"
    subtext: "€800-1,200/day, no minimum"
    url: "#contact"

  - icon: "article"
    text: "Follow Our Research"
    subtext: "Stay updated with discoveries"
    url: "https://github.com/casys-ai"

trustBadges:
  - icon: "check_circle"
    text: "10+ years expertise"

  - icon: "check_circle"
    text: "All MIT open source"

  - icon: "check_circle"
    text: "Mid-market accessible"
```

#### Contenu FR

```yaml
section:
  title: "Prêt à Explorer?"
  subtitle: "Choisissez votre prochaine étape"

ctas:
  - icon: "code"
    text: "Explorer Projets"
    subtext: "MIT licensed, gratuit pour toujours"
    url: "#projects"

  - icon: "engineering"
    text: "Obtenir Aide Consulting"
    subtext: "€800-1,200/jour, pas minimum"
    url: "#contact"

  - icon: "article"
    text: "Suivre Notre Recherche"
    subtext: "Rester à jour avec découvertes"
    url: "https://github.com/casys-ai"

trustBadges:
  - icon: "check_circle"
    text: "Expertise 10+ ans"

  - icon: "check_circle"
    text: "Tout MIT open source"

  - icon: "check_circle"
    text: "Mid-market accessible"
```

---

## 4. Design & Styling Guidelines

### 4.1 Conserver Design System Existant (AUCUN CHANGEMENT)

✅ **GARDER EXACTEMENT tel quel**:
- Material 3 Expressive (adapté par Casys AI)
- Tokens M3 auto-générés depuis `#dbbddb`
- Architecture 2-tiers: M3 Expressive base + tokens custom CASYS
- Utility classes existantes

### 4.2 Ajustements Styling

**Gradient Text:**
- Utiliser parcimonieusement (research lab vibe = sobre)
- Optionnel pour accentuer (pas systématique comme avant)

**Colors Semantic Usage:**
- Primary: Research, main CTAs
- Secondary: Open Source, projects
- Tertiary: Consulting, services
- Pas de "error" pour competitors (pas de section comparison)

**Typography:**
- Conserver M3 typescale
- Peut-être réduire font-weight pour ton plus sobre

### 4.3 Nouveaux Composants

**Project Card Component:**
```astro
<div class="project-card card-elevated">
  <div class="project-header">
    <h3>{name}</h3>
    <div class="badges">
      <span class="status-badge">{status}</span>
      <span class="license-badge">MIT</span>
    </div>
  </div>
  <p class="tagline">{tagline}</p>
  <div class="project-body">
    <!-- Problem/Solution/Results -->
  </div>
  <div class="project-footer">
    <!-- Links: GitHub, Docs, Website -->
  </div>
</div>
```

**Timeline Component (for WhyCasys):**
```astro
<div class="timeline">
  <div class="timeline-item" data-period="2013-2018">
    <div class="period">{period}</div>
    <div class="focus">{focus}</div>
  </div>
  <!-- ... -->
</div>
```

**Stat Card Component:**
```astro
<div class="stat-card card-elevated">
  <div class="stat-icon">
    <span class="material-symbols-rounded">{icon}</span>
  </div>
  <div class="stat-value">{stat}</div>
  <div class="stat-label">{label}</div>
  <p class="stat-description">{description}</p>
  <a class="stat-link" href="{url}">{linkText}</a>
</div>
```

---

## 5. Implémentation Technique

### 5.1 Ordre d'Implémentation

**Phase 1: Core Sections (P0)**
1. Hero - Nouveau messaging "Applied AI Research"
2. WhatWeDo - Research/Open Source/Consulting
3. Projects - Section dédiée tous projets
4. WhyCasys - Multi-domain differentiation
5. WorkWithUs - 4 options (Tools/Consulting/Training/Research)

**Phase 2: Supporting Sections (P1)**
6. SocialProof - Building in public stats
7. FAQ - Questions multi-projets

**Phase 3: Minor Adjustments (P2)**
8. Contact - Ajuster placeholder
9. FinalCta - Nouveau wording

### 5.2 Fichiers à Modifier

```
apps/casys-app/src/
├── pages/
│   └── index.astro                    # Modifier ordre sections
├── features/
│   └── landing-v2/                    # Ou créer landing-v3/
│       ├── Hero.astro                 # ADAPTER
│       ├── WhatWeDo.astro            # ADAPTER
│       ├── Projects.astro            # CRÉER (nouveau)
│       ├── WhyCasys.astro            # ADAPTER (was WhyCasysAI)
│       ├── WorkWithUs.astro          # ADAPTER
│       ├── SocialProof.astro         # ADAPTER
│       ├── FAQ.astro                 # ADAPTER
│       ├── Contact.astro             # GARDER
│       └── FinalCta.astro            # ADAPTER
```

### 5.3 Fichiers à Supprimer/Archiver

```
❌ Supprimer:
- SegmentSelector.astro
- Pricing.astro (freemium pas encore lancé)
- WorksWith.astro (pas de focus MCP logos)
- WhyAgentsCards.astro (remplacé par Projects)
```

### 5.4 Suppression i18n Segment-Aware

**Ancien système**:
- `content[locale][segment]`
- Event listener `segment-changed`

**Nouveau système**:
- Uniquement `content[locale]`
- Pas de segments
- Contenu statique par langue (EN/FR)

### 5.5 Assets

**Pas besoin de nouveaux logos** (MCP servers supprimés)

**Screenshots/Demos** (optionnel):
- MCP Gateway: Screenshot terminal ou dashboard
- CasysDB: Screenshot queries ou branches

---

## 6. Checklist de Validation

### Contenu
- [ ] Tous textes EN/FR rédigés
- [ ] Tone "research lab" respectée (no bullshit, curious, humble)
- [ ] Messaging aligné avec story multi-projets
- [ ] CTAs clairs (Explore/Consult/Follow)
- [ ] Pas de pricing tiers (freemium pas lancé)

### Design
- [ ] Design system M3 conservé
- [ ] Couleurs brand utilisées correctement
- [ ] Responsive mobile/tablet/desktop
- [ ] Dark mode fonctionne

### Technique
- [ ] SegmentSelector supprimé
- [ ] Pricing section supprimée
- [ ] WorksWith section supprimée
- [ ] Projects section créée
- [ ] SEO metadata mis à jour

### UX
- [ ] Hero communique "Applied AI Research"
- [ ] 3 piliers Research/Open Source/Consulting clairs
- [ ] Multi-domain differentiation évidente
- [ ] 4 options collaboration accessibles (Tools/Consulting/Training/Follow)
- [ ] Tous projets visibles (actifs + archived)

---

## 7. Notes Finales

### Principes Clés
1. **Research Lab vibe** - Curious, exploratory, not locked into one buzzword
2. **Multi-domain** - Not just agentic, also knowledge management, databases, content
3. **Open Source First** - All MIT, consulting optional
4. **Practical** - We ship production systems, not just papers
5. **Humble** - 10+ years = fact, not brag

### Différences vs Version Précédente

**V2 (AgentsCards-focused):**
- Hero: "Context Management for Agentic Systems"
- Product first (AgentsCards)
- Pricing section avec freemium tiers
- WorksWith MCP servers logos
- Focus unique projet

**V3 (Applied AI Research):**
- Hero: "Applied AI Research"
- Research first (multi-domain)
- Pas de pricing (freemium pas lancé)
- Pas de WorksWith
- Section Projects dédiée (MCP Gateway + CasysDB + archived)

### Prochaines Étapes Après Refonte

1. **Update GitHub repos** - README align avec casys.ai messaging
2. **LinkedIn profile** - Update headline/about avec nouveau positioning
3. **Blog posts** - Launch article explaining multi-domain approach
4. **Screenshots/demos** - Ajouter visuals pour Projects section
5. **Testimonials** - Collecter feedback users quand projets en prod

---

**Document mis à jour:** 2025-11-15
**Version:** 3.0 - Applied AI Research (Multi-Project)
**Remplace:** Version 2.0 - Context Management for Agentic Systems (Single-Product Focus)

Pour questions ou clarifications: voir [story-2025-11-11.md](./story-2025-11-11.md)
