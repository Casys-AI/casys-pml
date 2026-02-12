// ============================================================
// English translations for Casys Hub Vitrine
// Organized by page/section
// ============================================================

export const en = {
  // ========================================
  // SHARED COMPONENTS
  // ========================================
  header: {
    projects: "Projects",
    whyCasys: "Why Casys",
    consulting: "Consulting",
    blog: "Blog",
    useCases: "Our Work",
    about: "About",
    contact: "Contact",
  },
  footer: {
    product: "Product",
    projects: "Projects",
    consulting: "Consulting",
    training: "Training",
    github: "GitHub",
    openSource: "Open Source",
    connect: "Connect",
    contact: "Contact",
    discord: "Discord",
    description: "Agentic Architecture & Context Systems",
    tagline: "Open Source Tools & Consulting",
  },
  subsiteFooter: {
    product: "Product",
    projects: "Projects",
    consulting: "Consulting",
    training: "Training",
    openSource: "Open Source",
    connect: "Connect",
    contact: "Contact",
    discord: "Discord",
    description: "Agentic Architecture & Context Systems",
    tagline: "Open Source Tools & Consulting",
  },

  // ========================================
  // LANDING V2 SECTIONS
  // ========================================
  hero: {
    kicker: "Agentic Architecture & Context Systems",
    titleLine1: "From Knowledge Graphs",
    titleLine2: "to MCP Servers",
    subtitle:
      "15+ years of context engineering — shipped as open-source infrastructure for your team.",
    cta: {
      primary: { text: "Work With Us", icon: "handshake", url: "#contact" },
      secondary: { text: "Explore Projects", icon: "explore", url: "#projects" },
    },
    proofs: [
      { name: "mcp-std", stat: "508 tools", url: "https://mcp-std.casys.ai" },
      { name: "mcp-server", stat: "Production auth", url: "https://mcp-server.casys.ai" },
      { name: "mcp-bridge", stat: "Telegram", url: "https://mcp-bridge.casys.ai" },
      { name: "Casys PML", stat: "Gateway", url: "https://pml.casys.ai" },
    ],
  },
  socialProof: {
    title: "Track Record",
    subtitle: "Proof of work, not promises",
    items: [
      {
        type: "stat",
        icon: "code",
        stat: "Active",
        label: "In Dev",
        description: "Casys PML - MCP Gateway with GraphRAG & DAG",
        link: {
          text: "Follow on GitHub",
          url: "https://github.com/Casys-AI/casys-pml",
        },
      },
      {
        type: "stat",
        icon: "groups",
        stat: "15+",
        label: "Years Expertise",
        description: "Context Management → Graph DBs → DAGs → MCP",
        link: {
          text: "Read Our Story",
          url: "/about",
        },
      },
      {
        type: "stat",
        icon: "public",
        stat: "French Tech",
        label: "Taiwan",
        description: "Active member of French Tech Taiwan community",
        link: {
          text: "See Our Talks",
          url: "/blog?tag=talks",
        },
      },
    ],
    githubTitle: "Open Source Track Record",
    githubCta: "See all projects on GitHub",
    repos: [
      {
        name: "@casys/mcp-server",
        description: "Production MCP server with middleware pipeline",
        stars: "★ New",
        url: "https://github.com/Casys-AI/casys-mcp-server",
      },
      {
        name: "@casys/mcp-std",
        description: "508+ tools for MCP agents",
        stars: "★ New",
        url: "https://github.com/Casys-AI/casys-mcp-std",
      },
    ],
  },
  workWithUs: {
    title: "Work With Us",
    subtitle:
      "Our tools are free and open-source. When you need help implementing them, we're here.",
    options: [
      {
        id: "explore",
        icon: "explore",
        title: "Explore",
        tagline: "Free & Open Source",
        description: "Discover our tools, read our research, join the community.",
        items: [
          {
            icon: "code",
            text: "Casys PML - Procedural Memory Layer for AI agents",
            url: "https://pml.casys.ai",
          },
          { icon: "article", text: "Blog & Technical articles", url: "/blog" },
          {
            icon: "groups",
            text: "French Tech Taiwan community",
            url: "https://www.linkedin.com/company/casys-ai",
          },
        ],
        cta: {
          text: "Explore on GitHub",
          url: "https://github.com/casys-ai",
          icon: "arrow_forward",
        },
      },
      {
        id: "learn",
        icon: "school",
        title: "Learn",
        tagline: "Training & Workshops",
        description: "Hands-on programs to master our research areas.",
        items: [
          { icon: "smart_toy", text: "Context Management for AI Agents (2-3 days)" },
          { icon: "hub", text: "Embedded Graph Databases (1-2 days)" },
          { icon: "architecture", text: "Multi-Domain AI Architectures (3-5 days)" },
        ],
        details: [
          "On-site or remote",
          "Hands-on exercises",
          "Custom materials",
        ],
        cta: {
          text: "Request Training",
          url: "#contact",
          icon: "calendar_today",
        },
      },
      {
        id: "collaborate",
        icon: "handshake",
        title: "Collaborate",
        tagline: "Consulting & Projects",
        description: "Hands-on help for your complex AI architectures.",
        items: [
          { icon: "check_circle", text: "Architecture Review & Strategy" },
          { icon: "check_circle", text: "Deployment & Custom Integrations" },
          { icon: "check_circle", text: "Performance Optimization" },
          { icon: "check_circle", text: "Pair Programming & Code Reviews" },
        ],
        engagement: "Typical engagement: 2-5 days. Remote-first, timezone-flexible.",
        highlights: [
          "Direct access to builders",
          "No minimum engagement",
          "Fast iteration",
        ],
        cta: {
          text: "Get in Touch",
          url: "#contact",
          icon: "mail",
        },
      },
    ],
  },
  whatWeDo: {
    title: "What We Do",
    subtitle: "Context engineering combining exploration, open source, and consulting",
    cards: [
      {
        id: "research",
        icon: "school",
        title: "Research & Exploration",
        subtitle: "Multi-domain AI architectures",
        description: "Knowledge Management (2013+) → Graph Databases → Modern Agentic Systems",
        researchAreas: [
          {
            name: "Knowledge Management",
            description: "15+ years building KM systems, graphs, semantic search",
          },
          {
            name: "Agentic Systems",
            description: "Context optimization, orchestration, multi-agent architectures",
          },
          {
            name: "Content Intelligence",
            description: "Graph-based content systems, automated relationships",
          },
          {
            name: "Database Systems",
            description: "Graph-based knowledge storage architectures",
          },
        ],
        philosophy: [
          {
            icon: "vertical_align_bottom",
            text: "Depth over breadth - but not afraid to explore new domains",
          },
          { icon: "public", text: "Open research - we publish what we learn" },
          { icon: "rocket_launch", text: "Practical - research that ships in production systems" },
        ],
      },
      {
        id: "opensource",
        icon: "code",
        title: "Open Source Projects",
        subtitle: "Open source tools",
        projects: ["MCP Gateway: Context management"],
        highlights: ["Open source by default", "Production-ready", "Consulting optional"],
      },
      {
        id: "consulting",
        icon: "engineering",
        title: "Consulting",
        subtitle: "Hands-on help",
        services: ["Architecture & Strategy", "Implementation & Deployment", "Training"],
        highlights: ["Flexible pricing", "No minimum engagement", "Direct builder access"],
      },
    ],
  },
  projects: {
    title: "Our Projects",
    subtitle:
      "Open source tools for the MCP ecosystem. From protocol tooling to graph intelligence.",
    featured: {
      name: "Casys PML",
      tagline: "One gateway. Any model. Full observability.",
      status: "Active Development",
      license: "AGPL-3.0",
      features: [
        {
          icon: "swap_horiz",
          name: "Model-Agnostic",
          description: "Claude, GPT, Gemini, Ollama — switch freely",
        },
        {
          icon: "visibility",
          name: "Full Observability",
          description: "Every tool call traced: cost, latency, status",
        },
        {
          icon: "auto_awesome",
          name: "Pattern Extraction",
          description: "SHGAT extracts relevance patterns from execution traces",
        },
      ],
      results: [
        { stat: "120+", label: "Capabilities in catalog" },
        { stat: "4", label: "LLM providers supported" },
        { stat: "Free", label: "Open source beta" },
      ],
      links: {
        website: "https://pml.casys.ai",
        github: "https://github.com/Casys-AI/casys-pml",
        docs: "https://pml.casys.ai/docs",
      },
    },
    categories: [
      {
        name: "MCP Infrastructure",
        items: [
          {
            id: "mcp-std",
            name: "@casys/mcp-std",
            tagline: "508 MCP Tools. One Import.",
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
            tagline: "Production MCP Server Framework",
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
            tagline: "MCP Apps to Messaging Platforms",
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
    title: "Why Casys?",
    subtitle: "What makes us different",
    differentiation: [
      {
        id: "multi-domain",
        icon: "hub",
        title: "Multi-Domain Expertise",
        description: "We connect multiple domains for unique insights",
        highlights: [
          "KM Systems (2013+) → Graph DB → AI Agents",
          "Cross-pollination creates insights",
          "Expertise compounds through tech waves",
        ],
      },
      {
        id: "continuity",
        icon: "timeline",
        title: "15+ Years Continuity",
        description: "Not AI newcomers riding the hype wave",
        highlights: [
          "15+ years track record",
          "Deep expertise, not surface-level hype",
          "Each phase builds on the last",
        ],
      },
      {
        id: "opensource",
        icon: "code_blocks",
        title: "Open Source First",
        description: "Open source by default. Tools free, consulting optional",
        highlights: [
          "Open source by default",
          "No vendor lock-in",
          "Share the research",
        ],
      },
      {
        id: "practical",
        icon: "rocket_launch",
        title: "Practical Research",
        description: "We ship production systems that solve real problems",
        highlights: [
          "Production-ready, not just prototypes",
          "Battle-tested in real environments",
          "We use our own tools",
        ],
      },
      {
        id: "accessible",
        icon: "handshake",
        title: "Accessible by Design",
        description: "No corporate overhead",
        highlights: [
          "Transparent pricing",
          "No minimum engagement sizes",
          "Direct access to builders",
        ],
      },
    ],
    bottomLine: {
      text:
        "A small firm with deep expertise across context management and agentic systems. We build real tools, share what we learn, and help teams when needed.",
      cta: {
        primary: {
          text: "Get in Touch",
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
    title: "From the Blog",
    subtitle: "Insights on AI architecture, tool orchestration, and what we are building",
    readMore: "Read",
    viewAll: "View all articles",
  },
  faq: {
    title: "Frequently Asked Questions",
    subtitle: "Everything you need to know about our projects and consulting",
    categories: ["Projects", "Consulting", "Training", "General"],
    allLabel: "All",
    faqs: [
      {
        category: "Projects",
        q: "What is Casys PML exactly?",
        a: "Casys PML is a model-agnostic MCP gateway. Build your AI workflows once, run them on Claude, GPT, Gemini, or your local Ollama. Every tool call is traced (cost, latency, status) and SHGAT extracts relevance patterns from execution data to improve tool scoring.",
      },
      {
        category: "Projects",
        q: "How is Casys PML different from other MCP tools?",
        a: "Casys PML is a unified gateway, not just an MCP client. It offers: (1) Switch LLM providers on the fly (no vendor lock-in), (2) Full observability on every tool call with cost and latency tracking, (3) Graph-based pattern extraction — SHGAT scores tool relevance from execution traces. The only MCP gateway combining model-agnostic routing + observability + graph attention scoring.",
      },
      {
        category: "Projects",
        q: "Which LLM models are supported?",
        a: "Claude (Anthropic), GPT (OpenAI), Gemini (Google), and Ollama (local/self-hosted). PML acts as a gateway: switch providers without rewriting your workflows. The catalog contains 120+ ready-to-use capabilities.",
      },
      {
        category: "Projects",
        q: "Is Casys PML open source?",
        a: "Yes. AGPL-3.0 license. You can self-host for free forever, read the code, modify it, contribute. Managed service is optional for teams that want cloud sync and collaboration.",
      },
      {
        category: "Projects",
        q: "What's the status of Casys PML?",
        a: "Active development. Core is functional: GraphRAG discovery, DAG orchestration with parallel execution, isolated TypeScript sandbox, real-time observability. Deno 2.x + PGlite architecture. Follow progress on GitHub.",
      },
      {
        category: "Consulting",
        q: "What does consulting include?",
        a: "Architecture review, deployment help, custom MCP integrations, context strategy design, team training. We work hands-on with your codebase. Flexible options: short workshops, custom projects, ongoing partnerships, and custom enterprise programs.",
      },
      {
        category: "Consulting",
        q: "Why should I hire Casys vs big consultancies?",
        a: "We're the people who build Casys PML. We code the systems we recommend. You get direct access to technical experts, not account managers. Faster iteration, accessible entry points, no heavy minimum engagements like big consultancies.",
      },
      {
        category: "Consulting",
        q: "Do you only work with Casys PML or other architectures too?",
        a: "We work with any agentic architecture. If you're not using Casys PML, that's fine. Our expertise is Context Management, Graph DBs, DAG orchestration. We help you design the best solution for your use case.",
      },
      {
        category: "Training",
        q: "What training do you offer?",
        a: "Agentic Architecture Workshop (2-3 days), Casys PML Hands-On Training (1 day), Context Management Fundamentals (1/2 day). All programs are customized to your tech stack and use cases.",
      },
      {
        category: "Training",
        q: "Where do you deliver training?",
        a: "On-site (Taiwan, Asia-Pacific), Remote (worldwide), or Hybrid. We partner with Alegria Group for regular workshops in Taiwan and participate in French Tech Taiwan events.",
      },
      {
        category: "General",
        q: "What's the Casys business model?",
        a: "Three pillars: (1) Open source tools (Casys PML, mcp-std, mcp-server — free forever), (2) Consulting (workshops, architecture review, deployment help), (3) Training (custom programs). The tools prove the expertise; the consulting applies it to your specific context.",
      },
      {
        category: "General",
        q: "Who is Casys for?",
        a: "CTOs, Tech Leads, Engineering Managers at companies building AI agents and agentic systems. If you're dealing with context management, tool orchestration, or knowledge graph challenges, we can help.",
      },
      {
        category: "General",
        q: "What's your expertise background?",
        a: '15+ years in context engineering, from Knowledge Management to Graph Databases to DAG architectures to MCP ecosystems. We\'ve been doing this since before it was called "Context Management for AI agents".',
      },
      {
        category: "General",
        q: "How are your engagements structured?",
        a: "We offer several flexible options: focused workshops (1 day), custom projects (full deployment), or ongoing partnerships (direct access to practitioners). No heavy minimum engagements. We optimize for iteration speed and accessibility, not margin maximization. Contact us to discuss your specific needs.",
      },
    ],
  },
  finalCta: {
    title: "Ready to Optimize Your Agentic Architecture?",
    subtitle: "Choose how you want to work with us",
    ctas: [
      {
        icon: "rocket_launch",
        text: "Try Casys PML",
        subtext: "Open source — install in 30 seconds",
        url: "https://pml.casys.ai",
      },
      {
        icon: "mail",
        text: "Get in Touch",
        subtext: "Questions & architecture help",
        url: "#contact",
      },
    ],
    trustBadges: [
      { icon: "check_circle", text: "AGPL-3.0 Open Source" },
      { icon: "check_circle", text: "15+ years expertise" },
      { icon: "check_circle", text: "Accessible pricing" },
    ],
  },
  contact: {
    title: "Ready to Get Started?",
    subtitle:
      "Book a consulting call, request training, or discuss your architecture challenges. 24h response time.",
    namePlaceholder: "Your name",
    emailPlaceholder: "Your work email",
    messagePlaceholder:
      "I want to book a consulting call / request training / discuss an architecture challenge",
    submitButton: "Send my request",
    sending: "Sending...",
    successMessage: "Request received! We'll get back to you within 24h.",
    errorMessage: "Error sending message. Please try again.",
    hiddenSubject: "New CASYS contact request",
  },

  // ========================================
  // SUBSITE: ENGINE
  // ========================================
  engineHeader: {
    howItWorks: "How It Works",
    shgat: "SHGAT",
    benchmarks: "Benchmarks",
    links: "Links",
    docs: "Docs",
    workWithUs: "Work With Us",
  },
  engineHero: {
    tagline: "ML COMPUTATION LAYER",
    heroTitle1: "Score, Rank, Build Paths",
    heroTitle2: "No LLM Required",
    heroSubtitle:
      "SHGAT attention networks score tool relevance across a hypergraph hierarchy. Multi-level message passing, K-head attention, zero LLM calls. Deterministic. Observable. Runs on your hardware.",
    statTools: "Nodes indexed",
    statHit: "Hit@3",
    statLatency: "Score latency",
    ctaPrimary: "How It Works",
    ctaDocs: "Documentation",
    ctaSecondary: "GitHub",
  },

  // ========================================
  // SUBSITE: MCP-SERVER
  // ========================================
  mcpServerHeader: {
    features: "Features",
    quickstart: "Quick Start",
    pipeline: "Pipeline",
    install: "Install",
    docs: "Docs",
    workWithUs: "Work With Us",
  },
  mcpServerHero: {
    tagline: "The Hono for MCP",
    heroTitle1: "Ship MCP Servers",
    heroTitle2: "That Actually Scale",
    heroSubtitle:
      "Stop reinventing auth, rate limiting, and middleware for every MCP server. One framework, composable by default, production-ready from day one.",
    statFeatures: "Built-in features",
    statTests: "Tests passing",
    statRelease: "Latest",
    ctaPrimary: "Get Started",
    ctaSecondary: "View on JSR",
    ctaDocs: "Documentation",
  },
  mcpServerInstall: {
    title: "Ready",
    titleAccent: "When You Are",
    subtitle:
      "One command. Works with Deno and Node.js. Published on JSR, the modern JavaScript registry.",
    jsrLabel: "JSR Registry",
    githubLabel: "GitHub",
    docsLabel: "Documentation",
    builtWith: "Built with",
  },

  // ========================================
  // SUBSITE: MCP-STD
  // ========================================
  mcpStdHeader: {
    categories: "Categories",
    catalog: "Catalog",
    quickstart: "Quick Start",
    install: "Install",
    workWithUs: "Work With Us",
  },
  mcpStdHero: {
    tagline: "The MCP Standard Toolbox",
    heroTitle1: "508 Tools.",
    heroTitle2: "One Import.",
    heroSubtitle:
      "Database, git, docker, crypto, text, network, AI agents \u2014 every utility you'd write yourself, already tested and typed.",
    statTools: "Tools",
    statCategories: "Categories",
    statRelease: "Latest",
    ctaPrimary: "Browse Catalog",
    ctaSecondary1: "Quick Start",
    ctaSecondary2: "View on JSR",
  },
  mcpStdInstall: {
    title: "Ready When",
    titleAccent: "You Are",
    subtitle: "One command. Works with Deno. Published on JSR, the modern JavaScript registry.",
    denoLabel: "Deno",
    binaryLabel: "Binary",
    jsrLabel: "JSR Registry",
    githubLabel: "GitHub",
    builtWith: "Built with",
  },

  // ========================================
  // PML LANDING
  // ========================================
  pmlHero: {
    eyebrow: "Procedural Memory for AI Agents",
    titleLine1: "One gateway. Any model.",
    titleAccent: "Full observability.",
    description:
      "Build AI workflows once, run them with Claude, GPT, Gemini, or your local Ollama. Every tool call traced. Debug in seconds, not hours.",
    ctaPrimary: "Get Started",
    ctaSecondary: "Read the Docs",
    pillars: ["Model-Agnostic", "Full Traceability", "Pattern Extraction"],
    traceHeader: "workflow:ci-deploy",
    traceLive: "live",
    traceCalls: "22 calls",
    traceModels: "3 models",
    traceCost: "$0.028",
  },
  pmlArchitecture: {
    eyebrow: "Architecture",
    title: "How it works",
    description:
      "A unified gateway sits between your LLM and the tools it needs. Every request is decomposed into a directed acyclic graph, executed inside a sandbox, and fully traced.",
    clients: {
      label: "Clients",
      items: ["Claude", "GPT", "Gemini", "Ollama", "Any LLM"],
    },
    gateway: {
      label: "PML Gateway",
      pipeline: ["Registry", "DAG", "Sandbox"],
      extras: ["Symbolic World Model", "Observability"],
    },
    servers: {
      label: "MCP Servers",
      items: ["filesystem", "postgres", "github", "memory", "Any Tools"],
    },
    pillars: [
      { label: "Model-Agnostic", description: "Works with any LLM provider" },
      { label: "Observability", description: "Full trace of every action" },
      { label: "Symbolic Reasoning", description: "Symbolic reasoning layer" },
    ],
    mobileArrow: "flows to",
  },
  pmlCatalogPreview: {
    label: "Catalog",
    browseCta: "Browse Full Catalog",
  },
  pmlQuickStart: {
    label: "Quick Start",
    title: "Up and running in 3 steps",
    subtitle: "Add procedural memory to Claude Code in under a minute.",
    docsLink: "Read the full docs",
    steps: [
      {
        number: "01",
        title: "Install PML",
        description: "One command. No dependencies. Works on macOS, Linux, and WSL.",
        file: "terminal",
      },
      {
        number: "02",
        title: "Initialize your project",
        description: "PML creates a local config and connects to your environment.",
        file: "terminal",
      },
      {
        number: "03",
        title: "Use with Claude Code",
        description: "PML tools are available automatically. Discover, execute, and learn.",
        file: "claude-code",
      },
    ],
  },
  pmlIsolation: {
    eyebrow: "Security",
    titleLine1: "Autonomous,",
    titleLine2: "not reckless.",
    description:
      "Every AI action runs inside an isolated sandbox with resource limits. Dangerous operations pause for human approval before touching production systems.",
    features: [
      {
        id: "sandbox",
        title: "Sandboxed Execution",
        description:
          "Code runs in isolated workers with no direct access to the host system or network.",
      },
      {
        id: "hil",
        title: "Human-in-the-Loop",
        description:
          "Dangerous actions like file writes or database mutations require explicit approval before execution.",
      },
      {
        id: "audit",
        title: "Audit Trail",
        description:
          "Every action is logged with full context for transparency and post-mortem analysis.",
      },
    ],
    svg: {
      sandbox: "SANDBOX",
      checkpoint: "CHECKPOINT",
      protected: "PROTECTED",
      aiActions: "AI ACTIONS",
      toolsData: "TOOLS & DATA",
      approve: "APPROVE?",
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
    eyebrow: "Early Access",
    title: "Join the Beta",
    description: "Be among the first to give your agents procedural memory.",
    labelName: "Name",
    labelEmail: "Email",
    labelUseCase: "How will you use PML?",
    placeholderName: "Your name",
    placeholderEmail: "you@company.com",
    placeholderUseCase:
      "e.g. I want to give my Claude Code agent long-term memory for recurring DevOps workflows...",
    submit: "Request Access",
    sending: "Sending...",
    successMessage: "You're on the list! We'll reach out soon.",
    errorMessage: "Something went wrong. Please try again.",
    hiddenSubject: "PML Beta Access Request",
  },
  pmlCta: {
    title: "Ready to try?",
    description: "Give your agents procedural memory. Start building observable workflows today.",
    primaryCta: "Get Started",
    secondaryCta: "Request Beta Access",
  },
  pmlIntelligence: {
    eyebrow: "Pattern Extraction",
    titleLine1: "Every execution",
    titleLine2: "leaves a trace.",
    description:
      "PML records full execution traces — tool sequences, latencies, error paths. SHGAT extracts relevance patterns from this data. Deterministic, inspectable, no black box.",
    features: [
      {
        icon: "hub",
        title: "Execution Traces",
        desc:
          "Every workflow run is fully logged: tool calls, inputs, outputs, timing, costs. The data stays on your infrastructure.",
      },
      {
        icon: "auto_awesome",
        title: "Graph Attention Scoring",
        desc:
          "SHGAT processes trace data to score tool relevance. K-head attention across the hypergraph hierarchy. No LLM calls.",
      },
      {
        icon: "recommend",
        title: "Co-occurrence Patterns",
        desc:
          "Tools that frequently run together surface automatically. Statistical co-occurrence, not guesswork.",
      },
    ],
  },

  // ========================================
  // ENGINE (additional sections)
  // ========================================
  engineLinks: {
    title: "Part of the",
    titleAccent: "PML Ecosystem",
    subtitle: "The engine runs inside PML. Self-hosted, open source, no external API calls.",
    jsrLabel: "JSR",
    githubLabel: "GitHub",
    docsLabel: "Docs",
    pmlLabel: "PML",
    builtWith: "Built with",
  },
  engineBenchmarks: {
    title: "Numbers,",
    titleAccent: "Not Promises",
    subtitle:
      "Benchmarked on 245 nodes (218 leaves + 26 composites + 1 root). All metrics from production traces.",
    shgatTitle: "SHGAT-TF",
    shgatRows: [
      ["Hit@1", "56.2%"],
      ["Hit@3", "86.3%"],
      ["MRR", "0.705"],
      ["Leaves (L0)", "218"],
      ["Composites (L1)", "26"],
      ["Attention heads", "16 \u00d7 64D"],
      ["Hierarchy levels", "3 (L0 \u2192 L1 \u2192 L2)"],
      ["Score latency", "2.3s"],
    ],
  },
  engineHowItWorks: {
    title: "From Intent to",
    titleAccent: "Ranked Tools",
    subtitle:
      "One model, one pipeline. SHGAT scores tool relevance across the full hierarchy, then the DAG executor runs the top-ranked tools.",
    steps: [
      { icon: "search", label: "Intent", sublabel: "user query", type: "incoming" },
      { icon: "text_fields", label: "Embed", sublabel: "BGE-M3 1024D", type: "" },
      { icon: "hub", label: "SHGAT Score", sublabel: "K-head \u00d7 16", type: "" },
      { icon: "format_list_numbered", label: "Rank", sublabel: "top-K tools", type: "" },
      { icon: "play_arrow", label: "Execute", sublabel: "DAG runner", type: "handler" },
    ],
  },

  // ========================================
  // MCP-SERVER (additional sections)
  // ========================================
  mcpServerComparison: {
    title: "SDK vs",
    titleAccent: "Framework",
    subtitle: "The official SDK gives you the protocol. This gives you the production stack.",
    colSdk: "Official SDK",
    colFramework: "@casys/mcp-server",
    rows: [
      ["MCP protocol", true, true],
      ["Middleware pipeline", false, true],
      ["OAuth2 / JWT auth", false, true],
      ["Rate limiting", false, true],
      ["Schema validation", false, true],
      ["Streamable HTTP + SSE", "Manual", "Built-in"],
      ["Concurrency control", false, true],
      ["OpenTelemetry tracing", false, true],
      ["Prometheus metrics", false, true],
      ["MCP Apps (UI resources)", "Manual", "Built-in"],
      ["CORS allowlist", false, true],
      ["Body size limit (413)", false, true],
      ["IP rate limiting (429)", false, true],
      ["Session propagation", false, true],
      ["HMAC message signing", false, true],
      ["CSP injection", false, true],
      ["YAML + Env config", false, true],
      ["Deno + Node.js", "Node only", "Both"],
    ],
  },
  mcpServerFeatures: {
    title: "Batteries",
    titleAccent: "Included",
    subtitle: "Everything between the request and your handler -- handled.",
    features: [
      { icon: "swap_horiz", name: "Dual Transport", desc: "STDIO + Streamable HTTP. Same code." },
      { icon: "layers", name: "Middleware Pipeline", desc: "Composable onion model, like Koa." },
      { icon: "shield", name: "OAuth2 Auth", desc: "JWT/Bearer + RFC 9728 metadata." },
      { icon: "key", name: "OIDC Presets", desc: "GitHub, Google, Auth0 -- one line." },
      {
        icon: "settings",
        name: "YAML + Env Config",
        desc: "File config, env overrides at deploy.",
      },
      { icon: "speed", name: "Concurrency", desc: "Backpressure: sleep, queue, or reject." },
      { icon: "timer", name: "Rate Limiting", desc: "Sliding window, per-client isolation." },
      {
        icon: "check_circle",
        name: "Schema Validation",
        desc: "JSON Schema via ajv at registration.",
      },
      { icon: "monitoring", name: "Observability", desc: "OTel spans + Prometheus /metrics." },
      { icon: "widgets", name: "MCP Apps", desc: "Serve interactive UIs via ui:// scheme." },
      { icon: "lock", name: "CORS Allowlist", desc: "Origin allowlist with wildcard warnings." },
      {
        icon: "upload_file",
        name: "Body Size Limit",
        desc: "maxBodyBytes with 413 JSON-RPC errors.",
      },
      { icon: "block", name: "IP Rate Limit", desc: "Per-IP 429 + Retry-After on HTTP layer." },
      {
        icon: "badge",
        name: "Session Propagation",
        desc: "sessionId flows into middleware context.",
      },
      {
        icon: "enhanced_encryption",
        name: "HMAC Signing",
        desc: "SHA-256 sign/verify + anti-replay for PostMessage.",
      },
      {
        icon: "security",
        name: "CSP Injection",
        desc: "Auto-inject Content-Security-Policy in MCP Apps.",
      },
    ],
  },
  mcpServerPipeline: {
    title: "Your Server,",
    titleAccent: "Your Rules",
    subtitle:
      "Every request flows through a composable middleware chain. Need auth? Drop it in. Rate limiting? One line. Custom logic? Slot it anywhere.",
    steps: [
      { icon: "arrow_forward", label: "Request", type: "incoming" },
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
    title: "5 Lines to",
    titleAccent: "Production",
    subtitle: "No boilerplate. No config ceremony. Register a tool, call start(), ship it.",
    tabBasic: "Basic (STDIO)",
    tabHttp: "HTTP + Auth",
    tabYaml: "YAML Config",
  },

  // ========================================
  // MCP-STD (additional sections)
  // ========================================
  mcpStdQuickStart: {
    title: "3 Lines to",
    titleAccent: "Production",
    subtitle:
      "Use it as a standalone MCP server or import individual tools as a library. Your call.",
    tabServer: "As MCP Server",
    tabLibrary: "As Library",
    tabCategory: "By Category",
  },
  mcpStdCategories: {
    title: "29",
    titleAccent: "Categories",
    subtitle:
      "From database queries to AI agent orchestration, every tool organized and ready to use.",
    cta: "Browse all 508 tools",
  },

  // ========================================
  // ENGINE - SHGAT Section
  // ========================================
  engineShgat: {
    eyebrow: "SHGAT-TF",
    titleLine1: "SuperHyperGraph",
    titleLine2: "Attention Networks",
    description:
      "Why a hypergraph? Regular graphs model pairwise relations (tool A calls tool B). Hypergraphs model N-to-N: one composite groups multiple leaves, one leaf belongs to multiple composites. This captures the real structure of agentic tool ecosystems.",
    features: [
      {
        icon: "hub",
        title: "K-Head Attention (16 \u00d7 64D)",
        desc:
          "Each head captures a different relevance signal \u2014 co-occurrence, recency, error recovery, success rates. Heads are combined via learned fusion weights.",
      },
      {
        icon: "account_tree",
        title: "Multi-Level Message Passing",
        desc:
          "L0: 218 leaves (tools). L1: 26 composites. L2: meta-composites. Context propagates bottom-up then top-down. A leaf inherits relevance from sibling composites it has never been paired with.",
      },
      {
        icon: "trending_up",
        title: "InfoNCE Contrastive Loss",
        desc:
          "Temperature-annealed training (0.10 \u2192 0.06) with hard negatives and prioritized experience replay. Hit@3 reaches 86.3% on 644 nodes.",
      },
      {
        icon: "model_training",
        title: "Training Included",
        desc:
          "SHGAT-TF trains from production traces \u2014 no external service, no GPU required. libtensorflow FFI runs natively via Deno.dlopen. Self-contained.",
      },
    ],
  },

  // ========================================
  // ABOUT PAGE
  // ========================================
  about: {
    pageTitle: "About",
    heroName: "Erwan Lee Pesle",
    heroTitle: "Founder & System Architect, Casys",
    heroBio:
      "We have been building systems that connect knowledge to action for over fifteen years \u2014 from early chatbots on mIRC, to enterprise knowledge management, to graph attention networks for tool relevance. When LLMs arrived, the problem didn't change: context in, action out. MCP is the latest expression of that principle, and the most consequential. Casys AI helps engineering teams ship reliable AI integrations \u2014 no vendor lock-in, no black boxes.",
    expertiseTitle: "What We Do",
    expertiseSubtitle:
      "Infrastructure that connects AI systems to real-world data, tools, and workflows \u2014 built for production observability and determinism.",
    areas: [
      {
        icon: "hub",
        title: "Knowledge Graphs",
        description:
          "Schema design, query optimization, and graph-native architectures. Neo4j Professional Developer certified. From ontology modeling to production-grade graph pipelines.",
      },
      {
        icon: "database",
        title: "Graph Databases",
        description:
          "Modeling complex relationships that relational databases cannot express. We design, deploy, and optimize Neo4j instances handling real production traffic.",
      },
      {
        icon: "smart_toy",
        title: "Agentic Systems",
        description:
          "Tool orchestration, context routing, and execution reliability. We architect multi-agent systems where every decision is traceable and every failure is recoverable.",
      },
      {
        icon: "cable",
        title: "MCP Infrastructure",
        description:
          "Server architecture, connector design, and protocol-level optimization. 500+ open-source tools shipped. We build MCP layers that are observable, testable, and production-ready.",
      },
    ],
    philosophyTitle: "How We Work",
    principles: [
      {
        icon: "code",
        title: "Open Source as Foundation",
        description:
          "Our core tooling is open source. Clients get solutions built on code they can inspect, fork, and own. No vendor lock-in, no black boxes.",
      },
      {
        icon: "science",
        title: "Research That Ships",
        description:
          "We publish what we learn and ship what we build. Every technique we recommend has been tested against real workloads, not just benchmarks.",
      },
      {
        icon: "emoji_objects",
        title: "Context Over Hype",
        description:
          'We don\'t sell "AI transformation." We solve specific infrastructure problems with specific engineering methods. The work speaks for itself.',
      },
    ],
    ctaTitle: "Start With a Problem",
    ctaSubtitle:
      "Describe your MCP infrastructure challenge, your knowledge graph bottleneck, or your agentic system design question. We'll tell you straight whether we can help \u2014 and exactly how we'd approach it.",
    ctaPrimary: {
      text: "Get in Touch",
      url: "/#contact",
      icon: "mail",
    },
    ctaSecondary: {
      text: "View Projects",
      url: "/#projects",
      icon: "folder_open",
    },
  },

  // ========================================
  // SUBSITE: MCP-BRIDGE
  // ========================================
  mcpBridgeHeader: {
    features: "Features",
    architecture: "Architecture",
    quickstart: "Quick Start",
    install: "Install",
    docs: "Docs",
    workWithUs: "Work With Us",
  },
  mcpBridgeHero: {
    tagline: "MCP Apps \u2192 Messaging Platforms",
    heroTitle1: "MCP Apps Meet",
    heroTitle2: "2B+ Chat Users",
    heroSubtitle:
      "Turn any MCP App into a Telegram Mini App. Zero code changes. Same tool, new audience.",
    statTests: "Tests passing",
    statPlatforms: "Platform",
    statRelease: "Latest",
    ctaPrimary: "Get Started",
    ctaSecondary: "View on JSR",
    ctaDocs: "Documentation",
  },
  mcpBridgeFeatures: {
    title: "Bridge the",
    titleAccent: "Gap",
    subtitle: "Everything you need to bring MCP Apps from developer tools to messaging platforms.",
    features: [
      {
        icon: "code_off",
        name: "Zero Code Changes",
        desc: "Existing MCP Apps work as-is. No rewrites.",
      },
      {
        icon: "layers",
        name: "3-Layer Architecture",
        desc: "Client, Resource Server, MCP Server.",
      },
      {
        icon: "swap_horiz",
        name: "Protocol Translation",
        desc: "JSON-RPC 2.0 over WebSocket, seamless.",
      },
      {
        icon: "smart_toy",
        name: "Telegram Mini Apps",
        desc: "Full theme, viewport, auth support.",
      },
      {
        icon: "more_horiz",
        name: "More Platforms",
        desc: "LINE, Discord, WhatsApp — coming soon.",
      },
      {
        icon: "shield",
        name: "CSP Enforcement",
        desc: "Strict Content-Security-Policy by default.",
      },
      { icon: "key", name: "Session Auth", desc: "Crypto-secure tokens, HMAC validation." },
      { icon: "sync", name: "WebSocket Transport", desc: "Real-time bidirectional communication." },
      { icon: "palette", name: "Theme Mapping", desc: "Platform themes auto-mapped to MCP Apps." },
      {
        icon: "extension",
        name: "Extensible Adapters",
        desc: "Add Discord, WhatsApp, or any platform.",
      },
    ],
  },
  mcpBridgeArchitecture: {
    title: "How It",
    titleAccent: "Works",
    subtitle:
      "The bridge intercepts postMessage calls from your MCP App, routes them through a WebSocket to the Resource Server, which forwards tool calls to your unmodified MCP Server.",
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
    title: "Custom Build vs",
    titleAccent: "Bridge",
    subtitle:
      "Skip months of integration work. The bridge handles the hard parts so you ship faster.",
    colCustom: "Custom Integration",
    colBridge: "@casys/mcp-bridge",
    rows: [
      ["Code changes to MCP App", "Rewrite needed", "None"],
      ["Platform auth (Telegram)", "Manual HMAC", "Built-in"],
      ["Content Security Policy", "Manual headers", "Auto-generated"],
      ["WebSocket management", "From scratch", "Built-in"],
      ["Theme synchronization", "Manual mapping", "Automatic"],
      ["Multi-platform support", "Per-platform code", "Adapter pattern"],
      ["Session management", "Custom implementation", "Crypto-secure"],
      ["HTML injection (bridge.js)", "N/A", "Automatic"],
    ],
  },
  mcpBridgeQuickStart: {
    title: "Deploy to",
    titleAccent: "Telegram",
    subtitle:
      "Your MCP App running inside Telegram in three steps. No changes to your existing code.",
    tabTelegram: "Telegram",
    tabLine: "Coming Soon",
  },
  mcpBridgeInstall: {
    title: "Ready",
    titleAccent: "When You Are",
    subtitle:
      "One command. Works with Deno and Node.js. Published on JSR, the modern JavaScript registry.",
    jsrLabel: "JSR Registry",
    githubLabel: "GitHub",
    docsLabel: "Documentation",
    builtWith: "Built with",
  },

  // ========================================
  // USE CASES PAGE
  // ========================================
  useCases: {
    pageTitle: "Our Work",
    heroTitle: "Our Work",
    heroSubtitle:
      "We build MCP infrastructure for production. Here's what that looks like — real challenges, real solutions, real metrics.",
    labelChallenge: "Challenge",
    labelApproach: "Solution",
    labelResult: "Result",
    labelStack: "Stack",
    ctaTitle: "Have a Similar Challenge?",
    ctaSubtitle:
      "Describe your MCP infrastructure challenge. We'll tell you straight whether we can help — and exactly how we'd approach it.",
    ctaPrimary: { text: "Get in Touch", url: "/#contact", icon: "mail" },
    ctaSecondary: { text: "View Projects", url: "/#projects", icon: "folder_open" },
  },
} as const;
