// ============================================================
// French translations for Casys Hub Vitrine
// Organized by page/section
// ============================================================

import type { Translations } from './index';

export const fr: Translations = {
  // ========================================
  // SHARED COMPONENTS
  // ========================================
  header: {
    projects: 'Projets',
    whyCasys: 'Pourquoi Casys',
    consulting: 'Consulting',
    blog: 'Blog',
    contact: 'Contact',
  },
  footer: {
    product: 'Produit',
    projects: 'Projets',
    consulting: 'Consulting',
    training: 'Formations',
    github: 'GitHub',
    openSource: 'Open Source',
    connect: 'Liens',
    contact: 'Contact',
    discord: 'Discord',
    description: 'Expertise Infrastructure MCP',
    tagline: 'Outils Open Source & Consulting',
  },
  subsiteFooter: {
    product: 'Produit',
    projects: 'Projets',
    consulting: 'Consulting',
    training: 'Formations',
    openSource: 'Open Source',
    connect: 'Liens',
    contact: 'Contact',
    discord: 'Discord',
    description: 'Recherche AI Appliquée',
    tagline: 'Outils Open Source MIT & Consulting',
  },

  // ========================================
  // LANDING V2 SECTIONS
  // ========================================
  hero: {
    kicker: 'Expertise Infrastructure MCP',
    titleLine1: 'Des Knowledge Graphs',
    titleLine2: 'aux serveurs MCP',
    subtitle: '10 ans de knowledge engineering — livré en infrastructure open-source pour votre équipe.',
    cta: {
      primary: { text: 'Travaillons ensemble', icon: 'handshake', url: '#work-with-us' },
      secondary: { text: 'Explorer les projets', icon: 'explore', url: '#projects' },
    },
    proofs: [
      { name: 'mcp-std', stat: '508 outils', url: 'https://mcp-std.casys.ai' },
      { name: 'mcp-server', stat: 'Auth production', url: 'https://mcp-server.casys.ai' },
      { name: 'Casys PML', stat: 'Gateway', url: 'https://pml.casys.ai' },
      { name: 'Engine', stat: 'Scoring par graphe', url: 'https://engine.casys.ai' },
    ],
  },
  socialProof: {
    title: 'Building in Public',
    subtitle: 'Progrès et communauté',
    items: [
      {
        type: 'stat',
        icon: 'code',
        stat: 'Actif',
        label: 'En Dev',
        description: 'Casys PML - Gateway MCP avec GraphRAG & DAG',
        link: {
          text: 'Suivre sur GitHub',
          url: 'https://github.com/Casys-AI/casys-pml'
        }
      },
      {
        type: 'stat',
        icon: 'groups',
        stat: '10+',
        label: 'Ans d\'Expertise',
        description: 'Context Management → Graph DBs → DAGs → MCP',
        link: {
          text: 'Lire Notre Histoire',
          url: '/about'
        }
      },
      {
        type: 'stat',
        icon: 'public',
        stat: 'French Tech',
        label: 'Taiwan',
        description: 'Membre actif communauté French Tech Taiwan',
        link: {
          text: 'Voir Nos Talks',
          url: '/blog?tag=talks'
        }
      }
    ],
    githubTitle: 'Bilan Open Source',
    githubCta: 'Voir tous les projets sur GitHub',
    repos: [
      { name: '@casys/mcp-server', description: 'Serveur MCP production avec pipeline middleware', stars: '★ New', url: 'https://github.com/Casys-AI/casys-mcp-server' },
      { name: '@casys/mcp-std', description: '508+ outils pour agents MCP', stars: '★ New', url: 'https://github.com/Casys-AI/casys-mcp-std' },
      { name: 'PML Engine', description: 'Moteur GraphRAG + exécution DAG', stars: '★ New', url: 'https://github.com/Casys-AI/casys-pml' },
    ]
  },
  workWithUs: {
    title: 'Travailler Avec Nous',
    subtitle: 'Nos outils sont gratuits et open-source. Quand vous avez besoin d\'aide pour les déployer, on est là.',
    options: [
      {
        id: 'explore',
        icon: 'explore',
        title: 'Explorer',
        tagline: 'Gratuit & Open Source',
        description: 'Découvrez nos outils, lisez notre recherche, rejoignez la communauté.',
        items: [
          { icon: 'code', text: 'Casys PML - Procedural Memory Layer pour agents AI', url: 'https://pml.casys.ai' },
          { icon: 'article', text: 'Blog & Articles techniques', url: '/blog' },
          { icon: 'groups', text: 'Communauté French Tech Taiwan', url: 'https://www.linkedin.com/company/casys-ai' }
        ],
        cta: {
          text: 'Explorer sur GitHub',
          url: 'https://github.com/casys-ai',
          icon: 'arrow_forward'
        }
      },
      {
        id: 'learn',
        icon: 'school',
        title: 'Apprendre',
        tagline: 'Formations & Workshops',
        description: 'Programmes hands-on pour maîtriser nos domaines de recherche.',
        items: [
          { icon: 'smart_toy', text: 'Context Management pour Agents AI (2-3 jours)' },
          { icon: 'hub', text: 'Graph Databases Embedded (1-2 jours)' },
          { icon: 'architecture', text: 'Architectures Multi-Domaines AI (3-5 jours)' }
        ],
        details: [
          'On-site ou remote',
          'Exercices hands-on',
          'Matériaux personnalisés'
        ],
        cta: {
          text: 'Demander Formation',
          url: '#contact',
          icon: 'calendar_today'
        }
      },
      {
        id: 'collaborate',
        icon: 'handshake',
        title: 'Collaborer',
        tagline: 'Consulting & Projets',
        description: 'Aide hands-on pour vos architectures AI complexes.',
        items: [
          { icon: 'check_circle', text: 'Architecture Review & Strategy' },
          { icon: 'check_circle', text: 'Déploiement & Intégrations Custom' },
          { icon: 'check_circle', text: 'Optimisation Performance' },
          { icon: 'check_circle', text: 'Pair Programming & Code Reviews' }
        ],
        engagement: 'Engagement typique : 2-5 jours. Full remote, flexible sur les fuseaux horaires.',
        highlights: [
          'Accès direct aux builders',
          'Pas d\'engagement minimum',
          'Itération rapide'
        ],
        cta: {
          text: 'Nous Contacter',
          url: '#contact',
          icon: 'mail'
        }
      }
    ]
  },
  whatWeDo: {
    title: 'Ce qu\'on Fait',
    subtitle: 'Recherche AI appliquée combinant exploration, open source et consulting',
    cards: [
      {
        id: 'research',
        icon: 'school',
        title: 'Research & Exploration',
        subtitle: 'Architectures AI multi-domaines',
        description: 'Knowledge Management (2013+) → Graph Databases → Systèmes Agentiques modernes',
        researchAreas: [
          {
            name: 'Knowledge Management',
            description: '10+ ans de systèmes KM, graphes, recherche sémantique'
          },
          {
            name: 'Systèmes Agentiques',
            description: 'Optimisation contexte, orchestration, architectures multi-agents'
          },
          {
            name: 'Content Intelligence',
            description: 'Systèmes de contenu graph-based, relations automatisées'
          },
          {
            name: 'Database Systems',
            description: 'Architectures de stockage knowledge graph-based'
          }
        ],
        philosophy: [
          { icon: 'vertical_align_bottom', text: 'Profondeur > largeur - sans peur des nouveaux domaines' },
          { icon: 'public', text: 'Recherche ouverte - on publie ce qu\'on apprend' },
          { icon: 'rocket_launch', text: 'Pratique - recherche qui ship en production' }
        ]
      },
      {
        id: 'opensource',
        icon: 'code',
        title: 'Projets Open Source',
        subtitle: 'Outils MIT licensed',
        projects: ['MCP Gateway: Context management'],
        highlights: ['Tout en MIT', 'Production-ready', 'Consulting optionnel']
      },
      {
        id: 'consulting',
        icon: 'engineering',
        title: 'Consulting',
        subtitle: 'Aide hands-on',
        services: ['Architecture & Strategy', 'Implémentation & Déploiement', 'Formations'],
        highlights: ['Mid-market accessible', 'Pas d\'engagement minimum', 'Accès direct builders']
      }
    ]
  },
  projects: {
    title: 'Nos Projets',
    subtitle: 'Outils open-source explorant différentes facettes des systèmes AI',
    activeProjects: [
      {
        id: 'casys-pml',
        name: 'Casys PML',
        tagline: 'Un gateway. N\'importe quel modèle. Observabilité totale.',
        status: 'Développement Actif',
        license: 'AGPL-3.0',
        featured: true,
        features: [
            {
              icon: 'swap_horiz',
              name: 'Model-Agnostic',
              description: 'Claude, GPT, Gemini, Ollama — changez librement'
            },
            {
              icon: 'visibility',
              name: 'Observabilité Complète',
              description: 'Chaque appel tracé : coût, latence, statut'
            },
            {
              icon: 'auto_awesome',
              name: 'Apprentissage de Patterns',
              description: 'Les workflows s\'améliorent automatiquement'
            }
        ],
        results: [
          {
            stat: '120+',
            label: 'Capabilities au catalogue'
          },
          {
            stat: '4',
            label: 'Providers LLM supportés'
          },
          {
            stat: 'Gratuit',
            label: 'Beta open source'
          }
        ],
        tech: {
          stack: 'Deno 2.x, PGlite, Drizzle ORM, Transformers.js'
        },
        links: {
          website: 'https://pml.casys.ai',
          github: 'https://github.com/Casys-AI/casys-pml',
          docs: 'https://pml.casys.ai/docs'
        }
      },
      {
        id: 'mcp-std',
        name: '@casys/mcp-std',
        tagline: '508 Outils MCP. Un seul import.',
        status: 'v0.4.0',
        license: 'MIT',
        features: [
          { icon: 'construction', name: '508 Outils', description: 'Docker, Git, DB, crypto, texte, réseau...' },
          { icon: 'category', name: '32 Catégories', description: 'Chargez uniquement ce dont vous avez besoin' },
          { icon: 'terminal', name: 'Serveur MCP', description: 'Mode standalone ou librairie' }
        ],
        tech: { stack: 'Deno, TypeScript, JSR' },
        links: {
          website: 'https://mcp-std.casys.ai',
          github: 'https://github.com/Casys-AI/casys-pml/tree/main/lib/std',
          jsr: 'https://jsr.io/@casys/mcp-std'
        }
      },
      {
        id: 'mcp-server',
        name: '@casys/mcp-server',
        tagline: 'Framework Serveur MCP Production',
        status: 'v0.3.0',
        license: 'MIT',
        features: [
          { icon: 'security', name: 'Auth intégrée', description: 'OAuth2, JWT, clés API' },
          { icon: 'layers', name: 'Middleware', description: 'Rate limiting, CORS, logging' },
          { icon: 'speed', name: 'HTTP + SSE', description: 'Transport concurrent' }
        ],
        tech: { stack: 'Deno, TypeScript, JSR' },
        links: {
          website: 'https://mcp-server.casys.ai',
          github: 'https://github.com/Casys-AI/casys-pml/tree/main/lib/server',
          jsr: 'https://jsr.io/@casys/mcp-server'
        }
      },
      {
        id: 'engine',
        name: 'PML Engine',
        tagline: 'Réseau de neurones graphe pour l\'orchestration d\'outils',
        status: 'Recherche',
        license: 'AGPL-3.0',
        features: [
          { icon: 'hub', name: 'SHGAT', description: 'Sparse Heterogeneous Graph Attention' },
          { icon: 'psychology', name: 'Apprentissage Runtime', description: 'Apprend des traces d\'exécution' },
          { icon: 'route', name: 'Optimisation DAG', description: 'Planification automatique de workflows' }
        ],
        tech: { stack: 'TensorFlow.js, Deno' },
        links: {
          website: 'https://engine.casys.ai',
          github: 'https://github.com/Casys-AI/casys-pml'
        }
      },
    ],
  },
  whyCasys: {
    title: 'Pourquoi Casys?',
    subtitle: 'Ce qui nous rend différents',
    differentiation: [
      {
        id: 'multi-domain',
        icon: 'hub',
        title: 'Expertise Multi-Domaine',
        description: 'On connecte plusieurs domaines pour insights uniques',
        highlights: [
          'KM Systems (2013+) → Graph DB → AI Agents',
          'Cross-pollination crée insights',
          'Expertise compound à travers vagues tech'
        ]
      },
      {
        id: 'continuity',
        icon: 'timeline',
        title: '10+ Ans Continuité',
        description: 'Pas des newcomers AI qui surfent la hype',
        highlights: [
          'Track record 10+ ans',
          'Expertise profonde, pas hype superficielle',
          'Chaque phase build sur la dernière'
        ]
      },
      {
        id: 'opensource',
        icon: 'code_blocks',
        title: 'Open Source First',
        description: 'Tout MIT licensed. Outils gratuits, consulting optionnel',
        highlights: [
          'Tout en MIT',
          'Pas de vendor lock-in',
          'Partager la recherche'
        ]
      },
      {
        id: 'practical',
        icon: 'rocket_launch',
        title: 'Recherche Pratique',
        description: 'On ship systèmes production qui résolvent vrais problèmes',
        highlights: [
          'Production-ready, pas juste prototypes',
          'Battle-tested dans environnements réels',
          'On utilise nos propres outils'
        ]
      },
      {
        id: 'accessible',
        icon: 'handshake',
        title: 'Mid-Market Accessible',
        description: 'Pas de corporate overhead',
        highlights: [
          'Mid-market pricing',
          'Pas d\'engagements minimums',
          'Accès direct aux builders'
        ]
      }
    ],
    bottomLine: {
      text: 'Un petit lab avec expertise profonde à travers plusieurs domaines AI. On build vrais outils, partage ce qu\'on apprend, aide équipes si besoin.',
      cta: {
        primary: {
          text: 'Nous Contacter',
          url: '#contact',
          icon: 'mail'
        },
        secondary: {
          text: 'Email',
          url: '#contact',
          icon: 'email'
        }
      }
    }
  },
  blog: {
    title: 'Du Blog',
    subtitle: 'Perspectives sur l\'architecture AI, l\'orchestration d\'outils, et ce qu\'on construit',
    readMore: 'Lire',
    viewAll: 'Voir tous les articles',
  },
  faq: {
    title: 'Questions Fréquentes',
    subtitle: 'Tout ce qu\'il faut savoir sur nos projets et Casys',
    categories: ['Projects', 'Consulting', 'Training', 'General'],
    allLabel: 'Tout',
    faqs: [
      {
        category: 'Projects',
        q: 'C\'est quoi Casys PML exactement?',
        a: 'Casys PML est un MCP gateway model-agnostic. Vous écrivez vos workflows AI une fois, et ils tournent sur Claude, GPT, Gemini ou Ollama en local. Chaque appel d\'outil est tracé (coût, latence, statut) et le système apprend de vos patterns d\'utilisation pour s\'améliorer automatiquement.'
      },
      {
        category: 'Projects',
        q: 'En quoi Casys PML est différent des autres outils MCP?',
        a: 'Casys PML est un gateway unifié, pas juste un client MCP. Il offre: (1) Changement de provider LLM à la volée (pas de vendor lock-in), (2) Observabilité complète de chaque tool call avec coût et latence, (3) Apprentissage automatique de patterns — vos workflows s\'optimisent au fil du temps. C\'est le seul MCP gateway qui combine model-agnostic + observabilité + apprentissage.'
      },
      {
        category: 'Projects',
        q: 'Quels modèles LLM sont supportés?',
        a: 'Claude (Anthropic), GPT (OpenAI), Gemini (Google), et Ollama (local/self-hosted). PML agit comme gateway: vous changez de provider sans réécrire vos workflows. Le catalogue contient 120+ capabilities prêtes à l\'emploi.'
      },
      {
        category: 'Projects',
        q: 'Casys PML est open source?',
        a: 'Oui. Licence AGPL-3.0. Vous pouvez auto-héberger gratuitement pour toujours, lire le code, le modifier, contribuer. Service managé optionnel pour équipes qui veulent sync cloud et collaboration.'
      },
      {
        category: 'Projects',
        q: 'Quel est le statut de Casys PML?',
        a: 'Développement actif. Core fonctionnel: GraphRAG discovery, DAG orchestration avec exécution parallèle, sandbox TypeScript isolé, observabilité temps réel. Architecture Deno 2.x + PGlite. Suivez le progrès sur GitHub.'
      },
      {
        category: 'Consulting',
        q: 'Qu\'est-ce qui est inclus dans consulting?',
        a: 'Architecture review, aide déploiement, intégrations MCP custom, design stratégie contexte, formation équipe. On travaille hands-on avec votre codebase. Options flexibles: workshops courts, projets sur mesure, partnerships ongoing, et programmes enterprise custom.'
      },
      {
        category: 'Consulting',
        q: 'Pourquoi embaucher Casys AI vs grandes consultances?',
        a: 'On est les gens qui construisent Casys PML. On code les systèmes qu\'on recommande. Vous avez accès direct aux experts techniques, pas account managers. Itération plus rapide, entry points accessibles mid-market, pas d\'engagements minimums lourds comme les grandes consultances.'
      },
      {
        category: 'Consulting',
        q: 'Vous travaillez uniquement avec Casys PML ou autres architectures aussi?',
        a: 'On travaille avec n\'importe quelle architecture agentique. Si vous n\'utilisez pas Casys PML, pas grave. Notre expertise c\'est Context Management, Graph DBs, orchestration DAG. On vous aide designer la meilleure solution pour votre use case.'
      },
      {
        category: 'Training',
        q: 'Quelles formations vous offrez?',
        a: 'Workshop Architecture Agentique (2-3 jours), Training Hands-On Casys PML (1 jour), Fondamentaux Context Management (1/2 jour). Tous programmes customisés à votre tech stack et use cases.'
      },
      {
        category: 'Training',
        q: 'Où vous livrez formations?',
        a: 'Sur site (Taiwan, Asia-Pacific), Remote (worldwide), ou Hybride. On est partenaires Alegria Group pour workshops réguliers à Taiwan et participe événements French Tech Taiwan.'
      },
      {
        category: 'General',
        q: 'C\'est quoi le business model Casys AI?',
        a: 'Hybrid: (1) Casys PML SaaS (freemium), (2) Consulting (workshops → projets → partnerships → enterprise), (3) Formations (programmes custom). Vous choisissez comment travailler avec nous selon vos besoins.'
      },
      {
        category: 'General',
        q: 'Casys AI c\'est pour qui?',
        a: 'CTOs, Tech Leads, Engineering Managers dans companies mid-market qui construisent agents AI et systèmes MCP. Si vous gérez des challenges context management, on peut aider.'
      },
      {
        category: 'General',
        q: 'C\'est quoi votre background expertise?',
        a: '10+ ans Context Management, de Knowledge Management (2013+) aux Graph Databases aux architectures DAG aux écosystèmes MCP. On fait ça depuis avant que ça s\'appelle "Context Management pour agents AI".'
      },
      {
        category: 'General',
        q: 'Comment sont structurés vos engagements?',
        a: 'On offre plusieurs options flexibles: workshops focused (1 jour), projets custom (déploiement complet), ou partnerships ongoing (accès direct aux builders). Pas d\'engagements minimums lourds. On optimise pour vitesse itération et accès mid-market, pas maximisation marges. Notre business model est hybrid: open source (Casys PML), consulting, formations. Contactez-nous pour discuter de votre besoin spécifique.'
      }
    ]
  },
  finalCta: {
    title: 'Prêt à Optimiser Votre Architecture Agentique?',
    subtitle: 'Choisissez comment vous voulez travailler avec nous',
    ctas: [
      {
        icon: 'rocket_launch',
        text: 'Essayer Casys PML',
        subtext: 'Rejoindre la waitlist freemium',
        url: '#contact'
      },
      {
        icon: 'mail',
        text: 'Nous Contacter',
        subtext: 'Questions & aide architecture',
        url: '#contact'
      }
    ],
    trustBadges: [
      { icon: 'check_circle', text: 'AGPL-3.0 Open Source' },
      { icon: 'check_circle', text: '10+ ans d\'expertise' },
      { icon: 'check_circle', text: 'Mid-market accessible' }
    ]
  },
  contact: {
    title: 'Prêt à Démarrer?',
    subtitle: 'Rejoignez la waitlist Casys PML, réservez un appel consulting, ou demandez une formation. Réponse sous 24h.',
    namePlaceholder: 'Votre nom',
    emailPlaceholder: 'Votre email professionnel',
    messagePlaceholder: 'Je veux rejoindre la waitlist / réserver un appel consulting / demander une formation',
    submitButton: 'Envoyer ma demande',
    sending: 'Envoi...',
    successMessage: 'Demande reçue ! On revient vers vous sous 24h maximum.',
    errorMessage: 'Erreur lors de l\'envoi. Veuillez réessayer.',
    hiddenSubject: 'Nouvelle demande de contact CASYS'
  },

  // ========================================
  // SUBSITE: ENGINE
  // ========================================
  engineHeader: {
    howItWorks: 'Fonctionnement',
    shgat: 'SHGAT',
    benchmarks: 'Metriques',
    links: 'Liens',
    docs: 'Docs',
    workWithUs: 'Travaillons ensemble',
  },
  engineHero: {
    tagline: 'ML COMPUTATION LAYER',
    heroTitle1: 'Score, Rank, Build Paths',
    heroTitle2: 'No LLM Required',
    heroSubtitle: 'Les reseaux d\'attention SHGAT scorent la pertinence des outils sur une hierarchie d\'hypergraphe. Message passing multi-niveaux, attention K-head, zero appel LLM. Deterministe. Observable. Tourne sur votre hardware.',
    statTools: 'Noeuds indexes',
    statHit: 'Hit@3',
    statLatency: 'Latence scoring',
    ctaPrimary: 'Comment ca marche',
    ctaDocs: 'Documentation',
    ctaSecondary: 'GitHub',
  },

  // ========================================
  // SUBSITE: MCP-SERVER
  // ========================================
  mcpServerHeader: {
    features: 'Fonctionnalites',
    quickstart: 'Demarrage',
    pipeline: 'Pipeline',
    install: 'Installer',
    docs: 'Docs',
    workWithUs: 'Travaillons ensemble',
  },
  mcpServerHero: {
    tagline: 'Le Hono pour MCP',
    heroTitle1: 'Livrez des Serveurs MCP',
    heroTitle2: 'Qui Passent a l\'Echelle',
    heroSubtitle: 'Arretez de reinventer l\'auth, le rate limiting et les middlewares pour chaque serveur MCP. Un framework, composable par defaut, production-ready des le premier jour.',
    statFeatures: 'Features incluses',
    statTests: 'Tests au vert',
    statRelease: 'Derniere',
    ctaPrimary: 'Commencer',
    ctaSecondary: 'Voir sur JSR',
    ctaDocs: 'Documentation',
  },
  mcpServerInstall: {
    title: 'Pret',
    titleAccent: 'Quand Vous l\'Etes',
    subtitle: 'Une commande. Compatible Deno et Node.js. Publie sur JSR, le registre JavaScript moderne.',
    jsrLabel: 'Registre JSR',
    githubLabel: 'GitHub',
    docsLabel: 'Documentation',
    builtWith: 'Construit avec',
  },

  // ========================================
  // SUBSITE: MCP-STD
  // ========================================
  mcpStdHeader: {
    categories: 'Categories',
    catalog: 'Catalogue',
    quickstart: 'Demarrage',
    install: 'Installer',
    workWithUs: 'Travaillons ensemble',
  },
  mcpStdHero: {
    tagline: 'La Boite a Outils MCP',
    heroTitle1: '508 Outils.',
    heroTitle2: 'Un Seul Import.',
    heroSubtitle: 'Base de donnees, git, docker, crypto, texte, reseau, agents IA \u2014 chaque utilitaire que vous ecririez, deja teste et type.',
    statTools: 'Outils',
    statCategories: 'Categories',
    statRelease: 'Derniere',
    ctaPrimary: 'Parcourir le Catalogue',
    ctaSecondary1: 'Demarrage Rapide',
    ctaSecondary2: 'Voir sur JSR',
  },
  mcpStdInstall: {
    title: 'Pret Quand',
    titleAccent: 'Vous l\'Etes',
    subtitle: 'Une commande. Compatible Deno. Publie sur JSR, le registre JavaScript moderne.',
    denoLabel: 'Deno',
    binaryLabel: 'Binaire',
    jsrLabel: 'Registre JSR',
    githubLabel: 'GitHub',
    builtWith: 'Construit avec',
  },

  // ========================================
  // PML LANDING
  // ========================================
  pmlHero: {
    eyebrow: 'Memoire Procedurale pour Agents AI',
    titleLine1: 'Un gateway. N\'importe quel modele.',
    titleAccent: 'Observabilite complete.',
    description: 'Construisez vos workflows AI une fois, executez-les avec Claude, GPT, Gemini ou votre Ollama local. Chaque appel trace. Deboguez en secondes, pas en heures.',
    ctaPrimary: 'Commencer',
    ctaSecondary: 'Lire la Doc',
    pillars: ['Multi-Modele', 'Tracabilite Totale', 'Apprend les Patterns'],
    traceHeader: 'workflow:ci-deploy',
    traceLive: 'live',
    traceCalls: '22 appels',
    traceModels: '3 modeles',
    traceCost: '0.028 $',
  },
  pmlArchitecture: {
    eyebrow: 'Architecture',
    title: 'Comment \u00e7a marche',
    description: 'Un gateway unifi\u00e9 se place entre votre LLM et les outils dont il a besoin. Chaque requ\u00eate est d\u00e9compos\u00e9e en graphe acyclique dirig\u00e9, ex\u00e9cut\u00e9e dans un sandbox, et enti\u00e8rement trac\u00e9e.',
    clients: {
      label: 'Clients',
      items: ['Claude', 'GPT', 'Gemini', 'Ollama', 'Tout LLM'],
    },
    gateway: {
      label: 'PML Gateway',
      pipeline: ['Registre', 'DAG', 'Sandbox'],
      extras: ['Mod\u00e8le Symbolique', 'Observabilit\u00e9'],
    },
    servers: {
      label: 'Serveurs MCP',
      items: ['filesystem', 'postgres', 'github', 'memory', 'Tout Outil'],
    },
    pillars: [
      { label: 'Agnostique', description: 'Compatible avec tout fournisseur LLM' },
      { label: 'Observabilit\u00e9', description: 'Trace compl\u00e8te de chaque action' },
      { label: 'Intelligence', description: 'Couche de raisonnement symbolique' },
    ],
    mobileArrow: 'transmet \u00e0',
  },
  pmlCatalogPreview: {
    label: 'Catalogue',
    browseCta: 'Parcourir le Catalogue',
  },
  pmlQuickStart: {
    label: 'Demarrage Rapide',
    title: 'Operationnel en 3 etapes',
    subtitle: 'Ajoutez la memoire procedurale a Claude Code en moins d\'une minute.',
    docsLink: 'Lire la documentation complete',
    steps: [
      {
        number: '01',
        title: 'Installer PML',
        description: 'Une commande. Aucune dependance. Fonctionne sur macOS, Linux et WSL.',
        file: 'terminal',
      },
      {
        number: '02',
        title: 'Initialiser votre projet',
        description: 'PML cree une configuration locale et se connecte a votre environnement.',
        file: 'terminal',
      },
      {
        number: '03',
        title: 'Utiliser avec Claude Code',
        description: 'Les outils PML sont disponibles automatiquement. Decouvrez, executez et apprenez.',
        file: 'claude-code',
      },
    ],
  },
  pmlIsolation: {
    eyebrow: 'S\u00e9curit\u00e9',
    titleLine1: 'Autonome,',
    titleLine2: 'pas imprudent.',
    description: 'Chaque action AI s\u2019ex\u00e9cute dans un sandbox isol\u00e9 avec des limites de ressources. Les op\u00e9rations dangereuses se mettent en pause pour approbation humaine avant de toucher les syst\u00e8mes de production.',
    features: [
      {
        id: 'sandbox',
        title: 'Ex\u00e9cution Isol\u00e9e',
        description: 'Le code s\u2019ex\u00e9cute dans des workers isol\u00e9s sans acc\u00e8s direct au syst\u00e8me h\u00f4te ou au r\u00e9seau.',
      },
      {
        id: 'hil',
        title: 'Humain dans la Boucle',
        description: 'Les actions dangereuses comme l\u2019\u00e9criture de fichiers ou les mutations de base de donn\u00e9es n\u00e9cessitent une approbation explicite.',
      },
      {
        id: 'audit',
        title: 'Piste d\u2019Audit',
        description: 'Chaque action est enregistr\u00e9e avec un contexte complet pour la transparence et l\u2019analyse post-mortem.',
      },
    ],
    svg: {
      sandbox: 'SANDBOX',
      checkpoint: 'CHECKPOINT',
      protected: 'PROT\u00c9G\u00c9',
      aiActions: 'ACTIONS AI',
      toolsData: 'OUTILS & DONN\u00c9ES',
      approve: 'APPROUVER?',
      fetch: 'fetch',
      parse: 'parse',
      llm: 'llm',
      run: 'run',
      file: 'file',
      db: 'db',
      api: 'api',
      shell: 'shell',
    },
  },
  pmlBetaSignup: {
    eyebrow: 'Acces Anticipe',
    title: 'Rejoignez la Beta',
    description: 'Soyez parmi les premiers a donner une memoire procedurale a vos agents.',
    labelName: 'Nom',
    labelEmail: 'Email',
    labelUseCase: 'Comment utiliserez-vous PML ?',
    placeholderName: 'Votre nom',
    placeholderEmail: 'vous@entreprise.com',
    placeholderUseCase: 'ex. Je veux donner a mon agent Claude Code une memoire a long terme pour les workflows DevOps recurrents...',
    submit: 'Demander l\'Acces',
    sending: 'Envoi...',
    successMessage: 'Vous etes sur la liste ! Nous vous contacterons bientot.',
    errorMessage: 'Une erreur est survenue. Veuillez reessayer.',
    hiddenSubject: 'Demande d\'acces Beta PML',
  },
  pmlCta: {
    title: 'Pret a essayer ?',
    description: 'Donnez a vos agents une memoire procedurale. Commencez a construire des workflows plus intelligents des aujourd\'hui.',
    primaryCta: 'Commencer',
    secondaryCta: 'Demander l\'Acces Beta',
  },
  pmlIntelligence: {
    eyebrow: 'Intelligence Collective',
    titleLine1: 'Chaque ex\u00e9cution',
    titleLine2: 'le rend plus intelligent.',
    description: 'Plus il y a de workflows ex\u00e9cut\u00e9s, meilleur devient le syst\u00e8me. Des effets de r\u00e9seau qui s\u2019accumulent \u2014 impossible \u00e0 rattraper une fois lanc\u00e9.',
    features: [
      {
        icon: 'hub',
        title: 'Patterns Communautaires',
        desc: 'Apprenez de milliers d\u2019ex\u00e9cutions de workflows. Plus les gens l\u2019utilisent, plus il devient intelligent pour tous.',
      },
      {
        icon: 'auto_awesome',
        title: 'Auto-Optimisation',
        desc: 'Vos workflows s\u2019am\u00e9liorent automatiquement au fil du temps. Aucun r\u00e9glage manuel n\u00e9cessaire.',
      },
      {
        icon: 'recommend',
        title: 'Suggestions Intelligentes',
        desc: '\u00ab\u00a0Ceux qui ont lanc\u00e9 ceci ont aussi utilis\u00e9\u2026\u00a0\u00bb \u2014 d\u00e9couvrez des outils dont vous ignoriez avoir besoin.',
      },
    ],
  },

  // ========================================
  // ENGINE (additional sections)
  // ========================================
  engineLinks: {
    title: 'Partie de',
    titleAccent: 'l\'Ecosysteme PML',
    subtitle: 'Le moteur tourne dans PML. Auto-heberge, open source, aucun appel API externe.',
    jsrLabel: 'JSR',
    githubLabel: 'GitHub',
    docsLabel: 'Docs',
    pmlLabel: 'PML',
    builtWith: 'Construit avec',
  },
  engineBenchmarks: {
    title: 'Des Chiffres,',
    titleAccent: 'Pas des Promesses',
    subtitle: 'Benchmarke sur 245 noeuds (218 leaves + 26 composites + 1 root). Toutes les metriques proviennent de traces de production.',
    shgatTitle: 'SHGAT-TF',
    shgatRows: [
      ['Hit@1', '56.2%'],
      ['Hit@3', '86.3%'],
      ['MRR', '0.705'],
      ['Leaves (L0)', '218'],
      ['Composites (L1)', '26'],
      ['Tetes d\'attention', '16 \u00d7 64D'],
      ['Niveaux hierarchie', '3 (L0 \u2192 L1 \u2192 L2)'],
      ['Latence scoring', '2.3s'],
    ],
  },
  engineHowItWorks: {
    title: 'De l\'Intent aux',
    titleAccent: 'Outils Classes',
    subtitle: 'Un modele, un pipeline. SHGAT score la pertinence des outils sur toute la hierarchie, puis le DAG executor lance les mieux classes.',
    steps: [
      { icon: 'search', label: 'Intent', sublabel: 'requete', type: 'incoming' },
      { icon: 'text_fields', label: 'Embedding', sublabel: 'BGE-M3 1024D', type: '' },
      { icon: 'hub', label: 'Score SHGAT', sublabel: 'K-head \u00d7 16', type: '' },
      { icon: 'format_list_numbered', label: 'Classement', sublabel: 'top-K outils', type: '' },
      { icon: 'play_arrow', label: 'Executer', sublabel: 'DAG runner', type: 'handler' },
    ],
  },

  // ========================================
  // MCP-SERVER (additional sections)
  // ========================================
  mcpServerComparison: {
    title: 'SDK vs',
    titleAccent: 'Framework',
    subtitle: 'Le SDK officiel donne le protocole. Ceci donne le stack de production.',
    colSdk: 'SDK Officiel',
    colFramework: '@casys/mcp-server',
    rows: [
      ['Protocole MCP', true, true],
      ['Pipeline middleware', false, true],
      ['Auth OAuth2 / JWT', false, true],
      ['Rate limiting', false, true],
      ['Validation de schema', false, true],
      ['Streamable HTTP + SSE', 'Manuel', 'Integre'],
      ['Controle de concurrence', false, true],
      ['Tracing OpenTelemetry', false, true],
      ['Metriques Prometheus', false, true],
      ['MCP Apps (UI resources)', 'Manuel', 'Integre'],
    ],
  },
  mcpServerFeatures: {
    title: 'Tout',
    titleAccent: 'Inclus',
    subtitle: 'Tout ce qui se passe entre la requete et votre handler -- c\'est gere.',
    features: [
      { icon: 'swap_horiz', name: 'Double Transport', desc: 'STDIO + HTTP Streamable. Meme code.' },
      { icon: 'layers', name: 'Pipeline Middleware', desc: 'Modele onion composable, a la Koa.' },
      { icon: 'shield', name: 'Auth OAuth2', desc: 'JWT/Bearer + metadonnees RFC 9728.' },
      { icon: 'key', name: 'Presets OIDC', desc: 'GitHub, Google, Auth0 -- une ligne.' },
      { icon: 'settings', name: 'Config YAML + Env', desc: 'Fichier config, override env au deploy.' },
      { icon: 'speed', name: 'Concurrence', desc: 'Backpressure : sleep, queue ou reject.' },
      { icon: 'timer', name: 'Rate Limiting', desc: 'Fenetre glissante, isolation par client.' },
      { icon: 'check_circle', name: 'Validation Schema', desc: 'JSON Schema via ajv a l\'enregistrement.' },
      { icon: 'monitoring', name: 'Observabilite', desc: 'Spans OTel + Prometheus /metrics.' },
      { icon: 'widgets', name: 'MCP Apps', desc: 'UIs interactives via le scheme ui://.' },
    ],
  },
  mcpServerPipeline: {
    title: 'Votre Serveur,',
    titleAccent: 'Vos Regles',
    subtitle: 'Chaque requete traverse une chaine middleware composable. Besoin d\'auth ? Ajoutez-la. Rate limiting ? Une ligne. Logique custom ? Glissez-la ou vous voulez.',
    steps: [
      { icon: 'arrow_forward', label: 'Requete', type: 'incoming' },
      { icon: 'timer', label: 'Rate Limit', type: '' },
      { icon: 'shield', label: 'Auth', type: '' },
      { icon: 'tune', label: 'Custom', type: 'custom' },
      { icon: 'verified_user', label: 'Scopes', type: '' },
      { icon: 'check_circle', label: 'Validation', type: '' },
      { icon: 'speed', label: 'Backpressure', type: '' },
      { icon: 'play_arrow', label: 'Handler', type: 'handler' },
    ],
  },
  mcpServerQuickStart: {
    title: '5 Lignes vers la',
    titleAccent: 'Prod',
    subtitle: 'Pas de boilerplate. Pas de ceremonie de config. Enregistrez un tool, appelez start(), livrez.',
    tabBasic: 'Basique (STDIO)',
    tabHttp: 'HTTP + Auth',
    tabYaml: 'Config YAML',
  },

  // ========================================
  // MCP-STD (additional sections)
  // ========================================
  mcpStdQuickStart: {
    title: '3 Lignes vers la',
    titleAccent: 'Prod',
    subtitle: 'Utilisez-le comme serveur MCP autonome ou importez les outils individuellement comme librairie. A vous de choisir.',
    tabServer: 'Serveur MCP',
    tabLibrary: 'Librairie',
    tabCategory: 'Par Cat\u00e9gorie',
  },
  mcpStdCategories: {
    title: '29',
    titleAccent: 'Categories',
    subtitle: 'Des requetes base de donnees a l\'orchestration d\'agents IA, chaque outil organise et pret a l\'emploi.',
    cta: 'Parcourir les 508 outils',
  },

  // ========================================
  // ENGINE - SHGAT Section
  // ========================================
  engineShgat: {
    eyebrow: 'SHGAT-TF',
    titleLine1: 'SuperHyperGraph',
    titleLine2: 'Attention Networks',
    description:
      'Pourquoi un hypergraphe ? Les graphes classiques modelisent des relations par paires (outil A appelle outil B). Les hypergraphes modelisent le N-vers-N : un composite regroupe plusieurs leaves, un leaf appartient a plusieurs composites. Ca capture la vraie structure des ecosystemes d\'outils agentiques.',
    features: [
      {
        icon: 'hub',
        title: 'Attention K-Head (16 \u00d7 64D)',
        desc: 'Chaque tete capture un signal de pertinence different \u2014 co-occurrence, recence, recuperation d\'erreur, taux de succes. Les tetes sont combinees via des poids de fusion appris.',
      },
      {
        icon: 'account_tree',
        title: 'Message Passing Multi-Niveaux',
        desc: 'L0 : 218 leaves (outils). L1 : 26 composites. L2 : meta-composites. Le contexte propage de bas en haut puis de haut en bas. Un leaf herite de la pertinence de composites soeurs avec lesquels il n\'a jamais ete appaire.',
      },
      {
        icon: 'trending_up',
        title: 'Perte Contrastive InfoNCE',
        desc: 'Entrainement avec annealing de temperature (0.10 \u2192 0.06), negatives difficiles et replay d\'experience prioritise. Hit@3 atteint 86.3% sur 644 noeuds.',
      },
      {
        icon: 'model_training',
        title: 'Entrainement Inclus',
        desc: 'SHGAT-TF s\'entraine depuis les traces de production \u2014 aucun service externe, aucun GPU requis. libtensorflow FFI tourne nativement via Deno.dlopen. Autonome.',
      },
    ],
  },
};
