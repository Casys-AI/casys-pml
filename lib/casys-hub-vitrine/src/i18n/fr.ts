// ============================================================
// French translations for Casys Hub Vitrine
// Organized by page/section
// ============================================================

import type { Translations } from "./index";

export const fr: Translations = {
  // ========================================
  // SHARED COMPONENTS
  // ========================================
  header: {
    projects: "Projets",
    whyCasys: "Pourquoi Casys",
    consulting: "Consulting",
    blog: "Blog",
    useCases: "Notre Travail",
    about: "À propos",
    contact: "Contact",
  },
  footer: {
    product: "Produit",
    projects: "Projets",
    consulting: "Consulting",
    training: "Formations",
    github: "GitHub",
    openSource: "Open Source",
    connect: "Liens",
    contact: "Contact",
    discord: "Discord",
    description: "Architecture Agentique & Systèmes de Contexte",
    tagline: "Outils Open Source & Consulting",
  },
  subsiteFooter: {
    product: "Produit",
    projects: "Projets",
    consulting: "Consulting",
    training: "Formations",
    openSource: "Open Source",
    connect: "Liens",
    contact: "Contact",
    discord: "Discord",
    description: "Architecture Agentique & Systèmes de Contexte",
    tagline: "Outils Open Source & Consulting",
  },

  // ========================================
  // LANDING V2 SECTIONS
  // ========================================
  hero: {
    kicker: "Architecture Agentique & Systèmes de Contexte",
    titleLine1: "Des Knowledge Graphs",
    titleLine2: "aux serveurs MCP",
    subtitle:
      "15+ ans de context engineering — livré en infrastructure open-source pour votre équipe.",
    cta: {
      primary: { text: "Travaillons ensemble", icon: "handshake", url: "#contact" },
      secondary: { text: "Explorer les projets", icon: "explore", url: "#projects" },
    },
    proofs: [
      { name: "mcp-std", stat: "508 outils", url: "https://mcp-std.casys.ai" },
      { name: "mcp-server", stat: "Auth production", url: "https://mcp-server.casys.ai" },
      { name: "mcp-bridge", stat: "Telegram", url: "https://mcp-bridge.casys.ai" },
      { name: "Casys PML", stat: "Gateway", url: "https://pml.casys.ai" },
    ],
  },
  socialProof: {
    title: "Track Record",
    subtitle: "Du concret, pas des promesses",
    items: [
      {
        type: "stat",
        icon: "code",
        stat: "Actif",
        label: "En Dev",
        description: "Casys PML - Gateway MCP avec GraphRAG & DAG",
        link: {
          text: "Suivre sur GitHub",
          url: "https://github.com/Casys-AI/casys-pml",
        },
      },
      {
        type: "stat",
        icon: "groups",
        stat: "15+",
        label: "Ans d'Expertise",
        description: "Context Management → Graph DBs → DAGs → MCP",
        link: {
          text: "Lire Notre Histoire",
          url: "/about",
        },
      },
      {
        type: "stat",
        icon: "public",
        stat: "French Tech",
        label: "Taiwan",
        description: "Membre actif communauté French Tech Taiwan",
        link: {
          text: "Voir Nos Talks",
          url: "/blog?tag=talks",
        },
      },
    ],
    githubTitle: "Bilan Open Source",
    githubCta: "Voir tous les projets sur GitHub",
    repos: [
      {
        name: "@casys/mcp-server",
        description: "Serveur MCP production avec pipeline middleware",
        stars: "★ New",
        url: "https://github.com/Casys-AI/casys-mcp-server",
      },
      {
        name: "@casys/mcp-std",
        description: "508+ outils pour agents MCP",
        stars: "★ New",
        url: "https://github.com/Casys-AI/casys-mcp-std",
      },
    ],
  },
  workWithUs: {
    title: "Travailler Avec Nous",
    subtitle:
      "Nos outils sont gratuits et open-source. Quand vous avez besoin d'aide pour les déployer, on est là.",
    options: [
      {
        id: "explore",
        icon: "explore",
        title: "Explorer",
        tagline: "Gratuit & Open Source",
        description: "Découvrez nos outils, lisez notre recherche, rejoignez la communauté.",
        items: [
          {
            icon: "code",
            text: "Casys PML - Procedural Memory Layer pour agents AI",
            url: "https://pml.casys.ai",
          },
          { icon: "article", text: "Blog & Articles techniques", url: "/blog" },
          {
            icon: "groups",
            text: "Communauté French Tech Taiwan",
            url: "https://www.linkedin.com/company/casys-ai",
          },
        ],
        cta: {
          text: "Explorer sur GitHub",
          url: "https://github.com/casys-ai",
          icon: "arrow_forward",
        },
      },
      {
        id: "learn",
        icon: "school",
        title: "Apprendre",
        tagline: "Formations & Workshops",
        description: "Programmes hands-on pour maîtriser nos domaines de recherche.",
        items: [
          { icon: "smart_toy", text: "Context Management pour Agents AI (2-3 jours)" },
          { icon: "hub", text: "Graph Databases Embedded (1-2 jours)" },
          { icon: "architecture", text: "Architectures Multi-Domaines AI (3-5 jours)" },
        ],
        details: [
          "On-site ou remote",
          "Exercices hands-on",
          "Matériaux personnalisés",
        ],
        cta: {
          text: "Demander Formation",
          url: "#contact",
          icon: "calendar_today",
        },
      },
      {
        id: "collaborate",
        icon: "handshake",
        title: "Collaborer",
        tagline: "Consulting & Projets",
        description: "Aide hands-on pour vos architectures AI complexes.",
        items: [
          { icon: "check_circle", text: "Architecture Review & Strategy" },
          { icon: "check_circle", text: "Déploiement & Intégrations Custom" },
          { icon: "check_circle", text: "Optimisation Performance" },
          { icon: "check_circle", text: "Pair Programming & Code Reviews" },
        ],
        engagement:
          "Engagement typique : 2-5 jours. Full remote, flexible sur les fuseaux horaires.",
        highlights: [
          "Accès direct aux builders",
          "Pas d'engagement minimum",
          "Itération rapide",
        ],
        cta: {
          text: "Nous Contacter",
          url: "#contact",
          icon: "mail",
        },
      },
    ],
  },
  whatWeDo: {
    title: "Ce qu'on Fait",
    subtitle: "Context engineering combinant exploration, open source et consulting",
    cards: [
      {
        id: "research",
        icon: "school",
        title: "Research & Exploration",
        subtitle: "Architectures AI multi-domaines",
        description:
          "Knowledge Management (2013+) → Graph Databases → Systèmes Agentiques modernes",
        researchAreas: [
          {
            name: "Knowledge Management",
            description: "15+ ans de systèmes KM, graphes, recherche sémantique",
          },
          {
            name: "Systèmes Agentiques",
            description: "Optimisation contexte, orchestration, architectures multi-agents",
          },
          {
            name: "Content Intelligence",
            description: "Systèmes de contenu graph-based, relations automatisées",
          },
          {
            name: "Database Systems",
            description: "Architectures de stockage knowledge graph-based",
          },
        ],
        philosophy: [
          {
            icon: "vertical_align_bottom",
            text: "Profondeur > largeur - sans peur des nouveaux domaines",
          },
          { icon: "public", text: "Recherche ouverte - on publie ce qu'on apprend" },
          { icon: "rocket_launch", text: "Pratique - recherche qui ship en production" },
        ],
      },
      {
        id: "opensource",
        icon: "code",
        title: "Projets Open Source",
        subtitle: "Outils open source",
        projects: ["MCP Gateway: Context management"],
        highlights: ["Open source par défaut", "Production-ready", "Consulting optionnel"],
      },
      {
        id: "consulting",
        icon: "engineering",
        title: "Consulting",
        subtitle: "Aide hands-on",
        services: ["Architecture & Strategy", "Implémentation & Déploiement", "Formations"],
        highlights: ["Tarifs flexibles", "Pas d'engagement minimum", "Accès direct builders"],
      },
    ],
  },
  projects: {
    title: "Nos Projets",
    subtitle:
      "Outils open source pour l'écosystème MCP. Du protocol tooling à l'intelligence par graphe.",
    featured: {
      name: "Casys PML",
      tagline: "Un gateway. N'importe quel modèle. Observabilité totale.",
      status: "Développement Actif",
      license: "AGPL-3.0",
      features: [
        {
          icon: "swap_horiz",
          name: "Model-Agnostic",
          description: "Claude, GPT, Gemini, Ollama — changez librement",
        },
        {
          icon: "visibility",
          name: "Observabilité Complète",
          description: "Chaque appel tracé : coût, latence, statut",
        },
        {
          icon: "auto_awesome",
          name: "Extraction de Patterns",
          description: "SHGAT extrait les patterns de pertinence des traces d'exécution",
        },
      ],
      results: [
        { stat: "120+", label: "Capabilities au catalogue" },
        { stat: "4", label: "Providers LLM supportés" },
        { stat: "Gratuit", label: "Beta open source" },
      ],
      links: {
        website: "https://pml.casys.ai",
        github: "https://github.com/Casys-AI/casys-pml",
        docs: "https://pml.casys.ai/docs",
      },
    },
    categories: [
      {
        name: "Infrastructure MCP",
        items: [
          {
            id: "mcp-std",
            name: "@casys/mcp-std",
            tagline: "508 Outils MCP. Un seul import.",
            status: "v0.4.0",
            tech: "Deno",
            links: {
              website: "https://mcp-std.casys.ai",
              github: "https://github.com/Casys-AI/casys-pml/tree/main/lib/std",
              jsr: "https://jsr.io/@casys/mcp-std",
            },
          },
          {
            id: "mcp-server",
            name: "@casys/mcp-server",
            tagline: "Framework Serveur MCP Production",
            status: "v0.3.0",
            tech: "Deno",
            links: {
              website: "https://mcp-server.casys.ai",
              github: "https://github.com/Casys-AI/casys-pml/tree/main/lib/server",
              jsr: "https://jsr.io/@casys/mcp-server",
            },
          },
          {
            id: "mcp-bridge",
            name: "@casys/mcp-bridge",
            tagline: "MCP Apps vers plateformes messagerie",
            status: "v0.1.0",
            tech: "Deno",
            links: {
              website: "https://mcp-bridge.casys.ai",
              github: "https://github.com/Casys-AI/casys-pml/tree/main/lib/mcp-apps-bridge",
              jsr: "https://jsr.io/@casys/mcp-bridge",
            },
          },
        ],
      },
    ],
  },
  whyCasys: {
    title: "Pourquoi Casys?",
    subtitle: "Ce qui nous rend différents",
    differentiation: [
      {
        id: "multi-domain",
        icon: "hub",
        title: "Expertise Multi-Domaine",
        description: "On connecte plusieurs domaines pour insights uniques",
        highlights: [
          "KM Systems (2013+) → Graph DB → AI Agents",
          "Cross-pollination crée insights",
          "Expertise compound à travers vagues tech",
        ],
      },
      {
        id: "continuity",
        icon: "timeline",
        title: "15+ Ans Continuité",
        description: "Pas des newcomers AI qui surfent la hype",
        highlights: [
          "Track record 15+ ans",
          "Expertise profonde, pas hype superficielle",
          "Chaque phase build sur la dernière",
        ],
      },
      {
        id: "opensource",
        icon: "code_blocks",
        title: "Open Source First",
        description: "Open source par défaut. Outils gratuits, consulting optionnel",
        highlights: [
          "Open source par défaut",
          "Pas de vendor lock-in",
          "Partager la recherche",
        ],
      },
      {
        id: "practical",
        icon: "rocket_launch",
        title: "Recherche Pratique",
        description: "On ship systèmes production qui résolvent vrais problèmes",
        highlights: [
          "Production-ready, pas juste prototypes",
          "Battle-tested dans environnements réels",
          "On utilise nos propres outils",
        ],
      },
      {
        id: "accessible",
        icon: "handshake",
        title: "Accessible par Design",
        description: "Pas de corporate overhead",
        highlights: [
          "Tarification transparente",
          "Pas d'engagements minimums",
          "Accès direct aux builders",
        ],
      },
    ],
    bottomLine: {
      text:
        "Un petit cabinet avec expertise profonde en gestion de contexte et systèmes agentiques. On build vrais outils, partage ce qu'on apprend, aide équipes si besoin.",
      cta: {
        primary: {
          text: "Nous Contacter",
          url: "#contact",
          icon: "mail",
        },
        secondary: {
          text: "Email",
          url: "#contact",
          icon: "email",
        },
      },
    },
  },
  blog: {
    title: "Du Blog",
    subtitle: "Perspectives sur l'architecture AI, l'orchestration d'outils, et ce qu'on construit",
    readMore: "Lire",
    viewAll: "Voir tous les articles",
  },
  faq: {
    title: "Questions Fréquentes",
    subtitle: "Tout ce qu'il faut savoir sur nos projets et notre consulting",
    categories: ["Projects", "Consulting", "Training", "General"],
    allLabel: "Tout",
    faqs: [
      {
        category: "Projects",
        q: "C'est quoi Casys PML exactement?",
        a: "Casys PML est un MCP gateway model-agnostic. Vous écrivez vos workflows AI une fois, et ils tournent sur Claude, GPT, Gemini ou Ollama en local. Chaque appel d'outil est tracé (coût, latence, statut) et SHGAT extrait les patterns de pertinence depuis les données d'exécution pour améliorer le scoring.",
      },
      {
        category: "Projects",
        q: "En quoi Casys PML est différent des autres outils MCP?",
        a: "Casys PML est un gateway unifié, pas juste un client MCP. Il offre: (1) Changement de provider LLM à la volée (pas de vendor lock-in), (2) Observabilité complète de chaque tool call avec coût et latence, (3) Extraction de patterns par graphe — SHGAT score la pertinence des outils depuis les traces d'exécution. Le seul MCP gateway combinant routage model-agnostic + observabilité + scoring par attention sur graphe.",
      },
      {
        category: "Projects",
        q: "Quels modèles LLM sont supportés?",
        a: "Claude (Anthropic), GPT (OpenAI), Gemini (Google), et Ollama (local/self-hosted). PML agit comme gateway: vous changez de provider sans réécrire vos workflows. Le catalogue contient 120+ capabilities prêtes à l'emploi.",
      },
      {
        category: "Projects",
        q: "Casys PML est open source?",
        a: "Oui. Licence AGPL-3.0. Vous pouvez auto-héberger gratuitement pour toujours, lire le code, le modifier, contribuer. Service managé optionnel pour équipes qui veulent sync cloud et collaboration.",
      },
      {
        category: "Projects",
        q: "Quel est le statut de Casys PML?",
        a: "Développement actif. Core fonctionnel: GraphRAG discovery, DAG orchestration avec exécution parallèle, sandbox TypeScript isolé, observabilité temps réel. Architecture Deno 2.x + PGlite. Suivez le progrès sur GitHub.",
      },
      {
        category: "Consulting",
        q: "Qu'est-ce qui est inclus dans consulting?",
        a: "Architecture review, aide déploiement, intégrations MCP custom, design stratégie contexte, formation équipe. On travaille hands-on avec votre codebase. Options flexibles: workshops courts, projets sur mesure, partnerships ongoing, et programmes enterprise custom.",
      },
      {
        category: "Consulting",
        q: "Pourquoi embaucher Casys vs grandes consultances?",
        a: "On est les gens qui construisent Casys PML. On code les systèmes qu'on recommande. Vous avez accès direct aux experts techniques, pas des account managers. Itération plus rapide, entry points accessibles, pas d'engagements minimums lourds comme les grandes consultances.",
      },
      {
        category: "Consulting",
        q: "Vous travaillez uniquement avec Casys PML ou autres architectures aussi?",
        a: "On travaille avec n'importe quelle architecture agentique. Si vous n'utilisez pas Casys PML, pas grave. Notre expertise c'est Context Management, Graph DBs, orchestration DAG. On vous aide designer la meilleure solution pour votre use case.",
      },
      {
        category: "Training",
        q: "Quelles formations vous offrez?",
        a: "Workshop Architecture Agentique (2-3 jours), Training Hands-On Casys PML (1 jour), Fondamentaux Context Management (1/2 jour). Tous programmes customisés à votre tech stack et use cases.",
      },
      {
        category: "Training",
        q: "Où vous livrez formations?",
        a: "Sur site (Taiwan, Asia-Pacific), Remote (worldwide), ou Hybride. On est partenaires Alegria Group pour workshops réguliers à Taiwan et participe événements French Tech Taiwan.",
      },
      {
        category: "General",
        q: "C'est quoi le business model Casys?",
        a: "Trois piliers : (1) Outils open source (Casys PML, mcp-std, mcp-server — gratuits pour toujours), (2) Consulting (workshops, architecture review, aide déploiement), (3) Formations (programmes custom). Les outils prouvent l'expertise ; le consulting l'applique à votre contexte spécifique.",
      },
      {
        category: "General",
        q: "Casys c'est pour qui?",
        a: "CTOs, Tech Leads, Engineering Managers dans des entreprises qui construisent des agents AI et systèmes agentiques. Si vous gérez des challenges de context management, orchestration d'outils ou graphes de connaissances, on peut aider.",
      },
      {
        category: "General",
        q: "C'est quoi votre background expertise?",
        a: '15+ ans en context engineering, de Knowledge Management (2013+) aux Graph Databases aux architectures DAG aux écosystèmes MCP. On fait ça depuis avant que ça s\'appelle "Context Management pour agents AI".',
      },
      {
        category: "General",
        q: "Comment sont structurés vos engagements?",
        a: "On offre plusieurs options flexibles: workshops focused (1 jour), projets custom (déploiement complet), ou partnerships ongoing (accès direct aux praticiens). Pas d'engagements minimums lourds. On optimise pour vitesse d'itération et accessibilité, pas maximisation des marges. Contactez-nous pour discuter de votre besoin spécifique.",
      },
    ],
  },
  finalCta: {
    title: "Prêt à Optimiser Votre Architecture Agentique?",
    subtitle: "Choisissez comment vous voulez travailler avec nous",
    ctas: [
      {
        icon: "rocket_launch",
        text: "Essayer Casys PML",
        subtext: "Open source — installation en 30 secondes",
        url: "https://pml.casys.ai",
      },
      {
        icon: "mail",
        text: "Nous Contacter",
        subtext: "Questions & aide architecture",
        url: "#contact",
      },
    ],
    trustBadges: [
      { icon: "check_circle", text: "AGPL-3.0 Open Source" },
      { icon: "check_circle", text: "15+ ans d'expertise" },
      { icon: "check_circle", text: "Tarifs accessibles" },
    ],
  },
  contact: {
    title: "Prêt à Démarrer?",
    subtitle:
      "Réservez un appel consulting, demandez une formation, ou discutez de vos challenges d'architecture. Réponse sous 24h.",
    namePlaceholder: "Votre nom",
    emailPlaceholder: "Votre email professionnel",
    messagePlaceholder:
      "Je veux réserver un appel consulting / demander une formation / discuter d'un challenge d'architecture",
    submitButton: "Envoyer ma demande",
    sending: "Envoi...",
    successMessage: "Demande reçue ! On revient vers vous sous 24h maximum.",
    errorMessage: "Erreur lors de l'envoi. Veuillez réessayer.",
    hiddenSubject: "Nouvelle demande de contact CASYS",
  },

  // ========================================
  // SUBSITE: ENGINE
  // ========================================
  engineHeader: {
    howItWorks: "Fonctionnement",
    shgat: "SHGAT",
    benchmarks: "Metriques",
    links: "Liens",
    docs: "Docs",
    workWithUs: "Travaillons ensemble",
  },
  engineHero: {
    tagline: "ML COMPUTATION LAYER",
    heroTitle1: "Score, Rank, Build Paths",
    heroTitle2: "No LLM Required",
    heroSubtitle:
      "Les reseaux d'attention SHGAT scorent la pertinence des outils sur une hierarchie d'hypergraphe. Message passing multi-niveaux, attention K-head, zero appel LLM. Deterministe. Observable. Tourne sur votre hardware.",
    statTools: "Noeuds indexes",
    statHit: "Hit@3",
    statLatency: "Latence scoring",
    ctaPrimary: "Comment ca marche",
    ctaDocs: "Documentation",
    ctaSecondary: "GitHub",
  },

  // ========================================
  // SUBSITE: MCP-SERVER
  // ========================================
  mcpServerHeader: {
    features: "Fonctionnalites",
    quickstart: "Demarrage",
    pipeline: "Pipeline",
    install: "Installer",
    docs: "Docs",
    workWithUs: "Travaillons ensemble",
  },
  mcpServerHero: {
    tagline: "Le Hono pour MCP",
    heroTitle1: "Livrez des Serveurs MCP",
    heroTitle2: "Qui Passent a l'Echelle",
    heroSubtitle:
      "Arretez de reinventer l'auth, le rate limiting et les middlewares pour chaque serveur MCP. Un framework, composable par defaut, production-ready des le premier jour.",
    statFeatures: "Features incluses",
    statTests: "Tests au vert",
    statRelease: "Derniere",
    ctaPrimary: "Commencer",
    ctaSecondary: "Voir sur JSR",
    ctaDocs: "Documentation",
  },
  mcpServerInstall: {
    title: "Pret",
    titleAccent: "Quand Vous l'Etes",
    subtitle:
      "Une commande. Compatible Deno et Node.js. Publie sur JSR, le registre JavaScript moderne.",
    jsrLabel: "Registre JSR",
    githubLabel: "GitHub",
    docsLabel: "Documentation",
    builtWith: "Construit avec",
  },

  // ========================================
  // SUBSITE: MCP-STD
  // ========================================
  mcpStdHeader: {
    categories: "Categories",
    catalog: "Catalogue",
    quickstart: "Demarrage",
    install: "Installer",
    workWithUs: "Travaillons ensemble",
  },
  mcpStdHero: {
    tagline: "La Boite a Outils MCP",
    heroTitle1: "508 Outils.",
    heroTitle2: "Un Seul Import.",
    heroSubtitle:
      "Base de donnees, git, docker, crypto, texte, reseau, agents IA \u2014 chaque utilitaire que vous ecririez, deja teste et type.",
    statTools: "Outils",
    statCategories: "Categories",
    statRelease: "Derniere",
    ctaPrimary: "Parcourir le Catalogue",
    ctaSecondary1: "Demarrage Rapide",
    ctaSecondary2: "Voir sur JSR",
  },
  mcpStdInstall: {
    title: "Pret Quand",
    titleAccent: "Vous l'Etes",
    subtitle: "Une commande. Compatible Deno. Publie sur JSR, le registre JavaScript moderne.",
    denoLabel: "Deno",
    binaryLabel: "Binaire",
    jsrLabel: "Registre JSR",
    githubLabel: "GitHub",
    builtWith: "Construit avec",
  },

  // ========================================
  // PML LANDING
  // ========================================
  pmlHero: {
    eyebrow: "Memoire Procedurale pour Agents AI",
    titleLine1: "Un gateway. N'importe quel modele.",
    titleAccent: "Observabilite complete.",
    description:
      "Construisez vos workflows AI une fois, executez-les avec Claude, GPT, Gemini ou votre Ollama local. Chaque appel trace. Deboguez en secondes, pas en heures.",
    ctaPrimary: "Commencer",
    ctaSecondary: "Lire la Doc",
    pillars: ["Multi-Modele", "Tracabilite Totale", "Extraction de Patterns"],
    traceHeader: "workflow:ci-deploy",
    traceLive: "live",
    traceCalls: "22 appels",
    traceModels: "3 modeles",
    traceCost: "0.028 $",
  },
  pmlArchitecture: {
    eyebrow: "Architecture",
    title: "Comment \u00e7a marche",
    description:
      "Un gateway unifi\u00e9 se place entre votre LLM et les outils dont il a besoin. Chaque requ\u00eate est d\u00e9compos\u00e9e en graphe acyclique dirig\u00e9, ex\u00e9cut\u00e9e dans un sandbox, et enti\u00e8rement trac\u00e9e.",
    clients: {
      label: "Clients",
      items: ["Claude", "GPT", "Gemini", "Ollama", "Tout LLM"],
    },
    gateway: {
      label: "PML Gateway",
      pipeline: ["Registre", "DAG", "Sandbox"],
      extras: ["Mod\u00e8le Symbolique", "Observabilit\u00e9"],
    },
    servers: {
      label: "Serveurs MCP",
      items: ["filesystem", "postgres", "github", "memory", "Tout Outil"],
    },
    pillars: [
      { label: "Agnostique", description: "Compatible avec tout fournisseur LLM" },
      { label: "Observabilit\u00e9", description: "Trace compl\u00e8te de chaque action" },
      { label: "Raisonnement Symbolique", description: "Couche de raisonnement symbolique" },
    ],
    mobileArrow: "transmet \u00e0",
  },
  pmlCatalogPreview: {
    label: "Catalogue",
    browseCta: "Parcourir le Catalogue",
  },
  pmlQuickStart: {
    label: "Demarrage Rapide",
    title: "Operationnel en 3 etapes",
    subtitle: "Ajoutez la memoire procedurale a Claude Code en moins d'une minute.",
    docsLink: "Lire la documentation complete",
    steps: [
      {
        number: "01",
        title: "Installer PML",
        description: "Une commande. Aucune dependance. Fonctionne sur macOS, Linux et WSL.",
        file: "terminal",
      },
      {
        number: "02",
        title: "Initialiser votre projet",
        description: "PML cree une configuration locale et se connecte a votre environnement.",
        file: "terminal",
      },
      {
        number: "03",
        title: "Utiliser avec Claude Code",
        description:
          "Les outils PML sont disponibles automatiquement. Decouvrez, executez et apprenez.",
        file: "claude-code",
      },
    ],
  },
  pmlIsolation: {
    eyebrow: "S\u00e9curit\u00e9",
    titleLine1: "Autonome,",
    titleLine2: "pas imprudent.",
    description:
      "Chaque action AI s\u2019ex\u00e9cute dans un sandbox isol\u00e9 avec des limites de ressources. Les op\u00e9rations dangereuses se mettent en pause pour approbation humaine avant de toucher les syst\u00e8mes de production.",
    features: [
      {
        id: "sandbox",
        title: "Ex\u00e9cution Isol\u00e9e",
        description:
          "Le code s\u2019ex\u00e9cute dans des workers isol\u00e9s sans acc\u00e8s direct au syst\u00e8me h\u00f4te ou au r\u00e9seau.",
      },
      {
        id: "hil",
        title: "Humain dans la Boucle",
        description:
          "Les actions dangereuses comme l\u2019\u00e9criture de fichiers ou les mutations de base de donn\u00e9es n\u00e9cessitent une approbation explicite.",
      },
      {
        id: "audit",
        title: "Piste d\u2019Audit",
        description:
          "Chaque action est enregistr\u00e9e avec un contexte complet pour la transparence et l\u2019analyse post-mortem.",
      },
    ],
    svg: {
      sandbox: "SANDBOX",
      checkpoint: "CHECKPOINT",
      protected: "PROT\u00c9G\u00c9",
      aiActions: "ACTIONS AI",
      toolsData: "OUTILS & DONN\u00c9ES",
      approve: "APPROUVER?",
      fetch: "fetch",
      parse: "parse",
      llm: "llm",
      run: "run",
      file: "file",
      db: "db",
      api: "api",
      shell: "shell",
    },
  },
  pmlBetaSignup: {
    eyebrow: "Acces Anticipe",
    title: "Rejoignez la Beta",
    description: "Soyez parmi les premiers a donner une memoire procedurale a vos agents.",
    labelName: "Nom",
    labelEmail: "Email",
    labelUseCase: "Comment utiliserez-vous PML ?",
    placeholderName: "Votre nom",
    placeholderEmail: "vous@entreprise.com",
    placeholderUseCase:
      "ex. Je veux donner a mon agent Claude Code une memoire a long terme pour les workflows DevOps recurrents...",
    submit: "Demander l'Acces",
    sending: "Envoi...",
    successMessage: "Vous etes sur la liste ! Nous vous contacterons bientot.",
    errorMessage: "Une erreur est survenue. Veuillez reessayer.",
    hiddenSubject: "Demande d'acces Beta PML",
  },
  pmlCta: {
    title: "Pret a essayer ?",
    description:
      "Donnez a vos agents une memoire procedurale. Commencez a construire des workflows observables des aujourd'hui.",
    primaryCta: "Commencer",
    secondaryCta: "Demander l'Acces Beta",
  },
  pmlIntelligence: {
    eyebrow: "Extraction de Patterns",
    titleLine1: "Chaque exécution",
    titleLine2: "laisse une trace.",
    description:
      "PML enregistre des traces d'exécution complètes — séquences d'outils, latences, chemins d'erreur. SHGAT extrait les patterns de pertinence depuis ces données. Déterministe, inspectable, pas de boîte noire.",
    features: [
      {
        icon: "hub",
        title: "Traces d'Exécution",
        desc:
          "Chaque workflow est entièrement tracé : appels d'outils, entrées, sorties, timing, coûts. Les données restent sur votre infrastructure.",
      },
      {
        icon: "auto_awesome",
        title: "Scoring par Attention sur Graphe",
        desc:
          "SHGAT traite les données de traces pour scorer la pertinence des outils. Attention K-head sur la hiérarchie d'hypergraphe. Aucun appel LLM.",
      },
      {
        icon: "recommend",
        title: "Patterns de Co-occurrence",
        desc:
          "Les outils fréquemment exécutés ensemble émergent automatiquement. Co-occurrence statistique, pas de devinettes.",
      },
    ],
  },

  // ========================================
  // ENGINE (additional sections)
  // ========================================
  engineLinks: {
    title: "Partie de",
    titleAccent: "l'Ecosysteme PML",
    subtitle: "Le moteur tourne dans PML. Auto-heberge, open source, aucun appel API externe.",
    jsrLabel: "JSR",
    githubLabel: "GitHub",
    docsLabel: "Docs",
    pmlLabel: "PML",
    builtWith: "Construit avec",
  },
  engineBenchmarks: {
    title: "Des Chiffres,",
    titleAccent: "Pas des Promesses",
    subtitle:
      "Benchmarke sur 245 noeuds (218 leaves + 26 composites + 1 root). Toutes les metriques proviennent de traces de production.",
    shgatTitle: "SHGAT-TF",
    shgatRows: [
      ["Hit@1", "56.2%"],
      ["Hit@3", "86.3%"],
      ["MRR", "0.705"],
      ["Leaves (L0)", "218"],
      ["Composites (L1)", "26"],
      ["Tetes d'attention", "16 \u00d7 64D"],
      ["Niveaux hierarchie", "3 (L0 \u2192 L1 \u2192 L2)"],
      ["Latence scoring", "2.3s"],
    ],
  },
  engineHowItWorks: {
    title: "De l'Intent aux",
    titleAccent: "Outils Classes",
    subtitle:
      "Un modele, un pipeline. SHGAT score la pertinence des outils sur toute la hierarchie, puis le DAG executor lance les mieux classes.",
    steps: [
      { icon: "search", label: "Intent", sublabel: "requete", type: "incoming" },
      { icon: "text_fields", label: "Embedding", sublabel: "BGE-M3 1024D", type: "" },
      { icon: "hub", label: "Score SHGAT", sublabel: "K-head \u00d7 16", type: "" },
      { icon: "format_list_numbered", label: "Classement", sublabel: "top-K outils", type: "" },
      { icon: "play_arrow", label: "Executer", sublabel: "DAG runner", type: "handler" },
    ],
  },

  // ========================================
  // MCP-SERVER (additional sections)
  // ========================================
  mcpServerComparison: {
    title: "SDK vs",
    titleAccent: "Framework",
    subtitle: "Le SDK officiel donne le protocole. Ceci donne le stack de production.",
    colSdk: "SDK Officiel",
    colFramework: "@casys/mcp-server",
    rows: [
      ["Protocole MCP", true, true],
      ["Pipeline middleware", false, true],
      ["Auth OAuth2 / JWT", false, true],
      ["Rate limiting", false, true],
      ["Validation de schema", false, true],
      ["Streamable HTTP + SSE", "Manuel", "Integre"],
      ["Controle de concurrence", false, true],
      ["Tracing OpenTelemetry", false, true],
      ["Metriques Prometheus", false, true],
      ["MCP Apps (UI resources)", "Manuel", "Integre"],
      ["Allowlist CORS", false, true],
      ["Limite taille body (413)", false, true],
      ["Rate limit IP (429)", false, true],
      ["Propagation session", false, true],
      ["Signature HMAC messages", false, true],
      ["Injection CSP", false, true],
      ["Config YAML + Env", false, true],
      ["Deno + Node.js", "Node uniquement", "Les deux"],
    ],
  },
  mcpServerFeatures: {
    title: "Tout",
    titleAccent: "Inclus",
    subtitle: "Tout ce qui se passe entre la requete et votre handler -- c'est gere.",
    features: [
      { icon: "swap_horiz", name: "Double Transport", desc: "STDIO + HTTP Streamable. Meme code." },
      { icon: "layers", name: "Pipeline Middleware", desc: "Modele onion composable, a la Koa." },
      { icon: "shield", name: "Auth OAuth2", desc: "JWT/Bearer + metadonnees RFC 9728." },
      { icon: "key", name: "Presets OIDC", desc: "GitHub, Google, Auth0 -- une ligne." },
      {
        icon: "settings",
        name: "Config YAML + Env",
        desc: "Fichier config, override env au deploy.",
      },
      { icon: "speed", name: "Concurrence", desc: "Backpressure : sleep, queue ou reject." },
      { icon: "timer", name: "Rate Limiting", desc: "Fenetre glissante, isolation par client." },
      {
        icon: "check_circle",
        name: "Validation Schema",
        desc: "JSON Schema via ajv a l'enregistrement.",
      },
      { icon: "monitoring", name: "Observabilite", desc: "Spans OTel + Prometheus /metrics." },
      { icon: "widgets", name: "MCP Apps", desc: "UIs interactives via le scheme ui://." },
      {
        icon: "lock",
        name: "Allowlist CORS",
        desc: "Allowlist d'origines avec avertissement wildcard.",
      },
      { icon: "upload_file", name: "Limite Body", desc: "maxBodyBytes avec erreur 413 JSON-RPC." },
      {
        icon: "block",
        name: "Rate Limit IP",
        desc: "429 par IP + Retry-After sur la couche HTTP.",
      },
      {
        icon: "badge",
        name: "Propagation Session",
        desc: "sessionId injecte dans le contexte middleware.",
      },
      {
        icon: "enhanced_encryption",
        name: "Signature HMAC",
        desc: "SHA-256 sign/verify + anti-replay pour PostMessage.",
      },
      {
        icon: "security",
        name: "Injection CSP",
        desc: "Content-Security-Policy auto-injecte dans les MCP Apps.",
      },
    ],
  },
  mcpServerPipeline: {
    title: "Votre Serveur,",
    titleAccent: "Vos Regles",
    subtitle:
      "Chaque requete traverse une chaine middleware composable. Besoin d'auth ? Ajoutez-la. Rate limiting ? Une ligne. Logique custom ? Glissez-la ou vous voulez.",
    steps: [
      { icon: "arrow_forward", label: "Requete", type: "incoming" },
      { icon: "timer", label: "Rate Limit", type: "" },
      { icon: "shield", label: "Auth", type: "" },
      { icon: "tune", label: "Custom", type: "custom" },
      { icon: "verified_user", label: "Scopes", type: "" },
      { icon: "check_circle", label: "Validation", type: "" },
      { icon: "speed", label: "Backpressure", type: "" },
      { icon: "play_arrow", label: "Handler", type: "handler" },
    ],
  },
  mcpServerQuickStart: {
    title: "5 Lignes vers la",
    titleAccent: "Prod",
    subtitle:
      "Pas de boilerplate. Pas de ceremonie de config. Enregistrez un tool, appelez start(), livrez.",
    tabBasic: "Basique (STDIO)",
    tabHttp: "HTTP + Auth",
    tabYaml: "Config YAML",
  },

  // ========================================
  // MCP-STD (additional sections)
  // ========================================
  mcpStdQuickStart: {
    title: "3 Lignes vers la",
    titleAccent: "Prod",
    subtitle:
      "Utilisez-le comme serveur MCP autonome ou importez les outils individuellement comme librairie. A vous de choisir.",
    tabServer: "Serveur MCP",
    tabLibrary: "Librairie",
    tabCategory: "Par Cat\u00e9gorie",
  },
  mcpStdCategories: {
    title: "29",
    titleAccent: "Categories",
    subtitle:
      "Des requetes base de donnees a l'orchestration d'agents IA, chaque outil organise et pret a l'emploi.",
    cta: "Parcourir les 508 outils",
  },

  // ========================================
  // ENGINE - SHGAT Section
  // ========================================
  engineShgat: {
    eyebrow: "SHGAT-TF",
    titleLine1: "SuperHyperGraph",
    titleLine2: "Attention Networks",
    description:
      "Pourquoi un hypergraphe ? Les graphes classiques modelisent des relations par paires (outil A appelle outil B). Les hypergraphes modelisent le N-vers-N : un composite regroupe plusieurs leaves, un leaf appartient a plusieurs composites. Ca capture la vraie structure des ecosystemes d'outils agentiques.",
    features: [
      {
        icon: "hub",
        title: "Attention K-Head (16 \u00d7 64D)",
        desc:
          "Chaque tete capture un signal de pertinence different \u2014 co-occurrence, recence, recuperation d'erreur, taux de succes. Les tetes sont combinees via des poids de fusion appris.",
      },
      {
        icon: "account_tree",
        title: "Message Passing Multi-Niveaux",
        desc:
          "L0 : 218 leaves (outils). L1 : 26 composites. L2 : meta-composites. Le contexte propage de bas en haut puis de haut en bas. Un leaf herite de la pertinence de composites soeurs avec lesquels il n'a jamais ete appaire.",
      },
      {
        icon: "trending_up",
        title: "Perte Contrastive InfoNCE",
        desc:
          "Entrainement avec annealing de temperature (0.10 \u2192 0.06), negatives difficiles et replay d'experience prioritise. Hit@3 atteint 86.3% sur 644 noeuds.",
      },
      {
        icon: "model_training",
        title: "Entrainement Inclus",
        desc:
          "SHGAT-TF s'entraine depuis les traces de production \u2014 aucun service externe, aucun GPU requis. libtensorflow FFI tourne nativement via Deno.dlopen. Autonome.",
      },
    ],
  },

  // ========================================
  // ABOUT PAGE
  // ========================================
  about: {
    pageTitle: "\u00c0 propos",
    heroName: "Erwan Le Pesle",
    heroTitle: "Fondateur & Architecte Syst\u00e8me, Casys",
    heroBio:
      "Nous construisons des syst\u00e8mes qui connectent la connaissance \u00e0 l'action depuis plus de quinze ans \u2014 des premiers chatbots sur mIRC au knowledge management en entreprise, jusqu'aux r\u00e9seaux d'attention sur graphes pour la pertinence des outils. Quand les LLM sont arriv\u00e9s, le probl\u00e8me n'a pas chang\u00e9 : contexte en entr\u00e9e, action en sortie. MCP est l'expression la plus r\u00e9cente de ce principe, et la plus cons\u00e9quente. Casys AI aide les \u00e9quipes techniques \u00e0 livrer des int\u00e9grations IA fiables \u2014 sans d\u00e9pendance fournisseur, sans bo\u00eete noire.",
    expertiseTitle: "Ce que nous faisons",
    expertiseSubtitle:
      "L'infrastructure qui connecte les syst\u00e8mes IA aux donn\u00e9es, outils et workflows du monde r\u00e9el \u2014 con\u00e7ue pour l'observabilit\u00e9 et le d\u00e9terminisme en production.",
    areas: [
      {
        icon: "hub",
        title: "Graphes de Connaissances",
        description:
          "Conception de sch\u00e9mas, optimisation de requ\u00eates et architectures graph-native. Neo4j Professional Developer certifi\u00e9. De la mod\u00e9lisation d'ontologies aux pipelines graphe en production.",
      },
      {
        icon: "database",
        title: "Bases de Donn\u00e9es Graphe",
        description:
          "Mod\u00e9liser les relations complexes que les bases relationnelles ne peuvent pas exprimer. Nous concevons, d\u00e9ployons et optimisons des instances Neo4j en trafic de production r\u00e9el.",
      },
      {
        icon: "smart_toy",
        title: "Syst\u00e8mes Agentiques",
        description:
          "Orchestration d'outils, routage de contexte et fiabilit\u00e9 d'ex\u00e9cution. Nous architecturons des syst\u00e8mes multi-agents o\u00f9 chaque d\u00e9cision est tra\u00e7able et chaque erreur r\u00e9cup\u00e9rable.",
      },
      {
        icon: "cable",
        title: "Infrastructure MCP",
        description:
          "Architecture serveur, conception de connecteurs et optimisation au niveau protocole. Plus de 500 outils open source livr\u00e9s. Nous construisons des couches MCP observables, testables et pr\u00eates pour la production.",
      },
    ],
    philosophyTitle: "Comment nous travaillons",
    principles: [
      {
        icon: "code",
        title: "L'Open Source comme fondation",
        description:
          "Nos outils fondamentaux sont open source. Les clients obtiennent des solutions construites sur du code qu'ils peuvent inspecter, forker et poss\u00e9der. Sans d\u00e9pendance fournisseur, sans bo\u00eete noire.",
      },
      {
        icon: "science",
        title: "Recherche qui livre",
        description:
          "Nous publions ce que nous apprenons et livrons ce que nous construisons. Chaque technique que nous recommandons a \u00e9t\u00e9 test\u00e9e sur des charges r\u00e9elles, pas seulement sur des benchmarks.",
      },
      {
        icon: "emoji_objects",
        title: "Du Concret, Pas du Buzz",
        description:
          "Nous ne vendons pas de la \"transformation IA.\" Nous r\u00e9solvons des probl\u00e8mes d'infrastructure sp\u00e9cifiques avec des m\u00e9thodes d'ing\u00e9nierie sp\u00e9cifiques. Le travail parle de lui-m\u00eame.",
      },
    ],
    ctaTitle: "Commencez par un probl\u00e8me",
    ctaSubtitle:
      "D\u00e9crivez votre d\u00e9fi d'infrastructure MCP, votre goulet d'\u00e9tranglement en graphes de connaissances ou votre question d'architecture agentique. Nous vous dirons franchement si nous pouvons aider \u2014 et exactement comment nous aborderions le probl\u00e8me.",
    ctaPrimary: {
      text: "Nous Contacter",
      url: "/#contact",
      icon: "mail",
    },
    ctaSecondary: {
      text: "Voir les Projets",
      url: "/#projects",
      icon: "folder_open",
    },
  },

  // ========================================
  // SUBSITE: MCP-BRIDGE
  // ========================================
  mcpBridgeHeader: {
    features: "Fonctionnalites",
    architecture: "Architecture",
    quickstart: "Demarrage",
    install: "Installer",
    docs: "Docs",
    workWithUs: "Travaillons ensemble",
  },
  mcpBridgeHero: {
    tagline: "MCP Apps \u2192 Plateformes Messagerie",
    heroTitle1: "Vos MCP Apps sur",
    heroTitle2: "2 Mrd d'Utilisateurs",
    heroSubtitle:
      "Transformez n'importe quelle MCP App en Telegram Mini App. Zéro changement de code. Même outil, nouvelle audience.",
    statTests: "Tests au vert",
    statPlatforms: "Plateforme",
    statRelease: "Derniere",
    ctaPrimary: "Commencer",
    ctaSecondary: "Voir sur JSR",
    ctaDocs: "Documentation",
  },
  mcpBridgeFeatures: {
    title: "Comblez le",
    titleAccent: "Fosse",
    subtitle:
      "Tout ce qu'il faut pour emmener vos MCP Apps des outils dev vers les plateformes de messagerie.",
    features: [
      {
        icon: "code_off",
        name: "Zero Changement",
        desc: "Les MCP Apps existantes fonctionnent telles quelles.",
      },
      {
        icon: "layers",
        name: "Architecture 3 Couches",
        desc: "Client, Resource Server, MCP Server.",
      },
      {
        icon: "swap_horiz",
        name: "Traduction Protocole",
        desc: "JSON-RPC 2.0 via WebSocket, transparent.",
      },
      { icon: "smart_toy", name: "Telegram Mini Apps", desc: "Theme, viewport, auth complets." },
      {
        icon: "more_horiz",
        name: "Plus de plateformes",
        desc: "LINE, Discord, WhatsApp — bientôt.",
      },
      { icon: "shield", name: "CSP Stricte", desc: "Content-Security-Policy stricte par defaut." },
      { icon: "key", name: "Auth par Session", desc: "Tokens crypto-securises, validation HMAC." },
      {
        icon: "sync",
        name: "Transport WebSocket",
        desc: "Communication bidirectionnelle temps reel.",
      },
      {
        icon: "palette",
        name: "Mapping Themes",
        desc: "Themes plateforme mappes automatiquement.",
      },
      {
        icon: "extension",
        name: "Adaptateurs Extensibles",
        desc: "Ajoutez Discord, WhatsApp ou autre.",
      },
    ],
  },
  mcpBridgeArchitecture: {
    title: "Comment \u00e7a",
    titleAccent: "Marche",
    subtitle:
      "Le bridge intercepte les appels postMessage de votre MCP App, les route via WebSocket au Resource Server, qui transmet les appels d'outils a votre serveur MCP inchange.",
    steps: [
      { icon: "web", label: "MCP App", type: "incoming" },
      { icon: "javascript", label: "bridge.js", type: "" },
      { icon: "sync", label: "WebSocket", type: "" },
      { icon: "dns", label: "Resource Server", type: "handler" },
      { icon: "hub", label: "MCP Server", type: "" },
      { icon: "send", label: "Telegram", type: "custom" },
    ],
  },
  mcpBridgeComparison: {
    title: "Int\u00e9gration Custom vs",
    titleAccent: "Bridge",
    subtitle: "Economisez des mois de travail d'integration. Le bridge gere les parties complexes.",
    colCustom: "Int\u00e9gration Manuelle",
    colBridge: "@casys/mcp-bridge",
    rows: [
      ["Changements de code MCP App", "R\u00e9\u00e9criture requise", "Aucun"],
      ["Auth plateforme (Telegram)", "HMAC manuel", "Inclus"],
      ["Content Security Policy", "Headers manuels", "Auto-g\u00e9n\u00e9r\u00e9"],
      ["Gestion WebSocket", "De z\u00e9ro", "Inclus"],
      ["Synchronisation theme", "Mapping manuel", "Automatique"],
      ["Support multi-plateforme", "Code par plateforme", "Pattern adaptateur"],
      ["Gestion des sessions", "Impl\u00e9mentation custom", "Crypto-s\u00e9curis\u00e9"],
      ["Injection HTML (bridge.js)", "N/A", "Automatique"],
    ],
  },
  mcpBridgeQuickStart: {
    title: "D\u00e9ployez sur",
    titleAccent: "Telegram",
    subtitle:
      "Votre MCP App dans Telegram en trois etapes. Aucun changement a votre code existant.",
    tabTelegram: "Telegram",
    tabLine: "Bientôt",
  },
  mcpBridgeInstall: {
    title: "Pret",
    titleAccent: "Quand Vous l'Etes",
    subtitle:
      "Une commande. Compatible Deno et Node.js. Publie sur JSR, le registre JavaScript moderne.",
    jsrLabel: "Registre JSR",
    githubLabel: "GitHub",
    docsLabel: "Documentation",
    builtWith: "Construit avec",
  },

  // ========================================
  // USE CASES PAGE
  // ========================================
  useCases: {
    pageTitle: "Notre Travail",
    heroTitle: "Notre Travail",
    heroSubtitle:
      "On construit de l'infrastructure MCP pour la production. Voici ce que ça donne — des vrais défis, des vraies solutions, des vraies métriques.",
    labelChallenge: "Défi",
    labelApproach: "Solution",
    labelResult: "Résultat",
    labelStack: "Stack",
    ctaTitle: "Un défi similaire ?",
    ctaSubtitle:
      "Décrivez votre défi d'infrastructure MCP. On vous dit franchement si on peut aider — et exactement comment on aborderait le problème.",
    ctaPrimary: { text: "Nous Contacter", url: "/#contact", icon: "mail" },
    ctaSecondary: { text: "Voir les Projets", url: "/#projects", icon: "folder_open" },
  },
};
