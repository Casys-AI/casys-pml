// ============================================================
// Chinese translations for Casys Hub Vitrine
// Organized by page/section
// ============================================================

import type { Translations } from "./index";

export const zh: Translations = {
  // ========================================
  // SHARED COMPONENTS
  // ========================================
  header: {
    projects: "项目",
    whyCasys: "为什么选择 Casys",
    consulting: "咨询服务",
    blog: "Blog",
    useCases: "我们的工作",
    about: "关于我们",
    contact: "联系我们",
    projectDescriptions: {
      erpnext: "交互式 ERPNext 工作流演示",
      pml: "轨迹、路由与学习到的相关性",
      std: "508 个标准 MCP 工具",
      server: "生产级 MCP 服务器框架",
      bridge: "MCP 应用连接消息平台",
    },
  },
  footer: {
    product: "产品",
    projects: "项目",
    consulting: "咨询服务",
    training: "培训",
    github: "GitHub",
    openSource: "开源项目",
    connect: "链接",
    contact: "联系我们",
    discord: "Discord",
    description: "智能体架构与上下文系统",
    tagline: "开源工具 & 咨询服务",
  },
  subsiteFooter: {
    product: "产品",
    projects: "项目",
    consulting: "咨询服务",
    training: "培训",
    openSource: "开源项目",
    connect: "链接",
    contact: "联系我们",
    discord: "Discord",
    description: "智能体架构与上下文系统",
    tagline: "开源工具 & 咨询服务",
  },

  // ========================================
  // LANDING V2 SECTIONS
  // ========================================
  hero: {
    kicker: "面向真实工作流的可靠 AI 集成",
    titleLine1: "真正值得信赖的",
    titleLine2: "AI 工作流",
    subtitle: "面向真实工作流的可观测 MCP 基础设施。追踪每一次调用，执行前完成校验，并按你的方式部署。",
    cta: {
      primary: { text: "查看证明", icon: "play_circle", url: "#featured-demo" },
      secondary: { text: "探索技术栈", icon: "deployed_code", url: "#projects" },
    },
    proofs: [
      { name: "追踪每次调用", stat: "成本、延迟、状态", url: "#what-we-do" },
      { name: "执行前校验", stat: "运行前的护栏", url: "#what-we-do" },
      { name: "开源技术栈", stat: "已发布的构件", url: "#projects" },
      { name: "查看真实证明", stat: "ERPNext 工作流演示", url: "#featured-demo" },
    ],
  },
  featuredDemo: {
    title: "看实际效果",
    subtitle: "一个真实工作流，比模糊的平台承诺更有说服力。",
    eyebrow: "现场演示",
    name: "MCP ERPNext",
    tagline: "建立在真实业务流程之上的交互式 MCP 应用。",
    description:
      "我们不要求访客去想象未来，而是直接展示一个可以检查的工作流：一个由智能体连接的 ERP 界面，背后有可观测的执行路径。",
    bullets: [
      "可点击的看板和业务动作，不只是聊天界面截图。",
      "公开开发，并且已经在 GitHub 上获得了早期关注。",
      "这是 Casys 处理业务工作流的一种具体示例。",
    ],
    stats: [
      { value: "真实 UI", label: "可点击工作流界面" },
      { value: "可观测", label: "底层执行可见" },
      { value: "公开构建", label: "已经在 GitHub 获得关注" },
    ],
    note: "ERPNext 只是一个例子。同样的方法也可以应用到其他业务工作流。",
    cta: {
      primary: { text: "打开 MCP ERPNext", icon: "open_in_new", url: "/zh/mcp-erpnext" },
      secondary: { text: "联系我们", icon: "mail", url: "#contact" },
    },
    video: {
      src: "/videos/Connecting Your LLM to ERPNext in 30 Seconds! 🚀.mp4",
      caption: "MCP ERPNext 工作流短视频演示。",
    },
  },
  socialProof: {
    title: "实际成果",
    subtitle: "用成果说话,不靠承诺",
    items: [
      {
        type: "stat",
        icon: "code",
        stat: "活跃",
        label: "开发中",
        description: "Casys PML - 集成 GraphRAG 和 DAG 的 MCP Gateway",
        link: {
          text: "在 GitHub 上关注",
          url: "https://github.com/Casys-AI/casys-pml",
        },
      },
      {
        type: "stat",
        icon: "groups",
        stat: "15+",
        label: "年经验",
        description: "Context Management → Graph DBs → DAGs → MCP",
        link: {
          text: "了解我们的故事",
          url: "/about",
        },
      },
      {
        type: "stat",
        icon: "public",
        stat: "French Tech",
        label: "台湾",
        description: "French Tech Taiwan 社区活跃成员",
        link: {
          text: "查看演讲",
          url: "/blog?tag=talks",
        },
      },
    ],
    githubTitle: "开源成果",
    githubCta: "查看所有 GitHub 项目",
    repos: [
      {
        name: "@casys/mcp-server",
        description: "生产级 MCP 服务器，支持中间件管道",
        stars: "★ New",
        url: "https://github.com/Casys-AI/casys-mcp-server",
      },
      {
        name: "@casys/mcp-std",
        description: "508+ MCP 代理工具",
        stars: "★ New",
        url: "https://github.com/Casys-AI/casys-mcp-std",
      },
      {
        name: "@casys/mcp-erpnext",
        description: "面向 MCP 应用的交互式 ERPNext 工作流",
        stars: "★ 增长中",
        url: "https://github.com/Casys-AI/mcp-erpnext",
      },
    ],
  },
  workWithUs: {
    title: "与我们合作",
    subtitle: "我们的工具免费开源。当您需要部署帮助时，我们随时为您服务。",
    options: [
      {
        id: "explore",
        icon: "explore",
        title: "探索",
        tagline: "免费与开源",
        description: "了解我们的工具，阅读研究，加入社区。",
        items: [
          { icon: "code", text: "Casys PML - AI 代理的程序记忆层", url: "https://pml.casys.ai" },
          { icon: "article", text: "博客与技术文章", url: "/blog" },
          {
            icon: "groups",
            text: "French Tech Taiwan 社区",
            url: "https://www.linkedin.com/company/casys-ai",
          },
        ],
        cta: {
          text: "在 GitHub 上探索",
          url: "https://github.com/casys-ai",
          icon: "arrow_forward",
        },
      },
      {
        id: "learn",
        icon: "school",
        title: "学习",
        tagline: "培训与工作坊",
        description: "掌握我们研究领域的实操课程。",
        items: [
          { icon: "smart_toy", text: "AI 代理上下文管理 (2-3天)" },
          { icon: "hub", text: "嵌入式图数据库 (1-2天)" },
          { icon: "architecture", text: "多领域 AI 架构 (3-5天)" },
        ],
        details: ["现场或远程", "实操练习", "定制教材"],
        cta: { text: "申请培训", url: "#contact", icon: "calendar_today" },
      },
      {
        id: "collaborate",
        icon: "handshake",
        title: "合作",
        tagline: "咨询与项目",
        description: "为您复杂的 AI 架构提供实操帮助。",
        items: [
          { icon: "check_circle", text: "架构评审与策略" },
          { icon: "check_circle", text: "部署与定制集成" },
          { icon: "check_circle", text: "性能优化" },
          { icon: "check_circle", text: "结对编程与代码审查" },
        ],
        engagement: "典型项目周期：2-5天。远程优先，时区灵活。",
        highlights: ["直接对接开发者", "无最低承诺", "快速迭代"],
        cta: { text: "联系我们", url: "#contact", icon: "mail" },
      },
    ],
  },
  whatWeDo: {
    title: "底层机制",
    subtitle: "真正的差异不在单个演示，而在背后的学习层和可观测性。",
    cards: [
      {
        id: "research",
        icon: "hub",
        title: "PML 学习层",
        subtitle: "基于执行轨迹的路由与工作流记忆",
        description: "PML 将执行轨迹变成可学习的一层，用于工具选择、可观测性与可复用的工作流模式。",
        researchAreas: [
          {
            name: "轨迹采集",
            description: "记录工具调用、结果、成本、延迟以及执行结构。",
          },
          {
            name: "学习相关性",
            description: "SHGAT + GRU 从真实运行中学习哪些工具真正重要。",
          },
          {
            name: "工作流记忆",
            description: "重复出现的执行模式变成可以复用的操作知识。",
          },
          {
            name: "人工检查",
            description: "当工作流失败或漂移时，可观测性让系统依然可读。",
          },
        ],
        philosophy: [
          { icon: "vertical_align_bottom", text: "研究必须和可交付系统绑定" },
          { icon: "public", text: "从轨迹学习，而不是依赖提示词经验主义" },
          { icon: "rocket_launch", text: "让高级行为对团队来说仍然可检查" },
        ],
      },
      {
        id: "opensource",
        icon: "code",
        title: "可观测性与护栏",
        subtitle: "执行前和执行中",
        projects: [
          "端到端追踪每一次调用",
          "在运行前校验工具边界",
          "让路由逻辑可见，而不是神秘化",
        ],
        highlights: ["更少盲点", "该确定的地方保持确定", "支持自托管"],
      },
      {
        id: "consulting",
        icon: "engineering",
        title: "工作流架构落地",
        subtitle: "从技术栈到实际运营",
        services: ["ERP 与业务系统集成", "MCP 服务器与应用架构", "部署、评审与加固"],
        highlights: ["直接对接构建者", "快速迭代", "先有证明，再谈咨询"],
      },
    ],
  },
  projects: {
    title: "开源技术栈",
    subtitle: "支撑这些工作流的已发布构件。",
    linkLabels: {
      proof: "查看演示",
      github: "GitHub",
      docs: "文档",
    },
    featured: {
      name: "Casys MCP 技术栈",
      tagline: "面向生产环境的可观测 AI 工具集成组件。",
      status: "已发布",
      license: "JSR + npm",
      features: [
        {
          icon: "dns",
          name: "服务器运行时",
          description: "构建带认证、中间件和生产约束的 MCP 服务器。",
        },
        {
          icon: "handyman",
          name: "工具库",
          description: "直接使用 508+ 标准工具，而不是重复造轮子。",
        },
        { icon: "graph_3", name: "工作流界面", description: "把 MCP 应用、消息通道和业务集成放进同一套栈里。" },
      ],
      results: [
        { stat: "508+", label: "标准工具" },
        { stat: "4", label: "已发布组件" },
        { stat: "OSS", label: "公开构建" },
      ],
      links: {
        website: "#featured-demo",
        github: "https://github.com/Casys-AI",
        docs: "https://jsr.io/@casys",
      },
    },
    categories: [
      {
        name: "已发布组件",
        items: [
          {
            id: "mcp-server",
            name: "@casys/mcp-server",
            tagline: "生产级 MCP 服务器框架",
            status: "v0.3.0",
            tech: "Deno",
            links: {
              website: "https://mcp-server.casys.ai",
              github: "https://github.com/Casys-AI/casys-pml/tree/main/lib/server",
              jsr: "https://jsr.io/@casys/mcp-server",
            },
          },
          {
            id: "mcp-std",
            name: "@casys/mcp-std",
            tagline: "508 个 MCP 工具。一行导入。",
            status: "v0.4.0",
            tech: "Deno",
            links: {
              website: "https://mcp-std.casys.ai",
              github: "https://github.com/Casys-AI/casys-pml/tree/main/lib/std",
              jsr: "https://jsr.io/@casys/mcp-std",
            },
          },
          {
            id: "mcp-bridge",
            name: "@casys/mcp-bridge",
            tagline: "MCP Apps 桥接消息平台",
            status: "v0.1.0",
            tech: "Deno",
            links: {
              website: "https://mcp-bridge.casys.ai",
              github: "https://github.com/Casys-AI/casys-pml/tree/main/lib/mcp-apps-bridge",
              jsr: "https://jsr.io/@casys/mcp-bridge",
            },
          },
          {
            id: "mcp-erpnext",
            name: "@casys/mcp-erpnext",
            tagline: "面向 MCP 应用的交互式 ERPNext 工作流",
            status: "活跃",
            tech: "Deno",
            links: {
              website: "/zh/mcp-erpnext",
              github: "https://github.com/Casys-AI/mcp-erpnext",
              jsr: "https://jsr.io/@casys/mcp-erpnext",
            },
          },
        ],
      },
    ],
  },
  whyCasys: {
    title: "为什么选择 Casys？",
    subtitle: "我们的不同之处",
    differentiation: [
      {
        id: "multi-domain",
        icon: "hub",
        title: "多领域专长",
        description: "我们连接多个领域以获得独特洞察",
        highlights: [
          "KM 系统 (2013+) → 图数据库 → AI 代理",
          "跨领域碰撞产生洞察",
          "专长跨技术浪潮持续累积",
        ],
      },
      {
        id: "continuity",
        icon: "timeline",
        title: "15+ 年持续发展",
        description: "不是追逐热潮的 AI 新手",
        highlights: [
          "15+ 年的实绩",
          "深度专长，而非表面热潮",
          "每个阶段都建立在前一个之上",
        ],
      },
      {
        id: "opensource",
        icon: "code_blocks",
        title: "开源优先",
        description: "默认开源。工具免费，咨询可选",
        highlights: [
          "默认开源",
          "无供应商锁定",
          "分享研究成果",
        ],
      },
      {
        id: "practical",
        icon: "rocket_launch",
        title: "务实研究",
        description: "我们发布解决实际问题的生产系统",
        highlights: [
          "生产就绪，不仅是原型",
          "在真实环境中经过检验",
          "我们使用自己的工具",
        ],
      },
      {
        id: "accessible",
        icon: "handshake",
        title: "无门槛设计",
        description: "无企业级开销",
        highlights: [
          "透明定价",
          "无最低承诺规模",
          "直接对接开发者",
        ],
      },
    ],
    bottomLine: {
      text:
        "一个在上下文管理和智能体系统方面拥有深度专长的小型事务所。我们构建实用工具，分享所学，在需要时帮助团队。",
      cta: {
        primary: {
          text: "联系我们",
          url: "#contact",
          icon: "mail",
        },
        secondary: {
          text: "GitHub",
          url: "https://github.com/Casys-AI",
          icon: "code",
        },
      },
    },
  },
  blog: {
    title: "研究、架构与现场笔记",
    subtitle: "我们在构建可观测 AI 工作流系统时正在学到什么。",
    readMore: "阅读",
    viewAll: "查看所有文章",
  },
  faq: {
    title: "常见问题",
    subtitle: "这个首页真正想表达什么，以及它不想表达什么。",
    categories: ["平台", "技术栈", "咨询", "通用"],
    allLabel: "全部",
    faqs: [
      {
        category: "平台",
        q: "Casys 实际上在做什么？",
        a: "Casys 在构建一套基础设施，让 AI 工具集成更可靠、更可观测、更容易部署。面对市场时，我们先讲结果：值得信赖的工作流。技术深度则放在底层的技术栈和学习层里。",
      },
      {
        category: "平台",
        q: "MCP ERPNext 就是产品本身吗？",
        a: "不是。MCP ERPNext 被放在最前面，是因为它足够具体、可交互、而且能让人快速理解。它展示了 Casys 方法在真实工作流中的样子，但并不代表公司只是在做 ERP 连接器。",
      },
      {
        category: "技术栈",
        q: "PML 现在处于什么位置？",
        a: "PML 是底层的学习与可观测层，是轨迹、路由和学习到的相关性汇合的地方。在首页里，它被放在“技术深度”位置，而不是要求每个访客一上来就先理解的产品名。",
      },
      {
        category: "技术栈",
        q: "哪些部分已经开源？",
        a: "已发布的技术栈包括 `@casys/mcp-server`、`@casys/mcp-std`、`@casys/mcp-bridge` 和 `@casys/mcp-erpnext`。这些是你现在就能看到和使用的构件。学习层仍在继续演进。",
      },
      {
        category: "技术栈",
        q: "为什么你们一直强调轨迹？",
        a: "因为轨迹让系统既能调试，也能改进。没有轨迹，团队只有零散感受；有了轨迹，就能检查失败、比较工作流，并学习哪些工具真的相关。",
      },
      {
        category: "咨询",
        q: "什么时候才需要咨询？",
        a: "当你已经看懂了证明，并希望把同样的严谨度带到自己的工作流时。典型工作包括架构评审、集成设计、部署加固，以及动手实现。",
      },
      {
        category: "咨询",
        q: "你们只做 ERPNext 吗？",
        a: "不是。ERPNext 只是一个具体示例。同样的方法适用于其他业务系统、工业工作流、知识密集型流程，以及多工具智能体环境。",
      },
      {
        category: "通用",
        q: "Casys 适合谁？",
        a: "适合 CTO、技术负责人，以及需要真实工作流可靠落地的工程团队，而不是只做一个好看的演示。这通常意味着多工具、多系统，以及对可观测性的明确需求。",
      },
      {
        category: "通用",
        q: "你们和一般的 MCP 咨询有什么不同？",
        a: "我们不只是讲协议。我们发布技术栈，展示具体工作流证明，并构建让这些工作流在生产环境中可理解的可观测层。",
      },
      {
        category: "通用",
        q: "你们的专业背景是什么？",
        a: '15+ 年上下文工程经验，从知识管理 (2013+) 到图数据库到 DAG 架构再到 MCP 生态。在这个领域被叫做“AI 代理的 Context Management”之前，我们就已经在做了。',
      },
      {
        category: "通用",
        q: "你们的合作方式是怎样的？",
        a: "我们提供多种灵活选项：专项工作坊 (1天)、定制项目（完整部署）或持续合作（直接对接从业者）。没有高额最低承诺。我们优化迭代速度和可及性，而非利润最大化。联系我们讨论您的具体需求。",
      },
    ],
  },
  finalCta: {
    title: "准备好交付一个真正值得信赖的工作流了吗？",
    subtitle: "先看一个具体证明，再决定你要深入到哪一步。",
    ctas: [
      {
        icon: "play_circle",
        text: "查看 MCP ERPNext",
        subtext: "交互式 ERPNext 演示",
        url: "/zh/mcp-erpnext",
      },
      {
        icon: "mail",
        text: "联系我们",
        subtext: "架构、交付与加固",
        url: "#contact",
      },
    ],
    trustBadges: [
      { icon: "check_circle", text: "开源技术栈" },
      { icon: "check_circle", text: "追踪每次调用" },
      { icon: "check_circle", text: "直接对接构建者" },
    ],
  },
  mcpErpnextPage: {
    eyebrow: "ERPNext 演示",
    title: "建立在 ERPNext 之上的具体 MCP 工作流",
    subtitle: "这是一个清晰示例，展示 Casys 技术栈如何驱动交互式业务工作流。",
    intro:
      "MCP ERPNext 把真实业务系统变成一个可检查的 MCP 应用界面。因此它是一个很强的演示：足够具体可以展示，足够技术化也有意义。",
    video: {
      src: "/videos/Connecting Your LLM to ERPNext in 30 Seconds! 🚀.mp4",
      caption: "MCP ERPNext 的短视频演示。",
    },
    proofs: [
      {
        title: "交互式界面",
        description: "这是可点击的工作流 UI，而不是只靠提示词驱动的假模型。",
      },
      {
        title: "可观测执行",
        description: "真正重要的不只是界面，而是背后那条可以追踪的执行路径。",
      },
      {
        title: "连接真实系统",
        description: "这个工作流直接运行在 ERPNext 上，所以它展示的是真实运营约束，而不是玩具级场景。",
      },
    ],
    whatItShowsTitle: "这个演示展示了什么",
    whatItShows: [
      "Casys 可以把真实业务系统接到 MCP 应用上。",
      "我们在意的是执行可见性，而不只是漂亮演示。",
      "同样的架构可以应用到 ERPNext 之外的其他工作流。",
    ],
    stackTitle: "由 Casys 技术栈驱动",
    stackItems: [
      "@casys/mcp-server 提供生产级 MCP 服务器行为",
      "@casys/mcp-std 提供共享工具和实用能力",
      "@casys/mcp-bridge 提供 UI 与消息界面",
      "PML 在底层提供轨迹、路由与学习能力",
    ],
    ctaPrimary: { text: "探索技术栈" },
    ctaSecondary: { text: "联系我们" },
  },
  contact: {
    title: "准备好开始了吗？",
    subtitle: "预约咨询电话、申请培训或讨论架构挑战。24小时内回复。",
    namePlaceholder: "您的姓名",
    emailPlaceholder: "您的工作邮箱",
    messagePlaceholder: "我想预约咨询 / 申请培训 / 讨论架构挑战",
    submitButton: "发送请求",
    sending: "发送中...",
    successMessage: "已收到您的请求！我们将在24小时内回复。",
    errorMessage: "发送失败，请重试。",
    hiddenSubject: "新的 CASYS 联系请求",
  },

  // ========================================
  // SUBSITE: ENGINE
  // ========================================
  engineHeader: {
    howItWorks: "How It Works",
    problem: "The Problem",
    shgat: "SHGAT",
    gru: "GRU",
    benchmarks: "Benchmarks",
    links: "Links",
    docs: "Docs",
    workWithUs: "合作咨询",
  },
  engineHero: {
    tagline: "ML COMPUTATION LAYER",
    heroTitle1: "Score, Rank, Build Paths",
    heroTitle2: "No LLM Required",
    heroSubtitle:
      "SHGAT attention networks score tool relevance across a hypergraph hierarchy. Multi-level message passing, K-head attention, zero LLM calls. Deterministic. Observable. Runs on your hardware.",
    statTools: "Nodes indexed",
    statHit: "E2E accuracy",
    statLatency: "GRU params",
    ctaPrimary: "How It Works",
    ctaDocs: "Documentation",
    ctaSecondary: "GitHub",
  },
  engineProblem: {
    eyebrow: "THE PROBLEM",
    titleLine1: "Raw Embeddings",
    titleLine2: "Are Blind to Structure",
    description: "LLMs score tool relevance one tool at a time. They can't see that psql_query and csv_parse belong to the same data-pipeline capability. Without structural context, tool selection is noisy, slow, and brittle.",
    insight: "SHGAT enrichment transforms isolated embeddings into structure-aware representations. Tools that share capabilities cluster together, even if they've never appeared in the same workflow.",
    tsneBaCaption: "t-SNE visualization: raw BGE-M3 embeddings (left) vs SHGAT-enriched (right). After message passing, tools cluster by capability.",
    tsneCapCaption: "Same embeddings colored by capability assignment. Enriched embeddings form tighter, more separable clusters.",
  },
  engineGru: {
    eyebrow: "GRU SEQUENCER",
    titleLine1: "258K Parameters.",
    titleLine2: "Not an LLM.",
    description: "A compact GRU predicts the next tool in a workflow from SHGAT-enriched embeddings. It sees the execution history and predicts what comes next — tools, capabilities, or terminal states.",
    features: [
      { icon: "memory", title: "Compact Architecture", desc: "GRU(64) with unified VocabNode. 920 tools + 245 capabilities = 1,165 output classes. Trains in minutes on CPU." },
      { icon: "route", title: "Beam Search Decoding", desc: "Width-4 beam search with length normalization builds full execution paths. First-N accuracy reaches 70.8%." },
      { icon: "category", title: "Cap-as-Terminal", desc: "Capabilities act as terminal states. The model predicts when to stop expanding, not just what to expand. Cap Hit@1: 82.3%." },
      { icon: "speed", title: "SHGAT Contribution", desc: "SHGAT-enriched embeddings add +6.2pp to E2E beam accuracy vs raw embeddings. Structure is the signal." },
    ],
    benchmarkCaption: "E2E benchmark: beam search First-N accuracy comparison. SHGAT enrichment provides +6.2pp lift.",
    statParams: "parameters",
    statAccuracy: "E2E accuracy",
    statContribution: "SHGAT lift",
  },

  // ========================================
  // SUBSITE: MCP-SERVER
  // ========================================
  mcpServerHeader: {
    features: "功能",
    quickstart: "快速开始",
    pipeline: "流水线",
    install: "安装",
    docs: "文档",
    workWithUs: "合作咨询",
  },
  mcpServerHero: {
    tagline: "MCP 的 Hono",
    heroTitle1: "交付真正可扩展的",
    heroTitle2: "MCP 服务器",
    heroSubtitle:
      "不再为每个 MCP 服务器重新实现认证、限流和中间件。一个框架，默认可组合，从第一天起即可用于生产。",
    statFeatures: "内置功能",
    statTests: "测试通过",
    statRelease: "最新版本",
    ctaPrimary: "快速开始",
    ctaSecondary: "在 JSR 上查看",
    ctaDocs: "文档",
  },
  mcpServerInstall: {
    title: "随时",
    titleAccent: "就绪",
    subtitle: "一条命令。支持 Deno 和 Node.js。发布在 JSR，现代 JavaScript 注册表。",
    jsrLabel: "JSR 注册表",
    githubLabel: "GitHub",
    docsLabel: "文档",
    builtWith: "基于",
  },

  // ========================================
  // SUBSITE: MCP-STD
  // ========================================
  mcpStdHeader: {
    categories: "分类",
    catalog: "目录",
    quickstart: "快速开始",
    install: "安装",
    workWithUs: "合作咨询",
  },
  mcpStdHero: {
    tagline: "MCP 标准工具箱",
    heroTitle1: "508 个工具。",
    heroTitle2: "一次导入。",
    heroSubtitle:
      "数据库、Git、Docker、加密、文本、网络、AI 代理——你自己会写的每个工具，已测试且类型化。",
    statTools: "工具",
    statCategories: "分类",
    statRelease: "最新",
    ctaPrimary: "浏览目录",
    ctaSecondary1: "快速开始",
    ctaSecondary2: "在 JSR 上查看",
  },
  mcpStdInstall: {
    title: "随时",
    titleAccent: "就绪",
    subtitle: "一条命令。支持 Deno。发布在 JSR，现代 JavaScript 注册表。",
    denoLabel: "Deno",
    binaryLabel: "二进制",
    jsrLabel: "JSR 注册表",
    githubLabel: "GitHub",
    builtWith: "基于",
  },

  // ========================================
  // PML LANDING
  // ========================================
  pmlHero: {
    eyebrow: "AI 代理的程序化记忆",
    titleLine1: "一个网关。任何模型。",
    titleAccent: "完整可观测性。",
    description:
      "一次构建 AI 工作流，使用 Claude、GPT、Gemini 或本地 Ollama 运行。每次工具调用均可追踪。秒级调试，而非小时。",
    ctaPrimary: "开始使用",
    ctaSecondary: "阅读文档",
    pillars: ["模型无关", "完整可追踪", "模式提取"],
    traceHeader: "workflow:ci-deploy",
    traceLive: "live",
    traceCalls: "22 次调用",
    traceModels: "3 个模型",
    traceCost: "$0.028",
  },
  pmlArchitecture: {
    eyebrow: "架构",
    title: "工作原理",
    description:
      "统一网关位于您的 LLM 和它所需工具之间。每个请求被分解为有向无环图，在沙箱中执行，并完全追踪。",
    clients: {
      label: "客户端",
      items: ["Claude", "GPT", "Gemini", "Ollama", "任何 LLM"],
    },
    gateway: {
      label: "PML 网关",
      pipeline: ["注册表", "DAG", "沙箱"],
      extras: ["符号世界模型", "可观测性"],
    },
    servers: {
      label: "MCP 服务器",
      items: ["filesystem", "postgres", "github", "memory", "任何工具"],
    },
    pillars: [
      { label: "模型无关", description: "兼容任何 LLM 提供商" },
      { label: "可观测性", description: "每个操作的完整追踪" },
      { label: "符号推理", description: "符号推理层" },
    ],
    mobileArrow: "传输至",
  },
  pmlCatalogPreview: {
    label: "目录",
    browseCta: "浏览完整目录",
  },
  pmlQuickStart: {
    label: "快速开始",
    title: "3 步启动",
    subtitle: "不到一分钟为 Claude Code 添加程序化记忆。",
    docsLink: "阅读完整文档",
    steps: [
      {
        number: "01",
        title: "安装 PML",
        description: "一条命令。无依赖。支持 macOS、Linux 和 WSL。",
        file: "terminal",
      },
      {
        number: "02",
        title: "初始化项目",
        description: "PML 创建本地配置并连接到您的环境。",
        file: "terminal",
      },
      {
        number: "03",
        title: "与 Claude Code 配合使用",
        description: "PML 工具自动可用。发现、执行和学习。",
        file: "claude-code",
      },
    ],
  },
  pmlIsolation: {
    eyebrow: "安全性",
    titleLine1: "自主的，",
    titleLine2: "但不鲁莽。",
    description:
      "每个 AI 操作都在带有资源限制的隔离沙箱中运行。危险操作在触及生产系统之前会暂停等待人工审批。",
    features: [
      {
        id: "sandbox",
        title: "沙箱执行",
        description: "代码在隔离的 worker 中运行，无法直接访问主机系统或网络。",
      },
      {
        id: "hil",
        title: "人在回路中",
        description: "文件写入或数据库变更等危险操作需要明确批准后才能执行。",
      },
      {
        id: "audit",
        title: "审计追踪",
        description: "每个操作都会被记录完整上下文，以便透明和事后分析。",
      },
    ],
    svg: {
      sandbox: "沙箱",
      checkpoint: "检查点",
      protected: "受保护",
      aiActions: "AI 操作",
      toolsData: "工具和数据",
      approve: "批准？",
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
    eyebrow: "抢先体验",
    title: "加入测试版",
    description: "成为首批为您的代理赋予程序化记忆的用户。",
    labelName: "姓名",
    labelEmail: "邮箱",
    labelUseCase: "您将如何使用 PML？",
    placeholderName: "您的姓名",
    placeholderEmail: "you@company.com",
    placeholderUseCase:
      "例如：我想为我的 Claude Code 代理提供长期记忆，用于重复的 DevOps 工作流...",
    submit: "申请访问",
    sending: "发送中...",
    successMessage: "您已在列表中！我们会尽快联系您。",
    errorMessage: "出错了，请重试。",
    hiddenSubject: "PML Beta 访问请求",
  },
  pmlCta: {
    title: "准备好了吗？",
    description: "为您的代理赋予程序化记忆。立即开始构建可观测的工作流。",
    primaryCta: "开始使用",
    secondaryCta: "申请测试版",
  },
  pmlIntelligence: {
    eyebrow: "模式提取",
    titleLine1: "每次执行",
    titleLine2: "都留下轨迹。",
    description:
      "PML 记录完整的执行轨迹——工具序列、延迟、错误路径。SHGAT 从这些数据中提取相关性模式。确定性、可检查、无黑盒。",
    features: [
      {
        icon: "hub",
        title: "执行轨迹",
        desc:
          "每次工作流运行都被完整记录：工具调用、输入、输出、时间、成本。数据保留在您的基础设施上。",
      },
      {
        icon: "auto_awesome",
        title: "图注意力评分",
        desc: "SHGAT 处理轨迹数据以评分工具相关性。跨超图层级的 K-head 注意力。无 LLM 调用。",
      },
      {
        icon: "recommend",
        title: "共现模式",
        desc: "经常一起运行的工具会自动浮现。统计共现，而非猜测。",
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
    subtitle: "Benchmarked on 920 nodes across 1,165 vocabulary classes. All metrics from production traces, 24 notebooks of research.",
    cards: [
      {
        icon: "hub",
        title: "SHGAT-TF",
        rows: [
          ["Hit@1", "66.1%"],
          ["Hierarchy", "L0 (920) \u2192 L1 (26) \u2192 L2"],
          ["Attention heads", "16 \u00d7 64D"],
          ["Training", "InfoNCE + PER"],
        ],
      },
      {
        icon: "psychology",
        title: "GRU Sequencer",
        rows: [
          ["Global Hit@1", "57.6%"],
          ["Tool Hit@1", "37.2%"],
          ["Cap Hit@1", "82.3%"],
          ["Parameters", "258K"],
        ],
      },
      {
        icon: "stacks",
        title: "E2E Pipeline",
        rows: [
          ["Beam First-N", "70.8%"],
          ["SHGAT lift", "+6.2pp"],
          ["Beam width", "4"],
          ["Vocab size", "1,165"],
        ],
      },
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
    titleAccent: "框架",
    subtitle: "官方 SDK 提供协议。这个提供生产级技术栈。",
    colSdk: "官方 SDK",
    colFramework: "@casys/mcp-server",
    rows: [
      ["MCP 协议", true, true],
      ["中间件管道", false, true],
      ["OAuth2 / JWT 认证", false, true],
      ["速率限制", false, true],
      ["Schema 验证", false, true],
      ["Streamable HTTP + SSE", "手动", "内置"],
      ["并发控制", false, true],
      ["OpenTelemetry 追踪", false, true],
      ["Prometheus 指标", false, true],
      ["MCP Apps (UI 资源)", "手动", "内置"],
      ["CORS 白名单", false, true],
      ["请求体大小限制 (413)", false, true],
      ["IP 速率限制 (429)", false, true],
      ["会话传播", false, true],
      ["HMAC \u6d88\u606f\u7b7e\u540d", false, true],
      ["CSP \u6ce8\u5165", false, true],
      ["YAML + \u73af\u5883\u53d8\u91cf\u914d\u7f6e", false, true],
      ["Deno + Node.js", "\u4ec5 Node", "\u4e24\u8005\u90fd\u652f\u6301"],
    ],
  },
  mcpServerFeatures: {
    title: "开箱",
    titleAccent: "即用",
    subtitle: "请求到处理器之间的一切——都已搞定。",
    features: [
      { icon: "swap_horiz", name: "双传输", desc: "STDIO + Streamable HTTP，同一代码。" },
      { icon: "layers", name: "中间件管道", desc: "类似 Koa 的洋葱模型。" },
      { icon: "shield", name: "OAuth2 认证", desc: "JWT/Bearer + RFC 9728 元数据。" },
      { icon: "key", name: "OIDC 预设", desc: "GitHub、Google、Auth0——一行代码。" },
      { icon: "settings", name: "YAML + 环境变量", desc: "文件配置，部署时环境变量覆盖。" },
      { icon: "speed", name: "并发控制", desc: "背压策略：sleep、queue 或 reject。" },
      { icon: "timer", name: "速率限制", desc: "滑动窗口，按客户端隔离。" },
      { icon: "check_circle", name: "Schema 验证", desc: "注册时通过 ajv 编译 JSON Schema。" },
      { icon: "monitoring", name: "可观测性", desc: "OTel span + Prometheus /metrics。" },
      { icon: "widgets", name: "MCP Apps", desc: "通过 ui:// scheme 提供交互式 UI。" },
      { icon: "lock", name: "CORS 白名单", desc: "来源白名单，通配符自动告警。" },
      { icon: "upload_file", name: "请求体限制", desc: "maxBodyBytes + 413 JSON-RPC 错误。" },
      { icon: "block", name: "IP 速率限制", desc: "按 IP 429 + Retry-After HTTP 头。" },
      { icon: "badge", name: "会话传播", desc: "sessionId 注入中间件上下文。" },
      {
        icon: "enhanced_encryption",
        name: "HMAC 签名",
        desc: "SHA-256 签名/验证 + PostMessage 防重放。",
      },
      { icon: "security", name: "CSP 注入", desc: "MCP Apps 自动注入 Content-Security-Policy。" },
    ],
  },
  mcpServerPipeline: {
    title: "你的服务器，",
    titleAccent: "你的规则",
    subtitle:
      "每个请求流经可组合的中间件链。需要认证？加上。限流？一行代码。自定义逻辑？插入任意位置。",
    steps: [
      { icon: "arrow_forward", label: "请求", type: "incoming" },
      { icon: "timer", label: "限流", type: "" },
      { icon: "shield", label: "认证", type: "" },
      { icon: "tune", label: "自定义", type: "custom" },
      { icon: "verified_user", label: "权限", type: "" },
      { icon: "check_circle", label: "验证", type: "" },
      { icon: "speed", label: "背压", type: "" },
      { icon: "play_arrow", label: "处理器", type: "handler" },
    ],
  },
  mcpServerQuickStart: {
    title: "5 行代码到",
    titleAccent: "生产",
    subtitle: "无样板代码。无配置仪式。注册工具，调用 start()，直接上线。",
    tabBasic: "基础 (STDIO)",
    tabHttp: "HTTP + 认证",
    tabYaml: "YAML 配置",
  },

  // ========================================
  // MCP-STD (additional sections)
  // ========================================
  mcpStdQuickStart: {
    title: "3 行代码到",
    titleAccent: "生产",
    subtitle: "作为独立 MCP 服务器使用，或作为库导入单个工具。由您决定。",
    tabServer: "MCP 服务器",
    tabLibrary: "库模式",
    tabCategory: "按类别",
  },
  mcpStdCategories: {
    title: "29 个",
    titleAccent: "分类",
    subtitle: "从数据库查询到 AI 智能体编排，每个工具都已分类、随时可用。",
    cta: "浏览全部 508 个工具",
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
    evidenceTitle: "Research Evidence",
    evidenceSubtitle: "24 notebooks, 41 visualizations. Real experiments, not marketing.",
    residualCaption: "Residual weight sweep: Hit@1 across different residual configurations.",
    pcaCaption: "PCA 3-panel: raw embeddings vs message-passing-only vs full V\u2192E residual.",
    gammaCaption: "Adaptive \u03B3(n) = \u03C3(a\u00B7log(n+1)+b) learns per-node residual weights based on fan-out. Novel contribution \u2014 no precedent in GNN literature.",
  },

  // ========================================
  // ABOUT PAGE
  // ========================================
  about: {
    pageTitle: "关于",
    heroName: "Erwan Lee Pesle",
    heroTitle: "创始人 & 系统架构师，Casys",
    heroBio:
      "十五年来，我们一直在构建将知识转化为行动的系统——从 mIRC 上的早期聊天机器人，到企业知识管理，再到用于工具相关性的图注意力网络。当大语言模型出现时，问题没有改变：上下文输入，行动输出。MCP 是这一原则最新的表达，也是最具影响力的。Casys AI 帮助工程团队交付可靠的 AI 集成——无供应商锁定，无黑盒。",
    expertiseTitle: "我们做什么",
    expertiseSubtitle:
      "连接 AI 系统与现实世界数据、工具和工作流的基础设施——为生产环境的可观测性和确定性而构建。",
    areas: [
      {
        icon: "hub",
        title: "知识图谱",
        description:
          "模式设计、查询优化和图原生架构。Neo4j 认证专业开发者。从本体建模到生产级图管道。",
      },
      {
        icon: "database",
        title: "图数据库",
        description:
          "建模关系型数据库无法表达的复杂关系。我们设计、部署和优化处理真实生产流量的 Neo4j 实例。",
      },
      {
        icon: "smart_toy",
        title: "智能体系统",
        description:
          "工具编排、上下文路由和执行可靠性。我们架构多智能体系统，使每个决策可追溯，每个故障可恢复。",
      },
      {
        icon: "cable",
        title: "MCP 基础设施",
        description:
          "服务器架构、连接器设计和协议级优化。已交付 500+ 开源工具。我们构建可观测、可测试、生产就绪的 MCP 层。",
      },
    ],
    philosophyTitle: "我们的工作方式",
    principles: [
      {
        icon: "code",
        title: "以开源为基石",
        description:
          "我们的核心工具是开源的。客户获得的解决方案建立在可审查、可分叉、可拥有的代码之上。无供应商锁定，无黑盒。",
      },
      {
        icon: "science",
        title: "能上线的研究",
        description:
          "我们发布所学，交付所建。我们推荐的每项技术都经过真实工作负载的验证，而非仅限于基准测试。",
      },
      {
        icon: "emoji_objects",
        title: "务实，不炒作",
        description:
          '我们不贩卖"AI 转型"。我们用具体的工程方法解决具体的基础设施问题。让工作成果说话。',
      },
    ],
    ctaTitle: "从一个问题开始",
    ctaSubtitle:
      "描述您的 MCP 基础设施挑战、知识图谱瓶颈或智能体系统设计问题。我们会坦诚告知是否能帮到您——以及我们会如何着手解决。",
    ctaPrimary: {
      text: "联系我们",
      url: "/#contact",
      icon: "mail",
    },
    ctaSecondary: {
      text: "查看项目",
      url: "/#projects",
      icon: "folder_open",
    },
  },

  // ========================================
  // SUBSITE: MCP-BRIDGE
  // ========================================
  mcpBridgeHeader: {
    features: "功能",
    architecture: "架构",
    quickstart: "快速开始",
    install: "安装",
    docs: "文档",
    workWithUs: "合作咨询",
  },
  mcpBridgeHero: {
    tagline: "MCP Apps \u2192 消息平台",
    heroTitle1: "MCP Apps 触达",
    heroTitle2: "20亿+用户",
    heroSubtitle: "将任何 MCP App 变为 Telegram Mini App。零代码改动。同一工具，全新受众。",
    statTests: "测试通过",
    statPlatforms: "平台",
    statRelease: "最新版本",
    ctaPrimary: "快速开始",
    ctaSecondary: "在 JSR 上查看",
    ctaDocs: "文档",
  },
  mcpBridgeFeatures: {
    title: "弥合",
    titleAccent: "鸿沟",
    subtitle: "将 MCP Apps 从开发者工具带到消息平台所需的一切。",
    features: [
      { icon: "code_off", name: "零代码改动", desc: "现有 MCP Apps 直接使用，无需重写。" },
      { icon: "layers", name: "三层架构", desc: "客户端、资源服务器、MCP 服务器。" },
      { icon: "swap_horiz", name: "协议转换", desc: "通过 WebSocket 的 JSON-RPC 2.0，无缝衔接。" },
      { icon: "smart_toy", name: "Telegram Mini Apps", desc: "完整的主题、视口、认证支持。" },
      { icon: "more_horiz", name: "更多平台", desc: "LINE、Discord、WhatsApp — 即将推出。" },
      { icon: "shield", name: "CSP 强制", desc: "默认严格的内容安全策略。" },
      { icon: "key", name: "会话认证", desc: "加密安全令牌，HMAC 验证。" },
      { icon: "sync", name: "WebSocket 传输", desc: "实时双向通信。" },
      { icon: "palette", name: "主题映射", desc: "平台主题自动映射到 MCP Apps。" },
      { icon: "extension", name: "可扩展适配器", desc: "添加 Discord、WhatsApp 或任何平台。" },
    ],
  },
  mcpBridgeArchitecture: {
    title: "工作",
    titleAccent: "原理",
    subtitle:
      "Bridge 拦截 MCP App 的 postMessage 调用，通过 WebSocket 路由到资源服务器，再将工具调用转发到未修改的 MCP 服务器。",
    steps: [
      { icon: "web", label: "MCP App", type: "incoming" },
      { icon: "javascript", label: "bridge.js", type: "" },
      { icon: "sync", label: "WebSocket", type: "" },
      { icon: "dns", label: "资源服务器", type: "handler" },
      { icon: "hub", label: "MCP 服务器", type: "" },
      { icon: "send", label: "Telegram", type: "custom" },
    ],
  },
  mcpBridgeComparison: {
    title: "自定义集成 vs",
    titleAccent: "Bridge",
    subtitle: "省去数月的集成工作。Bridge 处理复杂部分，让您更快发布。",
    colCustom: "自定义集成",
    colBridge: "@casys/mcp-bridge",
    rows: [
      ["MCP App 代码改动", "需要重写", "无需改动"],
      ["平台认证（Telegram）", "手动 HMAC", "内置"],
      ["内容安全策略", "手动 headers", "自动生成"],
      ["WebSocket 管理", "从零开始", "内置"],
      ["主题同步", "手动映射", "自动"],
      ["多平台支持", "按平台编码", "适配器模式"],
      ["会话管理", "自定义实现", "加密安全"],
      ["HTML 注入 (bridge.js)", "不适用", "自动"],
    ],
  },
  mcpBridgeQuickStart: {
    title: "部署到",
    titleAccent: "Telegram",
    subtitle: "三步将您的 MCP App 运行在 Telegram 中。无需更改现有代码。",
    tabTelegram: "Telegram",
    tabLine: "即将推出",
  },
  mcpBridgeInstall: {
    title: "随时",
    titleAccent: "就绪",
    subtitle: "一条命令。支持 Deno 和 Node.js。发布在 JSR，现代 JavaScript 注册表。",
    jsrLabel: "JSR 注册表",
    githubLabel: "GitHub",
    docsLabel: "文档",
    builtWith: "基于",
  },

  // ========================================
  // USE CASES PAGE
  // ========================================
  useCases: {
    pageTitle: "生产环境案例",
    heroTitle: "生产环境案例",
    heroSubtitle:
      "我们为生产环境构建 MCP 基础设施。以下是实际案例——真实的挑战、真实的解决方案、真实的指标。",
    labelChallenge: "挑战",
    labelApproach: "解决方案",
    labelResult: "成果",
    labelStack: "技术栈",
    ctaTitle: "有类似的挑战？",
    ctaSubtitle: "描述您的 MCP 基础设施挑战。我们会坦诚告知是否能帮到您——以及我们会如何着手解决。",
    ctaPrimary: { text: "联系我们", url: "/#contact", icon: "mail" },
    ctaSecondary: { text: "查看项目", url: "/#projects", icon: "folder_open" },
  },
};
