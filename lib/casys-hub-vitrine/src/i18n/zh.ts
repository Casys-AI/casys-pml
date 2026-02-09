// ============================================================
// Chinese translations for Casys Hub Vitrine
// Organized by page/section
// ============================================================

import type { Translations } from './index';

export const zh: Translations = {
  // ========================================
  // SHARED COMPONENTS
  // ========================================
  header: {
    projects: '项目',
    whyCasys: '为什么选择 Casys',
    consulting: '咨询服务',
    blog: 'Blog',
    useCases: '我们的工作',
    about: '关于我们',
    contact: '联系我们',
  },
  footer: {
    product: '产品',
    projects: '项目',
    consulting: '咨询服务',
    training: '培训',
    github: 'GitHub',
    openSource: '开源项目',
    connect: '链接',
    contact: '联系我们',
    discord: 'Discord',
    description: '智能体架构与上下文系统',
    tagline: '开源工具 & 咨询服务',
  },
  subsiteFooter: {
    product: '产品',
    projects: '项目',
    consulting: '咨询服务',
    training: '培训',
    openSource: '开源项目',
    connect: '链接',
    contact: '联系我们',
    discord: 'Discord',
    description: '智能体架构与上下文系统',
    tagline: '开源工具 & 咨询服务',
  },

  // ========================================
  // LANDING V2 SECTIONS
  // ========================================
  hero: {
    kicker: '智能体架构与上下文系统',
    titleLine1: '从知识图谱',
    titleLine2: '到 MCP 服务器',
    subtitle: '十五年以上上下文工程经验 — 以开源基础设施交付给您的团队。',
    cta: {
      primary: { text: '与我们合作', icon: 'handshake', url: '#contact' },
      secondary: { text: '探索项目', icon: 'explore', url: '#projects' },
    },
    proofs: [
      { name: 'mcp-std', stat: '508 个工具', url: 'https://mcp-std.casys.ai' },
      { name: 'mcp-server', stat: '生产认证', url: 'https://mcp-server.casys.ai' },
      { name: 'Casys PML', stat: '网关', url: 'https://pml.casys.ai' },
      { name: 'Engine', stat: '图评分', url: 'https://engine.casys.ai' },
    ],
  },
  socialProof: {
    title: 'Track Record',
    subtitle: '用成果说话,不靠承诺',
    items: [
      {
        type: 'stat',
        icon: 'code',
        stat: '活跃',
        label: '开发中',
        description: 'Casys PML - 集成 GraphRAG 和 DAG 的 MCP Gateway',
        link: {
          text: '在 GitHub 上关注',
          url: 'https://github.com/Casys-AI/casys-pml'
        }
      },
      {
        type: 'stat',
        icon: 'groups',
        stat: '15+',
        label: '年经验',
        description: 'Context Management → Graph DBs → DAGs → MCP',
        link: {
          text: '了解我们的故事',
          url: '/about'
        }
      },
      {
        type: 'stat',
        icon: 'public',
        stat: 'French Tech',
        label: '台湾',
        description: 'French Tech Taiwan 社区活跃成员',
        link: {
          text: '查看演讲',
          url: '/blog?tag=talks'
        }
      }
    ],
    githubTitle: '开源成果',
    githubCta: '查看所有 GitHub 项目',
    repos: [
      { name: '@casys/mcp-server', description: '生产级 MCP 服务器，支持中间件管道', stars: '★ New', url: 'https://github.com/Casys-AI/casys-mcp-server' },
      { name: '@casys/mcp-std', description: '508+ MCP 代理工具', stars: '★ New', url: 'https://github.com/Casys-AI/casys-mcp-std' },
      { name: 'PML Engine', description: 'GraphRAG + DAG 执行引擎', stars: '★ New', url: 'https://github.com/Casys-AI/casys-pml' },
    ]
  },
  workWithUs: {
    title: '与我们合作',
    subtitle: '我们的工具免费开源。当您需要部署帮助时，我们随时为您服务。',
    options: [
      {
        id: 'explore',
        icon: 'explore',
        title: '探索',
        tagline: '免费与开源',
        description: '了解我们的工具，阅读研究，加入社区。',
        items: [
          { icon: 'code', text: 'Casys PML - AI 代理的程序记忆层', url: 'https://pml.casys.ai' },
          { icon: 'article', text: '博客与技术文章', url: '/blog' },
          { icon: 'groups', text: 'French Tech Taiwan 社区', url: 'https://www.linkedin.com/company/casys-ai' }
        ],
        cta: { text: '在 GitHub 上探索', url: 'https://github.com/casys-ai', icon: 'arrow_forward' }
      },
      {
        id: 'learn',
        icon: 'school',
        title: '学习',
        tagline: '培训与工作坊',
        description: '掌握我们研究领域的实操课程。',
        items: [
          { icon: 'smart_toy', text: 'AI 代理上下文管理 (2-3天)' },
          { icon: 'hub', text: '嵌入式图数据库 (1-2天)' },
          { icon: 'architecture', text: '多领域 AI 架构 (3-5天)' }
        ],
        details: ['现场或远程', '实操练习', '定制教材'],
        cta: { text: '申请培训', url: '#contact', icon: 'calendar_today' }
      },
      {
        id: 'collaborate',
        icon: 'handshake',
        title: '合作',
        tagline: '咨询与项目',
        description: '为您复杂的 AI 架构提供实操帮助。',
        items: [
          { icon: 'check_circle', text: '架构评审与策略' },
          { icon: 'check_circle', text: '部署与定制集成' },
          { icon: 'check_circle', text: '性能优化' },
          { icon: 'check_circle', text: '结对编程与代码审查' }
        ],
        engagement: '典型项目周期：2-5天。远程优先，时区灵活。',
        highlights: ['直接对接开发者', '无最低承诺', '快速迭代'],
        cta: { text: '联系我们', url: '#contact', icon: 'mail' }
      }
    ]
  },
  whatWeDo: {
    title: '我们做什么',
    subtitle: '结合探索、开源和咨询的上下文工程',
    cards: [
      {
        id: 'research',
        icon: 'school',
        title: '研究与探索',
        subtitle: '多领域 AI 架构',
        description: '知识管理 (2013+) → 图数据库 → 现代智能体系统',
        researchAreas: [
          {
            name: '知识管理',
            description: '15+ 年 KM 系统、图谱、语义搜索经验'
          },
          {
            name: '智能体系统',
            description: '上下文优化、编排、多代理架构'
          },
          {
            name: '内容智能',
            description: '基于图的内容系统、自动化关系'
          },
          {
            name: '数据库系统',
            description: '图谱知识存储架构'
          }
        ],
        philosophy: [
          { icon: 'vertical_align_bottom', text: '深度优先——但不惧探索新领域' },
          { icon: 'public', text: '开放研究——我们发布所学' },
          { icon: 'rocket_launch', text: '实用——研究能在生产中落地' }
        ]
      },
      {
        id: 'opensource',
        icon: 'code',
        title: '开源项目',
        subtitle: '开源工具',
        projects: ['MCP Gateway: 上下文管理'],
        highlights: ['默认开源', '生产就绪', '咨询可选']
      },
      {
        id: 'consulting',
        icon: 'engineering',
        title: '咨询',
        subtitle: '实操帮助',
        services: ['架构与策略', '实施与部署', '培训'],
        highlights: ['灵活定价', '无最低承诺', '直接对接开发者']
      }
    ]
  },
  projects: {
    title: '我们的项目',
    subtitle: '探索 AI 系统不同层面的开源工具',
    activeProjects: [
      {
        id: 'casys-pml',
        name: 'Casys PML',
        tagline: '一个网关。任何模型。完整可观测性。',
        status: '活跃开发中',
        license: 'AGPL-3.0',
        featured: true,
        features: [
            {
              icon: 'swap_horiz',
              name: '模型无关',
              description: 'Claude、GPT、Gemini、Ollama——自由切换'
            },
            {
              icon: 'visibility',
              name: '完整可观测性',
              description: '每次工具调用均可追溯：成本、延迟、状态'
            },
            {
              icon: 'auto_awesome',
              name: '模式提取',
              description: 'SHGAT 从执行轨迹中提取相关性模式'
            }
        ],
        results: [
          { stat: '120+', label: '目录中的能力' },
          { stat: '4', label: '支持的 LLM 提供商' },
          { stat: '免费', label: '开源测试版' }
        ],
        tech: { stack: 'Deno 2.x, PGlite, Drizzle ORM, Transformers.js' },
        links: {
          website: 'https://pml.casys.ai',
          github: 'https://github.com/Casys-AI/casys-pml',
          docs: 'https://pml.casys.ai/docs'
        }
      },
      {
        id: 'mcp-std',
        name: '@casys/mcp-std',
        tagline: '508 个 MCP 工具。一行导入。',
        status: 'v0.4.0',
        license: 'MIT',
        features: [
          { icon: 'construction', name: '508 工具', description: 'Docker、Git、DB、加密、文本、网络...' },
          { icon: 'category', name: '32 类别', description: '按需加载' },
          { icon: 'terminal', name: 'MCP 服务器', description: '独立或库模式' }
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
        tagline: '生产级 MCP 服务器框架',
        status: 'v0.3.0',
        license: 'MIT',
        features: [
          { icon: 'security', name: '内置认证', description: 'OAuth2、JWT、API 密钥' },
          { icon: 'layers', name: '中间件', description: '限流、CORS、日志' },
          { icon: 'speed', name: 'HTTP + SSE', description: '并发传输层' }
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
        tagline: '图神经网络工具编排',
        status: '研究',
        license: 'AGPL-3.0',
        features: [
          { icon: 'hub', name: 'SHGAT', description: '稀疏异构图注意力' },
          { icon: 'psychology', name: '基于轨迹训练', description: '基于生产执行轨迹训练' },
          { icon: 'route', name: 'DAG 优化', description: '自动工作流规划' }
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
    title: '为什么选择 Casys？',
    subtitle: '我们的不同之处',
    differentiation: [
      {
        id: 'multi-domain',
        icon: 'hub',
        title: '多领域专长',
        description: '我们连接多个领域以获得独特洞察',
        highlights: [
          'KM 系统 (2013+) → 图数据库 → AI 代理',
          '跨领域碰撞产生洞察',
          '专长跨技术浪潮持续累积'
        ]
      },
      {
        id: 'continuity',
        icon: 'timeline',
        title: '15+ 年持续发展',
        description: '不是追逐热潮的 AI 新手',
        highlights: [
          '15+ 年的实绩',
          '深度专长，而非表面热潮',
          '每个阶段都建立在前一个之上'
        ]
      },
      {
        id: 'opensource',
        icon: 'code_blocks',
        title: '开源优先',
        description: '默认开源。工具免费，咨询可选',
        highlights: [
          '默认开源',
          '无供应商锁定',
          '分享研究成果'
        ]
      },
      {
        id: 'practical',
        icon: 'rocket_launch',
        title: '务实研究',
        description: '我们发布解决实际问题的生产系统',
        highlights: [
          '生产就绪，不仅是原型',
          '在真实环境中经过检验',
          '我们使用自己的工具'
        ]
      },
      {
        id: 'accessible',
        icon: 'handshake',
        title: '无门槛设计',
        description: '无企业级开销',
        highlights: [
          '透明定价',
          '无最低承诺规模',
          '直接对接开发者'
        ]
      }
    ],
    bottomLine: {
      text: '一个在上下文管理和智能体系统方面拥有深度专长的小型事务所。我们构建实用工具，分享所学，在需要时帮助团队。',
      cta: {
        primary: {
          text: '联系我们',
          url: '#contact',
          icon: 'mail'
        },
        secondary: {
          text: '发送邮件',
          url: '#contact',
          icon: 'email'
        }
      }
    }
  },
  blog: {
    title: '博客文章',
    subtitle: '关于 AI 架构、工具编排以及我们正在构建的内容',
    readMore: '阅读',
    viewAll: '查看所有文章',
  },
  faq: {
    title: '常见问题',
    subtitle: '关于我们项目和 Casys 的一切',
    categories: ['项目', '咨询', '培训', '通用'],
    allLabel: '全部',
    faqs: [
      { category: '项目', q: 'Casys PML 到底是什么？', a: 'Casys PML 是一个模型无关的 MCP 网关。一次构建 AI 工作流，在 Claude、GPT、Gemini 或本地 Ollama 上运行。每次工具调用都被追踪（成本、延迟、状态），SHGAT 从执行数据中提取相关性模式以改进工具评分。' },
      { category: '项目', q: 'Casys PML 与其他 MCP 工具有什么不同？', a: 'Casys PML 是统一网关，而非仅仅是 MCP 客户端。它提供：(1) 动态切换 LLM 提供商（无供应商锁定）；(2) 对每次工具调用的完整可观测性，包括成本和延迟追踪；(3) 基于图的模式提取——SHGAT 从执行轨迹评分工具相关性。唯一结合模型无关路由+可观测性+图注意力评分的 MCP 网关。' },
      { category: '项目', q: '支持哪些 LLM 模型？', a: 'Claude (Anthropic)、GPT (OpenAI)、Gemini (Google) 和 Ollama（本地/自托管）。PML 作为网关：无需重写工作流即可切换提供商。目录包含 120+ 个即用能力。' },
      { category: '项目', q: 'Casys PML 是开源的吗？', a: '是的。AGPL-3.0 许可证。您可以永久免费自托管、阅读代码、修改和贡献。托管服务为需要云同步和协作的团队可选。' },
      { category: '项目', q: 'Casys PML 目前处于什么状态？', a: '活跃开发中。核心功能已就绪：GraphRAG 发现、DAG 编排与并行执行、隔离 TypeScript 沙箱、实时可观测性。Deno 2.x + PGlite 架构。在 GitHub 上关注进展。' },
      { category: '咨询', q: '咨询包括什么？', a: '架构评审、部署帮助、定制 MCP 集成、上下文策略设计、团队培训。我们与您的代码库进行实操合作。灵活选项：短期工作坊、定制项目、持续合作伙伴关系和定制企业方案。' },
      { category: '咨询', q: '为什么选择 Casys 而不是大型咨询公司？', a: '我们是构建 Casys PML 的团队。我们为自己推荐的系统编写代码。您直接对接技术专家，而非客户经理。更快的迭代、灵活的入口门槛、没有大型咨询公司那样的高额最低承诺。' },
      { category: '咨询', q: '你们只做 Casys PML 还是也做其他架构？', a: '我们服务任何智能体架构。如果您没有使用 Casys PML，没关系。我们的专长是 Context Management、图数据库、DAG 编排。我们帮您设计最佳方案。' },
      { category: '培训', q: '你们提供哪些培训？', a: '智能体架构工作坊 (2-3天)、Casys PML 实操培训 (1天)、Context Management 基础 (半天)。所有课程根据您的技术栈和用例定制。' },
      { category: '培训', q: '培训在哪里进行？', a: '现场（台湾、亚太地区）、远程（全球）或混合模式。我们与 Alegria Group 合作在台湾举办定期工作坊，并参与 French Tech Taiwan 活动。' },
      { category: '通用', q: 'Casys 的商业模式是什么？', a: '三大支柱：(1) 开源工具（Casys PML、mcp-std、mcp-server——永久免费）；(2) 咨询（工作坊、架构评审、部署帮助）；(3) 培训（定制课程）。工具证明专长；咨询将其应用于您的具体场景。' },
      { category: '通用', q: 'Casys 适合谁？', a: '正在构建 AI 代理和智能体系统的公司的 CTO、技术负责人和工程经理。如果您面临上下文管理、工具编排或知识图谱挑战，我们可以提供帮助。' },
      { category: '通用', q: '你们的专业背景是什么？', a: '15+ 年上下文工程经验，从知识管理 (2013+) 到图数据库到 DAG 架构到 MCP 生态系统。在这个领域被叫做"AI 代理的 Context Management"之前，我们就已经在做了。' },
      { category: '通用', q: '你们的合作方式是怎样的？', a: '我们提供多种灵活选项：专项工作坊 (1天)、定制项目（完整部署）或持续合作（直接对接从业者）。没有高额最低承诺。我们优化迭代速度和可及性，而非利润最大化。联系我们讨论您的具体需求。' }
    ]
  },
  finalCta: {
    title: '准备好优化您的智能体架构了吗？',
    subtitle: '选择您想与我们合作的方式',
    ctas: [
      {
        icon: 'rocket_launch',
        text: '试用 Casys PML',
        subtext: '开源——30 秒安装',
        url: 'https://pml.casys.ai'
      },
      {
        icon: 'mail',
        text: '联系我们',
        subtext: '咨询与架构帮助',
        url: '#contact'
      }
    ],
    trustBadges: [
      { icon: 'check_circle', text: 'AGPL-3.0 开源' },
      { icon: 'check_circle', text: '15+ 年经验' },
      { icon: 'check_circle', text: '定价透明' }
    ]
  },
  contact: {
    title: '准备好开始了吗？',
    subtitle: '预约咨询电话、申请培训或讨论架构挑战。24小时内回复。',
    namePlaceholder: '您的姓名',
    emailPlaceholder: '您的工作邮箱',
    messagePlaceholder: '我想预约咨询 / 申请培训 / 讨论架构挑战',
    submitButton: '发送请求',
    sending: '发送中...',
    successMessage: '已收到您的请求！我们将在24小时内回复。',
    errorMessage: '发送失败，请重试。',
    hiddenSubject: '新的 CASYS 联系请求'
  },

  // ========================================
  // SUBSITE: ENGINE
  // ========================================
  engineHeader: {
    howItWorks: 'How It Works',
    shgat: 'SHGAT',
    benchmarks: 'Benchmarks',
    links: 'Links',
    docs: 'Docs',
    workWithUs: '合作咨询',
  },
  engineHero: {
    tagline: 'ML COMPUTATION LAYER',
    heroTitle1: 'Score, Rank, Build Paths',
    heroTitle2: 'No LLM Required',
    heroSubtitle: 'SHGAT attention networks score tool relevance across a hypergraph hierarchy. Multi-level message passing, K-head attention, zero LLM calls. Deterministic. Observable. Runs on your hardware.',
    statTools: 'Nodes indexed',
    statHit: 'Hit@3',
    statLatency: 'Score latency',
    ctaPrimary: 'How It Works',
    ctaDocs: 'Documentation',
    ctaSecondary: 'GitHub',
  },

  // ========================================
  // SUBSITE: MCP-SERVER
  // ========================================
  mcpServerHeader: {
    features: '功能',
    quickstart: '快速开始',
    pipeline: '流水线',
    install: '安装',
    docs: '文档',
    workWithUs: '合作咨询',
  },
  mcpServerHero: {
    tagline: 'MCP 的 Hono',
    heroTitle1: '交付真正可扩展的',
    heroTitle2: 'MCP 服务器',
    heroSubtitle: '不再为每个 MCP 服务器重新实现认证、限流和中间件。一个框架，默认可组合，从第一天起即可用于生产。',
    statFeatures: '内置功能',
    statTests: '测试通过',
    statRelease: '最新版本',
    ctaPrimary: '快速开始',
    ctaSecondary: '在 JSR 上查看',
    ctaDocs: '文档',
  },
  mcpServerInstall: {
    title: '随时',
    titleAccent: '就绪',
    subtitle: '一条命令。支持 Deno 和 Node.js。发布在 JSR，现代 JavaScript 注册表。',
    jsrLabel: 'JSR 注册表',
    githubLabel: 'GitHub',
    docsLabel: '文档',
    builtWith: '基于',
  },

  // ========================================
  // SUBSITE: MCP-STD
  // ========================================
  mcpStdHeader: {
    categories: '分类',
    catalog: '目录',
    quickstart: '快速开始',
    install: '安装',
    workWithUs: '合作咨询',
  },
  mcpStdHero: {
    tagline: 'MCP 标准工具箱',
    heroTitle1: '508 个工具。',
    heroTitle2: '一次导入。',
    heroSubtitle: '数据库、Git、Docker、加密、文本、网络、AI 代理——你自己会写的每个工具，已测试且类型化。',
    statTools: '工具',
    statCategories: '分类',
    statRelease: '最新',
    ctaPrimary: '浏览目录',
    ctaSecondary1: '快速开始',
    ctaSecondary2: '在 JSR 上查看',
  },
  mcpStdInstall: {
    title: '随时',
    titleAccent: '就绪',
    subtitle: '一条命令。支持 Deno。发布在 JSR，现代 JavaScript 注册表。',
    denoLabel: 'Deno',
    binaryLabel: '二进制',
    jsrLabel: 'JSR 注册表',
    githubLabel: 'GitHub',
    builtWith: '基于',
  },

  // ========================================
  // PML LANDING
  // ========================================
  pmlHero: {
    eyebrow: 'AI 代理的程序化记忆',
    titleLine1: '一个网关。任何模型。',
    titleAccent: '完整可观测性。',
    description: '一次构建 AI 工作流，使用 Claude、GPT、Gemini 或本地 Ollama 运行。每次工具调用均可追踪。秒级调试，而非小时。',
    ctaPrimary: '开始使用',
    ctaSecondary: '阅读文档',
    pillars: ['模型无关', '完整可追踪', '模式提取'],
    traceHeader: 'workflow:ci-deploy',
    traceLive: 'live',
    traceCalls: '22 次调用',
    traceModels: '3 个模型',
    traceCost: '$0.028',
  },
  pmlArchitecture: {
    eyebrow: '架构',
    title: '工作原理',
    description: '统一网关位于您的 LLM 和它所需工具之间。每个请求被分解为有向无环图，在沙箱中执行，并完全追踪。',
    clients: {
      label: '客户端',
      items: ['Claude', 'GPT', 'Gemini', 'Ollama', '任何 LLM'],
    },
    gateway: {
      label: 'PML 网关',
      pipeline: ['注册表', 'DAG', '沙箱'],
      extras: ['符号世界模型', '可观测性'],
    },
    servers: {
      label: 'MCP 服务器',
      items: ['filesystem', 'postgres', 'github', 'memory', '任何工具'],
    },
    pillars: [
      { label: '模型无关', description: '兼容任何 LLM 提供商' },
      { label: '可观测性', description: '每个操作的完整追踪' },
      { label: '符号推理', description: '符号推理层' },
    ],
    mobileArrow: '传输至',
  },
  pmlCatalogPreview: {
    label: '目录',
    browseCta: '浏览完整目录',
  },
  pmlQuickStart: {
    label: '快速开始',
    title: '3 步启动',
    subtitle: '不到一分钟为 Claude Code 添加程序化记忆。',
    docsLink: '阅读完整文档',
    steps: [
      {
        number: '01',
        title: '安装 PML',
        description: '一条命令。无依赖。支持 macOS、Linux 和 WSL。',
        file: 'terminal',
      },
      {
        number: '02',
        title: '初始化项目',
        description: 'PML 创建本地配置并连接到您的环境。',
        file: 'terminal',
      },
      {
        number: '03',
        title: '与 Claude Code 配合使用',
        description: 'PML 工具自动可用。发现、执行和学习。',
        file: 'claude-code',
      },
    ],
  },
  pmlIsolation: {
    eyebrow: '安全性',
    titleLine1: '自主的，',
    titleLine2: '但不鲁莽。',
    description: '每个 AI 操作都在带有资源限制的隔离沙箱中运行。危险操作在触及生产系统之前会暂停等待人工审批。',
    features: [
      {
        id: 'sandbox',
        title: '沙箱执行',
        description: '代码在隔离的 worker 中运行，无法直接访问主机系统或网络。',
      },
      {
        id: 'hil',
        title: '人在回路中',
        description: '文件写入或数据库变更等危险操作需要明确批准后才能执行。',
      },
      {
        id: 'audit',
        title: '审计追踪',
        description: '每个操作都会被记录完整上下文，以便透明和事后分析。',
      },
    ],
    svg: {
      sandbox: '沙箱',
      checkpoint: '检查点',
      protected: '受保护',
      aiActions: 'AI 操作',
      toolsData: '工具和数据',
      approve: '批准？',
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
    eyebrow: '抢先体验',
    title: '加入测试版',
    description: '成为首批为您的代理赋予程序化记忆的用户。',
    labelName: '姓名',
    labelEmail: '邮箱',
    labelUseCase: '您将如何使用 PML？',
    placeholderName: '您的姓名',
    placeholderEmail: 'you@company.com',
    placeholderUseCase: '例如：我想为我的 Claude Code 代理提供长期记忆，用于重复的 DevOps 工作流...',
    submit: '申请访问',
    sending: '发送中...',
    successMessage: '您已在列表中！我们会尽快联系您。',
    errorMessage: '出错了，请重试。',
    hiddenSubject: 'PML Beta 访问请求',
  },
  pmlCta: {
    title: '准备好了吗？',
    description: '为您的代理赋予程序化记忆。立即开始构建可观测的工作流。',
    primaryCta: '开始使用',
    secondaryCta: '申请测试版',
  },
  pmlIntelligence: {
    eyebrow: '模式提取',
    titleLine1: '每次执行',
    titleLine2: '都留下轨迹。',
    description: 'PML 记录完整的执行轨迹——工具序列、延迟、错误路径。SHGAT 从这些数据中提取相关性模式。确定性、可检查、无黑盒。',
    features: [
      {
        icon: 'hub',
        title: '执行轨迹',
        desc: '每次工作流运行都被完整记录：工具调用、输入、输出、时间、成本。数据保留在您的基础设施上。',
      },
      {
        icon: 'auto_awesome',
        title: '图注意力评分',
        desc: 'SHGAT 处理轨迹数据以评分工具相关性。跨超图层级的 K-head 注意力。无 LLM 调用。',
      },
      {
        icon: 'recommend',
        title: '共现模式',
        desc: '经常一起运行的工具会自动浮现。统计共现，而非猜测。',
      },
    ],
  },

  // ========================================
  // ENGINE (additional sections)
  // ========================================
  engineLinks: {
    title: 'Part of the',
    titleAccent: 'PML Ecosystem',
    subtitle: 'The engine runs inside PML. Self-hosted, open source, no external API calls.',
    jsrLabel: 'JSR',
    githubLabel: 'GitHub',
    docsLabel: 'Docs',
    pmlLabel: 'PML',
    builtWith: 'Built with',
  },
  engineBenchmarks: {
    title: 'Numbers,',
    titleAccent: 'Not Promises',
    subtitle: 'Benchmarked on 245 nodes (218 leaves + 26 composites + 1 root). All metrics from production traces.',
    shgatTitle: 'SHGAT-TF',
    shgatRows: [
      ['Hit@1', '56.2%'],
      ['Hit@3', '86.3%'],
      ['MRR', '0.705'],
      ['Leaves (L0)', '218'],
      ['Composites (L1)', '26'],
      ['Attention heads', '16 \u00d7 64D'],
      ['Hierarchy levels', '3 (L0 \u2192 L1 \u2192 L2)'],
      ['Score latency', '2.3s'],
    ],
  },
  engineHowItWorks: {
    title: 'From Intent to',
    titleAccent: 'Ranked Tools',
    subtitle: 'One model, one pipeline. SHGAT scores tool relevance across the full hierarchy, then the DAG executor runs the top-ranked tools.',
    steps: [
      { icon: 'search', label: 'Intent', sublabel: 'user query', type: 'incoming' },
      { icon: 'text_fields', label: 'Embed', sublabel: 'BGE-M3 1024D', type: '' },
      { icon: 'hub', label: 'SHGAT Score', sublabel: 'K-head \u00d7 16', type: '' },
      { icon: 'format_list_numbered', label: 'Rank', sublabel: 'top-K tools', type: '' },
      { icon: 'play_arrow', label: 'Execute', sublabel: 'DAG runner', type: 'handler' },
    ],
  },

  // ========================================
  // MCP-SERVER (additional sections)
  // ========================================
  mcpServerComparison: {
    title: 'SDK vs',
    titleAccent: '框架',
    subtitle: '官方 SDK 提供协议。这个提供生产级技术栈。',
    colSdk: '官方 SDK',
    colFramework: '@casys/mcp-server',
    rows: [
      ['MCP 协议', true, true],
      ['中间件管道', false, true],
      ['OAuth2 / JWT 认证', false, true],
      ['速率限制', false, true],
      ['Schema 验证', false, true],
      ['Streamable HTTP + SSE', '手动', '内置'],
      ['并发控制', false, true],
      ['OpenTelemetry 追踪', false, true],
      ['Prometheus 指标', false, true],
      ['MCP Apps (UI 资源)', '手动', '内置'],
    ],
  },
  mcpServerFeatures: {
    title: '开箱',
    titleAccent: '即用',
    subtitle: '请求到处理器之间的一切——都已搞定。',
    features: [
      { icon: 'swap_horiz', name: '双传输', desc: 'STDIO + Streamable HTTP，同一代码。' },
      { icon: 'layers', name: '中间件管道', desc: '类似 Koa 的洋葱模型。' },
      { icon: 'shield', name: 'OAuth2 认证', desc: 'JWT/Bearer + RFC 9728 元数据。' },
      { icon: 'key', name: 'OIDC 预设', desc: 'GitHub、Google、Auth0——一行代码。' },
      { icon: 'settings', name: 'YAML + 环境变量', desc: '文件配置，部署时环境变量覆盖。' },
      { icon: 'speed', name: '并发控制', desc: '背压策略：sleep、queue 或 reject。' },
      { icon: 'timer', name: '速率限制', desc: '滑动窗口，按客户端隔离。' },
      { icon: 'check_circle', name: 'Schema 验证', desc: '注册时通过 ajv 编译 JSON Schema。' },
      { icon: 'monitoring', name: '可观测性', desc: 'OTel span + Prometheus /metrics。' },
      { icon: 'widgets', name: 'MCP Apps', desc: '通过 ui:// scheme 提供交互式 UI。' },
    ],
  },
  mcpServerPipeline: {
    title: '你的服务器，',
    titleAccent: '你的规则',
    subtitle: '每个请求流经可组合的中间件链。需要认证？加上。限流？一行代码。自定义逻辑？插入任意位置。',
    steps: [
      { icon: 'arrow_forward', label: '请求', type: 'incoming' },
      { icon: 'timer', label: '限流', type: '' },
      { icon: 'shield', label: '认证', type: '' },
      { icon: 'tune', label: '自定义', type: 'custom' },
      { icon: 'verified_user', label: '权限', type: '' },
      { icon: 'check_circle', label: '验证', type: '' },
      { icon: 'speed', label: '背压', type: '' },
      { icon: 'play_arrow', label: '处理器', type: 'handler' },
    ],
  },
  mcpServerQuickStart: {
    title: '5 行代码到',
    titleAccent: '生产',
    subtitle: '无样板代码。无配置仪式。注册工具，调用 start()，直接上线。',
    tabBasic: '基础 (STDIO)',
    tabHttp: 'HTTP + 认证',
    tabYaml: 'YAML 配置',
  },

  // ========================================
  // MCP-STD (additional sections)
  // ========================================
  mcpStdQuickStart: {
    title: '3 行代码到',
    titleAccent: '生产',
    subtitle: '作为独立 MCP 服务器使用，或作为库导入单个工具。由您决定。',
    tabServer: 'MCP 服务器',
    tabLibrary: '库模式',
    tabCategory: '按类别',
  },
  mcpStdCategories: {
    title: '29 个',
    titleAccent: '分类',
    subtitle: '从数据库查询到 AI 智能体编排，每个工具都已分类、随时可用。',
    cta: '浏览全部 508 个工具',
  },

  // ========================================
  // ENGINE - SHGAT Section
  // ========================================
  engineShgat: {
    eyebrow: 'SHGAT-TF',
    titleLine1: 'SuperHyperGraph',
    titleLine2: 'Attention Networks',
    description:
      'Why a hypergraph? Regular graphs model pairwise relations (tool A calls tool B). Hypergraphs model N-to-N: one composite groups multiple leaves, one leaf belongs to multiple composites. This captures the real structure of agentic tool ecosystems.',
    features: [
      {
        icon: 'hub',
        title: 'K-Head Attention (16 \u00d7 64D)',
        desc: 'Each head captures a different relevance signal \u2014 co-occurrence, recency, error recovery, success rates. Heads are combined via learned fusion weights.',
      },
      {
        icon: 'account_tree',
        title: 'Multi-Level Message Passing',
        desc: 'L0: 218 leaves (tools). L1: 26 composites. L2: meta-composites. Context propagates bottom-up then top-down. A leaf inherits relevance from sibling composites it has never been paired with.',
      },
      {
        icon: 'trending_up',
        title: 'InfoNCE Contrastive Loss',
        desc: 'Temperature-annealed training (0.10 \u2192 0.06) with hard negatives and prioritized experience replay. Hit@3 reaches 86.3% on 644 nodes.',
      },
      {
        icon: 'model_training',
        title: 'Training Included',
        desc: 'SHGAT-TF trains from production traces \u2014 no external service, no GPU required. libtensorflow FFI runs natively via Deno.dlopen. Self-contained.',
      },
    ],
  },

  // ========================================
  // ABOUT PAGE
  // ========================================
  about: {
    pageTitle: '关于',
    heroName: 'Erwan Le Pesle',
    heroTitle: '创始人 & 系统架构师，Casys',
    heroBio: '十五年来，我们一直在构建将知识转化为行动的系统——从 mIRC 上的早期聊天机器人，到企业知识管理，再到用于工具相关性的图注意力网络。当大语言模型出现时，问题没有改变：上下文输入，行动输出。MCP 是这一原则最新的表达，也是最具影响力的。Casys AI 帮助工程团队交付可靠的 AI 集成——无供应商锁定，无黑盒。',
    expertiseTitle: '我们做什么',
    expertiseSubtitle: '连接 AI 系统与现实世界数据、工具和工作流的基础设施——为生产环境的可观测性和确定性而构建。',
    areas: [
      {
        icon: 'hub',
        title: '知识图谱',
        description: '模式设计、查询优化和图原生架构。Neo4j 认证专业开发者。从本体建模到生产级图管道。',
      },
      {
        icon: 'database',
        title: '图数据库',
        description: '建模关系型数据库无法表达的复杂关系。我们设计、部署和优化处理真实生产流量的 Neo4j 实例。',
      },
      {
        icon: 'smart_toy',
        title: '智能体系统',
        description: '工具编排、上下文路由和执行可靠性。我们架构多智能体系统，使每个决策可追溯，每个故障可恢复。',
      },
      {
        icon: 'cable',
        title: 'MCP 基础设施',
        description: '服务器架构、连接器设计和协议级优化。已交付 500+ 开源工具。我们构建可观测、可测试、生产就绪的 MCP 层。',
      },
    ],
    philosophyTitle: '我们的工作方式',
    principles: [
      {
        icon: 'code',
        title: '以开源为基石',
        description: '我们的核心工具是开源的。客户获得的解决方案建立在可审查、可分叉、可拥有的代码之上。无供应商锁定，无黑盒。',
      },
      {
        icon: 'science',
        title: '能上线的研究',
        description: '我们发布所学，交付所建。我们推荐的每项技术都经过真实工作负载的验证，而非仅限于基准测试。',
      },
      {
        icon: 'emoji_objects',
        title: '务实，不炒作',
        description: '我们不贩卖"AI 转型"。我们用具体的工程方法解决具体的基础设施问题。让工作成果说话。',
      },
    ],
    ctaTitle: '从一个问题开始',
    ctaSubtitle: '描述您的 MCP 基础设施挑战、知识图谱瓶颈或智能体系统设计问题。我们会坦诚告知是否能帮到您——以及我们会如何着手解决。',
    ctaPrimary: {
      text: '联系我们',
      url: '/#contact',
      icon: 'mail',
    },
    ctaSecondary: {
      text: '查看项目',
      url: '/#projects',
      icon: 'folder_open',
    },
  },

  // ========================================
  // USE CASES PAGE
  // ========================================
  useCases: {
    pageTitle: '我们的工作',
    heroTitle: '我们的工作',
    heroSubtitle: '我们为生产环境构建 MCP 基础设施。以下是实际案例——真实的挑战、真实的解决方案、真实的指标。',
    labelChallenge: '挑战',
    labelApproach: '解决方案',
    labelResult: '成果',
    labelStack: '技术栈',
    ctaTitle: '有类似的挑战？',
    ctaSubtitle: '描述您的 MCP 基础设施挑战。我们会坦诚告知是否能帮到您——以及我们会如何着手解决。',
    ctaPrimary: { text: '联系我们', url: '/#contact', icon: 'mail' },
    ctaSecondary: { text: '查看项目', url: '/#projects', icon: 'folder_open' },
  },
};
