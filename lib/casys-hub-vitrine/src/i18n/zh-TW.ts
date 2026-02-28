// ============================================================
// Traditional Chinese (Taiwan) translations for Casys Hub Vitrine
// Organized by page/section
// ============================================================

import type { Translations } from "./index";

export const zh_TW: Translations = {
  // ========================================
  // SHARED COMPONENTS
  // ========================================
  header: {
    projects: "專案",
    whyCasys: "為什麼選擇 Casys",
    consulting: "諮詢服務",
    blog: "Blog",
    useCases: "我們的工作",
    about: "關於我們",
    contact: "聯繫我們",
  },
  footer: {
    product: "產品",
    projects: "專案",
    consulting: "諮詢服務",
    training: "培訓",
    github: "GitHub",
    openSource: "開源專案",
    connect: "連結",
    contact: "聯繫我們",
    discord: "Discord",
    description: "智慧體架構與上下文系統",
    tagline: "開源工具 & 諮詢服務",
  },
  subsiteFooter: {
    product: "產品",
    projects: "專案",
    consulting: "諮詢服務",
    training: "培訓",
    openSource: "開源專案",
    connect: "連結",
    contact: "聯繫我們",
    discord: "Discord",
    description: "智慧體架構與上下文系統",
    tagline: "開源工具 & 諮詢服務",
  },

  // ========================================
  // LANDING V2 SECTIONS
  // ========================================
  hero: {
    kicker: "智慧體架構與上下文系統",
    titleLine1: "從知識圖譜",
    titleLine2: "到 MCP 伺服器",
    subtitle: "十五年以上上下文工程經驗 — 以開源基礎設施交付給您的團隊。",
    cta: {
      primary: { text: "與我們合作", icon: "handshake", url: "#contact" },
      secondary: { text: "探索專案", icon: "explore", url: "#projects" },
    },
    proofs: [
      { name: "mcp-std", stat: "508 個工具", url: "https://mcp-std.casys.ai" },
      { name: "mcp-server", stat: "生產認證", url: "https://mcp-server.casys.ai" },
      { name: "mcp-bridge", stat: "Telegram", url: "https://mcp-bridge.casys.ai" },
      { name: "Casys PML", stat: "閘道", url: "https://pml.casys.ai" },
    ],
  },
  socialProof: {
    title: "Track Record",
    subtitle: "用成果說話，不靠承諾",
    items: [
      {
        type: "stat",
        icon: "code",
        stat: "活躍",
        label: "開發中",
        description: "Casys PML - 整合 GraphRAG 和 DAG 的 MCP Gateway",
        link: {
          text: "在 GitHub 上關注",
          url: "https://github.com/Casys-AI/casys-pml",
        },
      },
      {
        type: "stat",
        icon: "groups",
        stat: "15+",
        label: "年經驗",
        description: "Context Management → Graph DBs → DAGs → MCP",
        link: {
          text: "了解我們的故事",
          url: "/about",
        },
      },
      {
        type: "stat",
        icon: "public",
        stat: "French Tech",
        label: "台灣",
        description: "French Tech Taiwan 社群活躍成員",
        link: {
          text: "查看演講",
          url: "/blog?tag=talks",
        },
      },
    ],
    githubTitle: "開源成果",
    githubCta: "查看所有 GitHub 專案",
    repos: [
      {
        name: "@casys/mcp-server",
        description: "生產級 MCP 伺服器，支援中介軟體管線",
        stars: "★ New",
        url: "https://github.com/Casys-AI/casys-mcp-server",
      },
      {
        name: "@casys/mcp-std",
        description: "508+ MCP 代理工具",
        stars: "★ New",
        url: "https://github.com/Casys-AI/casys-mcp-std",
      },
    ],
  },
  workWithUs: {
    title: "與我們合作",
    subtitle: "我們的工具免費開源。當您需要部署協助時，我們隨時為您服務。",
    options: [
      {
        id: "explore",
        icon: "explore",
        title: "探索",
        tagline: "免費與開源",
        description: "了解我們的工具，閱讀研究，加入社群。",
        items: [
          { icon: "code", text: "Casys PML - AI 代理的程序記憶層", url: "https://pml.casys.ai" },
          { icon: "article", text: "部落格與技術文章", url: "/blog" },
          {
            icon: "groups",
            text: "French Tech Taiwan 社群",
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
        title: "學習",
        tagline: "培訓與工作坊",
        description: "掌握我們研究領域的實作課程。",
        items: [
          { icon: "smart_toy", text: "AI 代理上下文管理 (2-3天)" },
          { icon: "hub", text: "嵌入式圖資料庫 (1-2天)" },
          { icon: "architecture", text: "多領域 AI 架構 (3-5天)" },
        ],
        details: ["現場或遠端", "實作練習", "客製教材"],
        cta: { text: "申請培訓", url: "#contact", icon: "calendar_today" },
      },
      {
        id: "collaborate",
        icon: "handshake",
        title: "合作",
        tagline: "諮詢與專案",
        description: "為您複雜的 AI 架構提供實作協助。",
        items: [
          { icon: "check_circle", text: "架構評審與策略" },
          { icon: "check_circle", text: "部署與客製整合" },
          { icon: "check_circle", text: "效能最佳化" },
          { icon: "check_circle", text: "配對程式設計與程式碼審查" },
        ],
        engagement: "典型專案週期：2-5天。遠端優先，時區彈性。",
        highlights: ["直接對接開發者", "無最低承諾", "快速迭代"],
        cta: { text: "聯繫我們", url: "#contact", icon: "mail" },
      },
    ],
  },
  whatWeDo: {
    title: "Context Engineering 與 MCP 基礎設施",
    subtitle: "應用研究、開源工具與智慧體架構諮詢",
    cards: [
      {
        id: "research",
        icon: "school",
        title: "研究與探索",
        subtitle: "多領域 AI 架構",
        description: "知識管理 (2013+) → 圖資料庫 → 現代智慧體系統",
        researchAreas: [
          {
            name: "知識管理",
            description: "15+ 年 KM 系統、圖譜、語意搜尋經驗",
          },
          {
            name: "智慧體系統",
            description: "上下文最佳化、編排、多代理架構",
          },
          {
            name: "內容智慧",
            description: "基於圖的內容系統、自動化關係",
          },
          {
            name: "資料庫系統",
            description: "圖譜知識儲存架構",
          },
        ],
        philosophy: [
          { icon: "vertical_align_bottom", text: "深度優先——但不懼探索新領域" },
          { icon: "public", text: "開放研究——我們發布所學" },
          { icon: "rocket_launch", text: "務實——研究能在生產中落地" },
        ],
      },
      {
        id: "opensource",
        icon: "code",
        title: "開源專案",
        subtitle: "開源工具",
        projects: ["MCP Gateway: 上下文管理"],
        highlights: ["預設開源", "生產就緒", "諮詢可選"],
      },
      {
        id: "consulting",
        icon: "engineering",
        title: "諮詢",
        subtitle: "實作協助",
        services: ["架構與策略", "實施與部署", "培訓"],
        highlights: ["彈性定價", "無最低承諾", "直接對接開發者"],
      },
    ],
  },
  projects: {
    title: "開源 MCP 工具",
    subtitle: "MCP 生態系統的開源工具。從協定工具到圖智慧。",
    featured: {
      name: "Casys PML",
      tagline: "一個閘道。任何模型。完整可觀測性。",
      status: "活躍開發中",
      license: "AGPL-3.0",
      features: [
        {
          icon: "swap_horiz",
          name: "模型無關",
          description: "Claude、GPT、Gemini、Ollama——自由切換",
        },
        {
          icon: "visibility",
          name: "完整可觀測性",
          description: "每次工具呼叫均可追溯：成本、延遲、狀態",
        },
        { icon: "auto_awesome", name: "模式提取", description: "SHGAT 從執行軌跡中提取相關性模式" },
      ],
      results: [
        { stat: "120+", label: "目錄中的能力" },
        { stat: "4", label: "支援的 LLM 提供商" },
        { stat: "免費", label: "開源測試版" },
      ],
      links: {
        website: "https://pml.casys.ai",
        github: "https://github.com/Casys-AI/casys-pml",
        docs: "https://pml.casys.ai/docs",
      },
    },
    categories: [
      {
        name: "MCP 基礎設施",
        items: [
          {
            id: "mcp-std",
            name: "@casys/mcp-std",
            tagline: "508 個 MCP 工具。一行匯入。",
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
            tagline: "生產級 MCP 伺服器框架",
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
            tagline: "MCP Apps 橋接訊息平台",
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
    title: "為什麼選擇 Casys？",
    subtitle: "我們的不同之處",
    differentiation: [
      {
        id: "multi-domain",
        icon: "hub",
        title: "多領域專長",
        description: "我們連結多個領域以獲得獨特洞察",
        highlights: [
          "KM 系統 (2013+) → 圖資料庫 → AI 代理",
          "跨領域碰撞產生洞察",
          "專長跨技術浪潮持續累積",
        ],
      },
      {
        id: "continuity",
        icon: "timeline",
        title: "15+ 年持續發展",
        description: "不是追逐熱潮的 AI 新手",
        highlights: [
          "15+ 年的實績",
          "深度專長，而非表面熱潮",
          "每個階段都建立在前一個之上",
        ],
      },
      {
        id: "opensource",
        icon: "code_blocks",
        title: "開源優先",
        description: "預設開源。工具免費，諮詢可選",
        highlights: [
          "預設開源",
          "無供應商鎖定",
          "分享研究成果",
        ],
      },
      {
        id: "practical",
        icon: "rocket_launch",
        title: "務實研究",
        description: "我們發布解決實際問題的生產系統",
        highlights: [
          "生產就緒，不僅是原型",
          "在真實環境中經過檢驗",
          "我們使用自己的工具",
        ],
      },
      {
        id: "accessible",
        icon: "handshake",
        title: "無門檻設計",
        description: "無企業級開銷",
        highlights: [
          "透明定價",
          "無最低承諾規模",
          "直接對接開發者",
        ],
      },
    ],
    bottomLine: {
      text:
        "一個在上下文管理和智慧體系統方面擁有深度專長的小型事務所。我們建構實用工具，分享所學，在需要時協助團隊。",
      cta: {
        primary: {
          text: "聯繫我們",
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
    title: "部落格：AI 研究與架構",
    subtitle: "關於 AI 架構、工具編排以及我們正在建構的內容",
    readMore: "閱讀",
    viewAll: "查看所有文章",
  },
  faq: {
    title: "常見問題",
    subtitle: "關於我們專案和 Casys 的一切",
    categories: ["專案", "諮詢", "培訓", "通用"],
    allLabel: "全部",
    faqs: [
      {
        category: "專案",
        q: "Casys PML 到底是什麼？",
        a: "Casys PML 是一個模型無關的 MCP 閘道。一次建構 AI 工作流，在 Claude、GPT、Gemini 或本地 Ollama 上執行。每次工具呼叫都被追蹤（成本、延遲、狀態），SHGAT 從執行資料中提取相關性模式以改進工具評分。",
      },
      {
        category: "專案",
        q: "Casys PML 與其他 MCP 工具有什麼不同？",
        a: "Casys PML 是統一閘道，而非僅僅是 MCP 客戶端。它提供：(1) 動態切換 LLM 提供商（無供應商鎖定）；(2) 對每次工具呼叫的完整可觀測性，包括成本和延遲追蹤；(3) 基於圖的模式提取——SHGAT 從執行軌跡評分工具相關性。唯一結合模型無關路由+可觀測性+圖注意力評分的 MCP 閘道。",
      },
      {
        category: "專案",
        q: "支援哪些 LLM 模型？",
        a: "Claude (Anthropic)、GPT (OpenAI)、Gemini (Google) 和 Ollama（本地/自託管）。PML 作為閘道：無需重寫工作流即可切換提供商。目錄包含 120+ 個即用能力。",
      },
      {
        category: "專案",
        q: "Casys PML 是開源的嗎？",
        a: "是的。AGPL-3.0 授權條款。您可以永久免費自託管、閱讀程式碼、修改和貢獻。託管服務為需要雲端同步和協作的團隊可選。",
      },
      {
        category: "專案",
        q: "Casys PML 目前處於什麼狀態？",
        a: "活躍開發中。核心功能已就緒：GraphRAG 發現、DAG 編排與平行執行、隔離 TypeScript 沙箱、即時可觀測性。Deno 2.x + PGlite 架構。在 GitHub 上關注進展。",
      },
      {
        category: "諮詢",
        q: "諮詢包括什麼？",
        a: "架構評審、部署協助、客製 MCP 整合、上下文策略設計、團隊培訓。我們與您的程式碼庫進行實作合作。彈性選項：短期工作坊、客製專案、持續合作夥伴關係和客製企業方案。",
      },
      {
        category: "諮詢",
        q: "為什麼選擇 Casys 而不是大型顧問公司？",
        a: "我們是建構 Casys PML 的團隊。我們為自己推薦的系統編寫程式碼。您直接對接技術專家，而非客戶經理。更快的迭代、彈性的入門門檻、沒有大型顧問公司那樣的高額最低承諾。",
      },
      {
        category: "諮詢",
        q: "你們只做 Casys PML 還是也做其他架構？",
        a: "我們服務任何智慧體架構。如果您沒有使用 Casys PML，沒關係。我們的專長是 Context Management、圖資料庫、DAG 編排。我們幫您設計最佳方案。",
      },
      {
        category: "培訓",
        q: "你們提供哪些培訓？",
        a: "智慧體架構工作坊 (2-3天)、Casys PML 實作培訓 (1天)、Context Management 基礎 (半天)。所有課程根據您的技術棧和使用案例客製。",
      },
      {
        category: "培訓",
        q: "培訓在哪裡進行？",
        a: "現場（台灣、亞太地區）、遠端（全球）或混合模式。我們與 Alegria Group 合作在台灣舉辦定期工作坊，並參與 French Tech Taiwan 活動。",
      },
      {
        category: "通用",
        q: "Casys 的商業模式是什麼？",
        a: "三大支柱：(1) 開源工具（Casys PML、mcp-std、mcp-server——永久免費）；(2) 諮詢（工作坊、架構評審、部署協助）；(3) 培訓（客製課程）。工具證明專長；諮詢將其應用於您的具體場景。",
      },
      {
        category: "通用",
        q: "Casys 適合誰？",
        a: "正在建構 AI 代理和智慧體系統的公司的 CTO、技術負責人和工程經理。如果您面臨上下文管理、工具編排或知識圖譜挑戰，我們可以提供協助。",
      },
      {
        category: "通用",
        q: "你們的專業背景是什麼？",
        a: '15+ 年上下文工程經驗，從知識管理 (2013+) 到圖資料庫到 DAG 架構到 MCP 生態系統。在這個領域被叫做「AI 代理的 Context Management」之前，我們就已經在做了。',
      },
      {
        category: "通用",
        q: "你們的合作方式是怎樣的？",
        a: "我們提供多種彈性選項：專項工作坊 (1天)、客製專案（完整部署）或持續合作（直接對接從業者）。沒有高額最低承諾。我們最佳化迭代速度和可及性，而非利潤最大化。聯繫我們討論您的具體需求。",
      },
    ],
  },
  finalCta: {
    title: "準備好最佳化您的智慧體架構了嗎？",
    subtitle: "選擇您想與我們合作的方式",
    ctas: [
      {
        icon: "rocket_launch",
        text: "試用 Casys PML",
        subtext: "開源——30 秒安裝",
        url: "https://pml.casys.ai",
      },
      {
        icon: "mail",
        text: "聯繫我們",
        subtext: "諮詢與架構協助",
        url: "#contact",
      },
    ],
    trustBadges: [
      { icon: "check_circle", text: "AGPL-3.0 開源" },
      { icon: "check_circle", text: "15+ 年經驗" },
      { icon: "check_circle", text: "定價透明" },
    ],
  },
  contact: {
    title: "準備好開始了嗎？",
    subtitle: "預約諮詢電話、申請培訓或討論架構挑戰。24小時內回覆。",
    namePlaceholder: "您的姓名",
    emailPlaceholder: "您的工作信箱",
    messagePlaceholder: "我想預約諮詢 / 申請培訓 / 討論架構挑戰",
    submitButton: "發送請求",
    sending: "發送中...",
    successMessage: "已收到您的請求！我們將在24小時內回覆。",
    errorMessage: "發送失敗，請重試。",
    hiddenSubject: "新的 CASYS 聯繫請求",
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
    workWithUs: "合作諮詢",
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
    quickstart: "快速開始",
    pipeline: "管線",
    install: "安裝",
    docs: "文件",
    workWithUs: "合作諮詢",
  },
  mcpServerHero: {
    tagline: "MCP 的 Hono",
    heroTitle1: "交付真正可擴展的",
    heroTitle2: "MCP 伺服器",
    heroSubtitle:
      "不再為每個 MCP 伺服器重新實作認證、限流和中介軟體。一個框架，預設可組合，從第一天起即可用於生產。",
    statFeatures: "內建功能",
    statTests: "測試通過",
    statRelease: "最新版本",
    ctaPrimary: "快速開始",
    ctaSecondary: "在 JSR 上查看",
    ctaDocs: "文件",
  },
  mcpServerInstall: {
    title: "隨時",
    titleAccent: "就緒",
    subtitle: "一條指令。支援 Deno 和 Node.js。發布在 JSR，現代 JavaScript 登錄檔。",
    jsrLabel: "JSR 登錄檔",
    githubLabel: "GitHub",
    docsLabel: "文件",
    builtWith: "基於",
  },

  // ========================================
  // SUBSITE: MCP-STD
  // ========================================
  mcpStdHeader: {
    categories: "分類",
    catalog: "目錄",
    quickstart: "快速開始",
    install: "安裝",
    workWithUs: "合作諮詢",
  },
  mcpStdHero: {
    tagline: "MCP 標準工具箱",
    heroTitle1: "508 個工具。",
    heroTitle2: "一次匯入。",
    heroSubtitle:
      "資料庫、Git、Docker、加密、文字、網路、AI 代理——你自己會寫的每個工具，已測試且型別化。",
    statTools: "工具",
    statCategories: "分類",
    statRelease: "最新",
    ctaPrimary: "瀏覽目錄",
    ctaSecondary1: "快速開始",
    ctaSecondary2: "在 JSR 上查看",
  },
  mcpStdInstall: {
    title: "隨時",
    titleAccent: "就緒",
    subtitle: "一條指令。支援 Deno。發布在 JSR，現代 JavaScript 登錄檔。",
    denoLabel: "Deno",
    binaryLabel: "二進位",
    jsrLabel: "JSR 登錄檔",
    githubLabel: "GitHub",
    builtWith: "基於",
  },

  // ========================================
  // PML LANDING
  // ========================================
  pmlHero: {
    eyebrow: "AI 代理的程序化記憶",
    titleLine1: "一個閘道。任何模型。",
    titleAccent: "完整可觀測性。",
    description:
      "一次建構 AI 工作流，使用 Claude、GPT、Gemini 或本地 Ollama 執行。每次工具呼叫均可追蹤。秒級除錯，而非小時。",
    ctaPrimary: "開始使用",
    ctaSecondary: "閱讀文件",
    pillars: ["模型無關", "完整可追蹤", "模式提取"],
    traceHeader: "workflow:ci-deploy",
    traceLive: "live",
    traceCalls: "22 次呼叫",
    traceModels: "3 個模型",
    traceCost: "$0.028",
  },
  pmlArchitecture: {
    eyebrow: "架構",
    title: "工作原理",
    description:
      "統一閘道位於您的 LLM 和它所需工具之間。每個請求被分解為有向無環圖，在沙箱中執行，並完全追蹤。",
    clients: {
      label: "客戶端",
      items: ["Claude", "GPT", "Gemini", "Ollama", "任何 LLM"],
    },
    gateway: {
      label: "PML 閘道",
      pipeline: ["登錄檔", "DAG", "沙箱"],
      extras: ["符號世界模型", "可觀測性"],
    },
    servers: {
      label: "MCP 伺服器",
      items: ["filesystem", "postgres", "github", "memory", "任何工具"],
    },
    pillars: [
      { label: "模型無關", description: "相容任何 LLM 提供商" },
      { label: "可觀測性", description: "每個操作的完整追蹤" },
      { label: "符號推理", description: "符號推理層" },
    ],
    mobileArrow: "傳輸至",
  },
  pmlCatalogPreview: {
    label: "目錄",
    browseCta: "瀏覽完整目錄",
  },
  pmlQuickStart: {
    label: "快速開始",
    title: "3 步啟動",
    subtitle: "不到一分鐘為 Claude Code 添加程序化記憶。",
    docsLink: "閱讀完整文件",
    steps: [
      {
        number: "01",
        title: "安裝 PML",
        description: "一條指令。無相依性。支援 macOS、Linux 和 WSL。",
        file: "terminal",
      },
      {
        number: "02",
        title: "初始化專案",
        description: "PML 建立本地設定並連接到您的環境。",
        file: "terminal",
      },
      {
        number: "03",
        title: "與 Claude Code 搭配使用",
        description: "PML 工具自動可用。發現、執行和學習。",
        file: "claude-code",
      },
    ],
  },
  pmlIsolation: {
    eyebrow: "安全性",
    titleLine1: "自主的，",
    titleLine2: "但不魯莽。",
    description:
      "每個 AI 操作都在帶有資源限制的隔離沙箱中執行。危險操作在觸及生產系統之前會暫停等待人工審批。",
    features: [
      {
        id: "sandbox",
        title: "沙箱執行",
        description: "程式碼在隔離的 worker 中執行，無法直接存取主機系統或網路。",
      },
      {
        id: "hil",
        title: "人在迴圈中",
        description: "檔案寫入或資料庫變更等危險操作需要明確批准後才能執行。",
      },
      {
        id: "audit",
        title: "稽核追蹤",
        description: "每個操作都會被記錄完整上下文，以便透明和事後分析。",
      },
    ],
    svg: {
      sandbox: "沙箱",
      checkpoint: "檢查點",
      protected: "受保護",
      aiActions: "AI 操作",
      toolsData: "工具和資料",
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
    eyebrow: "搶先體驗",
    title: "加入測試版",
    description: "成為首批為您的代理賦予程序化記憶的使用者。",
    labelName: "姓名",
    labelEmail: "信箱",
    labelUseCase: "您將如何使用 PML？",
    placeholderName: "您的姓名",
    placeholderEmail: "you@company.com",
    placeholderUseCase:
      "例如：我想為我的 Claude Code 代理提供長期記憶，用於重複的 DevOps 工作流...",
    submit: "申請存取",
    sending: "發送中...",
    successMessage: "您已在名單中！我們會盡快聯繫您。",
    errorMessage: "出錯了，請重試。",
    hiddenSubject: "PML Beta 存取請求",
  },
  pmlCta: {
    title: "準備好了嗎？",
    description: "為您的代理賦予程序化記憶。立即開始建構可觀測的工作流。",
    primaryCta: "開始使用",
    secondaryCta: "申請測試版",
  },
  pmlIntelligence: {
    eyebrow: "模式提取",
    titleLine1: "每次執行",
    titleLine2: "都留下軌跡。",
    description:
      "PML 記錄完整的執行軌跡——工具序列、延遲、錯誤路徑。SHGAT 從這些資料中提取相關性模式。確定性、可檢查、無黑箱。",
    features: [
      {
        icon: "hub",
        title: "執行軌跡",
        desc:
          "每次工作流執行都被完整記錄：工具呼叫、輸入、輸出、時間、成本。資料保留在您的基礎設施上。",
      },
      {
        icon: "auto_awesome",
        title: "圖注意力評分",
        desc: "SHGAT 處理軌跡資料以評分工具相關性。跨超圖層級的 K-head 注意力。無 LLM 呼叫。",
      },
      {
        icon: "recommend",
        title: "共現模式",
        desc: "經常一起執行的工具會自動浮現。統計共現，而非猜測。",
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
    subtitle: "官方 SDK 提供協定。這個提供生產級技術棧。",
    colSdk: "官方 SDK",
    colFramework: "@casys/mcp-server",
    rows: [
      ["MCP 協定", true, true],
      ["中介軟體管線", false, true],
      ["OAuth2 / JWT 認證", false, true],
      ["速率限制", false, true],
      ["Schema 驗證", false, true],
      ["Streamable HTTP + SSE", "手動", "內建"],
      ["並行控制", false, true],
      ["OpenTelemetry 追蹤", false, true],
      ["Prometheus 指標", false, true],
      ["MCP Apps (UI 資源)", "手動", "內建"],
      ["CORS 白名單", false, true],
      ["請求體大小限制 (413)", false, true],
      ["IP 速率限制 (429)", false, true],
      ["工作階段傳播", false, true],
      ["HMAC 訊息簽章", false, true],
      ["CSP 注入", false, true],
      ["YAML + 環境變數設定", false, true],
      ["Deno + Node.js", "僅 Node", "兩者都支援"],
    ],
  },
  mcpServerFeatures: {
    title: "開箱",
    titleAccent: "即用",
    subtitle: "請求到處理器之間的一切——都已搞定。",
    features: [
      { icon: "swap_horiz", name: "雙傳輸", desc: "STDIO + Streamable HTTP，同一程式碼。" },
      { icon: "layers", name: "中介軟體管線", desc: "類似 Koa 的洋蔥模型。" },
      { icon: "shield", name: "OAuth2 認證", desc: "JWT/Bearer + RFC 9728 元資料。" },
      { icon: "key", name: "OIDC 預設", desc: "GitHub、Google、Auth0——一行程式碼。" },
      { icon: "settings", name: "YAML + 環境變數", desc: "檔案設定，部署時環境變數覆蓋。" },
      { icon: "speed", name: "並行控制", desc: "背壓策略：sleep、queue 或 reject。" },
      { icon: "timer", name: "速率限制", desc: "滑動視窗，按客戶端隔離。" },
      { icon: "check_circle", name: "Schema 驗證", desc: "註冊時透過 ajv 編譯 JSON Schema。" },
      { icon: "monitoring", name: "可觀測性", desc: "OTel span + Prometheus /metrics。" },
      { icon: "widgets", name: "MCP Apps", desc: "透過 ui:// scheme 提供互動式 UI。" },
      { icon: "lock", name: "CORS 白名單", desc: "來源白名單，萬用字元自動告警。" },
      { icon: "upload_file", name: "請求體限制", desc: "maxBodyBytes + 413 JSON-RPC 錯誤。" },
      { icon: "block", name: "IP 速率限制", desc: "按 IP 429 + Retry-After HTTP 標頭。" },
      { icon: "badge", name: "工作階段傳播", desc: "sessionId 注入中介軟體上下文。" },
      {
        icon: "enhanced_encryption",
        name: "HMAC 簽章",
        desc: "SHA-256 簽章/驗證 + PostMessage 防重放。",
      },
      { icon: "security", name: "CSP 注入", desc: "MCP Apps 自動注入 Content-Security-Policy。" },
    ],
  },
  mcpServerPipeline: {
    title: "你的伺服器，",
    titleAccent: "你的規則",
    subtitle:
      "每個請求流經可組合的中介軟體鏈。需要認證？加上。限流？一行程式碼。自訂邏輯？插入任意位置。",
    steps: [
      { icon: "arrow_forward", label: "請求", type: "incoming" },
      { icon: "timer", label: "限流", type: "" },
      { icon: "shield", label: "認證", type: "" },
      { icon: "tune", label: "自訂", type: "custom" },
      { icon: "verified_user", label: "權限", type: "" },
      { icon: "check_circle", label: "驗證", type: "" },
      { icon: "speed", label: "背壓", type: "" },
      { icon: "play_arrow", label: "處理器", type: "handler" },
    ],
  },
  mcpServerQuickStart: {
    title: "5 行程式碼到",
    titleAccent: "生產",
    subtitle: "無樣板程式碼。無設定儀式。註冊工具，呼叫 start()，直接上線。",
    tabBasic: "基礎 (STDIO)",
    tabHttp: "HTTP + 認證",
    tabYaml: "YAML 設定",
  },

  // ========================================
  // MCP-STD (additional sections)
  // ========================================
  mcpStdQuickStart: {
    title: "3 行程式碼到",
    titleAccent: "生產",
    subtitle: "作為獨立 MCP 伺服器使用，或作為程式庫匯入單個工具。由您決定。",
    tabServer: "MCP 伺服器",
    tabLibrary: "程式庫模式",
    tabCategory: "按類別",
  },
  mcpStdCategories: {
    title: "29 個",
    titleAccent: "分類",
    subtitle: "從資料庫查詢到 AI 智慧體編排，每個工具都已分類、隨時可用。",
    cta: "瀏覽全部 508 個工具",
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
    pageTitle: "關於",
    heroName: "Erwan Lee Pesle",
    heroTitle: "創辦人 & 系統架構師，Casys",
    heroBio:
      "十五年來，我們一直在建構將知識轉化為行動的系統——從 mIRC 上的早期聊天機器人，到企業知識管理，再到用於工具相關性的圖注意力網路。當大語言模型出現時，問題沒有改變：上下文輸入，行動輸出。MCP 是這一原則最新的表達，也是最具影響力的。Casys AI 協助工程團隊交付可靠的 AI 整合——無供應商鎖定，無黑箱。",
    expertiseTitle: "我們做什麼",
    expertiseSubtitle:
      "連結 AI 系統與現實世界資料、工具和工作流的基礎設施——為生產環境的可觀測性和確定性而建構。",
    areas: [
      {
        icon: "hub",
        title: "知識圖譜",
        description:
          "模式設計、查詢最佳化和圖原生架構。Neo4j 認證專業開發者。從本體建模到生產級圖管線。",
      },
      {
        icon: "database",
        title: "圖資料庫",
        description:
          "建模關聯式資料庫無法表達的複雜關係。我們設計、部署和最佳化處理真實生產流量的 Neo4j 實例。",
      },
      {
        icon: "smart_toy",
        title: "智慧體系統",
        description:
          "工具編排、上下文路由和執行可靠性。我們架構多智慧體系統，使每個決策可追溯，每個故障可恢復。",
      },
      {
        icon: "cable",
        title: "MCP 基礎設施",
        description:
          "伺服器架構、連接器設計和協定級最佳化。已交付 500+ 開源工具。我們建構可觀測、可測試、生產就緒的 MCP 層。",
      },
    ],
    philosophyTitle: "我們的工作方式",
    principles: [
      {
        icon: "code",
        title: "以開源為基石",
        description:
          "我們的核心工具是開源的。客戶獲得的解決方案建立在可審查、可分叉、可擁有的程式碼之上。無供應商鎖定，無黑箱。",
      },
      {
        icon: "science",
        title: "能上線的研究",
        description:
          "我們發布所學，交付所建。我們推薦的每項技術都經過真實工作負載的驗證，而非僅限於基準測試。",
      },
      {
        icon: "emoji_objects",
        title: "務實，不炒作",
        description:
          '我們不販賣「AI 轉型」。我們用具體的工程方法解決具體的基礎設施問題。讓工作成果說話。',
      },
    ],
    ctaTitle: "從一個問題開始",
    ctaSubtitle:
      "描述您的 MCP 基礎設施挑戰、知識圖譜瓶頸或智慧體系統設計問題。我們會坦誠告知是否能幫到您——以及我們會如何著手解決。",
    ctaPrimary: {
      text: "聯繫我們",
      url: "/#contact",
      icon: "mail",
    },
    ctaSecondary: {
      text: "查看專案",
      url: "/#projects",
      icon: "folder_open",
    },
  },

  // ========================================
  // SUBSITE: MCP-BRIDGE
  // ========================================
  mcpBridgeHeader: {
    features: "功能",
    architecture: "架構",
    quickstart: "快速開始",
    install: "安裝",
    docs: "文件",
    workWithUs: "合作諮詢",
  },
  mcpBridgeHero: {
    tagline: "MCP Apps \u2192 訊息平台",
    heroTitle1: "MCP Apps 觸及",
    heroTitle2: "20億+使用者",
    heroSubtitle: "將任何 MCP App 變為 Telegram Mini App。零程式碼改動。同一工具，全新受眾。",
    statTests: "測試通過",
    statPlatforms: "平台",
    statRelease: "最新版本",
    ctaPrimary: "快速開始",
    ctaSecondary: "在 JSR 上查看",
    ctaDocs: "文件",
  },
  mcpBridgeFeatures: {
    title: "彌合",
    titleAccent: "鴻溝",
    subtitle: "將 MCP Apps 從開發者工具帶到訊息平台所需的一切。",
    features: [
      { icon: "code_off", name: "零程式碼改動", desc: "現有 MCP Apps 直接使用，無需重寫。" },
      { icon: "layers", name: "三層架構", desc: "客戶端、資源伺服器、MCP 伺服器。" },
      { icon: "swap_horiz", name: "協定轉換", desc: "透過 WebSocket 的 JSON-RPC 2.0，無縫銜接。" },
      { icon: "smart_toy", name: "Telegram Mini Apps", desc: "完整的主題、視埠、認證支援。" },
      { icon: "more_horiz", name: "更多平台", desc: "LINE、Discord、WhatsApp — 即將推出。" },
      { icon: "shield", name: "CSP 強制", desc: "預設嚴格的內容安全策略。" },
      { icon: "key", name: "工作階段認證", desc: "加密安全權杖，HMAC 驗證。" },
      { icon: "sync", name: "WebSocket 傳輸", desc: "即時雙向通訊。" },
      { icon: "palette", name: "主題映射", desc: "平台主題自動映射到 MCP Apps。" },
      { icon: "extension", name: "可擴充適配器", desc: "新增 Discord、WhatsApp 或任何平台。" },
    ],
  },
  mcpBridgeArchitecture: {
    title: "工作",
    titleAccent: "原理",
    subtitle:
      "Bridge 攔截 MCP App 的 postMessage 呼叫，透過 WebSocket 路由到資源伺服器，再將工具呼叫轉發到未修改的 MCP 伺服器。",
    steps: [
      { icon: "web", label: "MCP App", type: "incoming" },
      { icon: "javascript", label: "bridge.js", type: "" },
      { icon: "sync", label: "WebSocket", type: "" },
      { icon: "dns", label: "資源伺服器", type: "handler" },
      { icon: "hub", label: "MCP 伺服器", type: "" },
      { icon: "send", label: "Telegram", type: "custom" },
    ],
  },
  mcpBridgeComparison: {
    title: "自訂整合 vs",
    titleAccent: "Bridge",
    subtitle: "省去數月的整合工作。Bridge 處理複雜部分，讓您更快發布。",
    colCustom: "自訂整合",
    colBridge: "@casys/mcp-bridge",
    rows: [
      ["MCP App 程式碼改動", "需要重寫", "無需改動"],
      ["平台認證（Telegram）", "手動 HMAC", "內建"],
      ["內容安全策略", "手動 headers", "自動產生"],
      ["WebSocket 管理", "從零開始", "內建"],
      ["主題同步", "手動映射", "自動"],
      ["多平台支援", "按平台編碼", "適配器模式"],
      ["工作階段管理", "自訂實作", "加密安全"],
      ["HTML 注入 (bridge.js)", "不適用", "自動"],
    ],
  },
  mcpBridgeQuickStart: {
    title: "部署到",
    titleAccent: "Telegram",
    subtitle: "三步將您的 MCP App 執行在 Telegram 中。無需更改現有程式碼。",
    tabTelegram: "Telegram",
    tabLine: "即將推出",
  },
  mcpBridgeInstall: {
    title: "隨時",
    titleAccent: "就緒",
    subtitle: "一條指令。支援 Deno 和 Node.js。發布在 JSR，現代 JavaScript 登錄檔。",
    jsrLabel: "JSR 登錄檔",
    githubLabel: "GitHub",
    docsLabel: "文件",
    builtWith: "基於",
  },

  // ========================================
  // USE CASES PAGE
  // ========================================
  useCases: {
    pageTitle: "生產環境案例",
    heroTitle: "生產環境案例",
    heroSubtitle:
      "我們為生產環境建構 MCP 基礎設施。以下是實際案例——真實的挑戰、真實的解決方案、真實的指標。",
    labelChallenge: "挑戰",
    labelApproach: "解決方案",
    labelResult: "成果",
    labelStack: "技術棧",
    ctaTitle: "有類似的挑戰？",
    ctaSubtitle: "描述您的 MCP 基礎設施挑戰。我們會坦誠告知是否能幫到您——以及我們會如何著手解決。",
    ctaPrimary: { text: "聯繫我們", url: "/#contact", icon: "mail" },
    ctaSecondary: { text: "查看專案", url: "/#projects", icon: "folder_open" },
  },
};
