// ============================================================
// Use Cases — Editorial content (separate from i18n UI labels)
//
// Structure: Each use case tells a real story with rich narrative,
// not just a 4-line summary. The page also has an intro section
// with verifiable stats from the actual codebase.
// ============================================================

export interface UseCase {
  id: string;
  tag: string;
  icon: string;
  title: Record<string, string>;
  /** The real-world problem — told as a story, not a summary */
  situation: Record<string, string>;
  /** What was painful about the status quo */
  friction: Record<string, string>;
  /** How MCP changes the game */
  shift: Record<string, string>;
  /** The punchline — the memorable takeaway */
  punchline: Record<string, string>;
  stack: string[];
  /** Optional screenshot/visual path (placeholder if not yet available) */
  visual?: string;
  /** Optional Excalidraw diagram name (without extension, from public/diagrams/) */
  diagram?: string;
  /** Caption for the visual/diagram, per locale */
  visualCaption?: Record<string, string>;
}

/** Intro content for the paradigm shift framing */
export const pageIntro = {
  /** Stats bar — verifiable numbers from the codebase */
  stats: [
    { value: '508', label: { en: 'MCP tools shipped', fr: 'outils MCP livrés', zh: '已发布的 MCP 工具', 'zh-TW': '已發布的 MCP 工具' } },
    { value: '4', label: { en: 'open-source packages', fr: 'packages open source', zh: '开源包', 'zh-TW': '開源套件' } },
    { value: '137+', label: { en: 'tests passing', fr: 'tests passants', zh: '通过的测试', 'zh-TW': '通過的測試' } },
    { value: '21ms', label: { en: 'p95 discovery latency', fr: 'latence p95 de découverte', zh: 'p95 发现延迟', 'zh-TW': 'p95 發現延遲' } },
  ],
};

export const useCases: UseCase[] = [
  {
    id: 'chat-first-workflows',
    tag: 'MCP Apps',
    icon: 'chat',
    title: {
      en: 'From Dashboard Fatigue to Chat-First Workflows',
      fr: 'De la fatigue des dashboards au chat-first',
      zh: '从仪表板疲劳到聊天优先工作流',
      'zh-TW': '從儀表板疲勞到聊天優先工作流',
    },
    situation: {
      en: `A coaching startup built their operations on a stack that's become the norm for small teams: a <strong>no-code platform</strong> for scheduling, <strong>Make</strong> (formerly Integromat) for automations, <strong>Grafana</strong> for metrics, <strong>Google Calendar</strong> for bookings, and <strong>Slack</strong> for everything else.

Every Monday, coaches open the scheduling dashboard, navigate to the right view, and click <em>"Add Session"</em> — then fill out each field one by one: date, time, session type, client name. They repeat this for every session of the week.

Once done, Make triggers automations to reserve calendar slots and send client notifications. To check how the week looks, they switch to Grafana. To confirm with a client, they switch to Slack. <strong>Five apps, five interfaces, five mental models</strong> — for what amounts to one morning task.`,

      fr: `Une startup de coaching a construit ses opérations sur une stack devenue la norme pour les petites équipes : une <strong>plateforme no-code</strong> pour le planning, <strong>Make</strong> (ex-Integromat) pour les automatisations, <strong>Grafana</strong> pour les métriques, <strong>Google Calendar</strong> pour les réservations, et <strong>Slack</strong> pour tout le reste.

Chaque lundi, les coachs ouvrent le dashboard de planning, naviguent vers la bonne vue, et cliquent <em>"Ajouter une session"</em> — puis remplissent chaque champ un par un : date, heure, type de session, nom du client. Ils répètent l'opération pour chaque session de la semaine.

Une fois terminé, Make déclenche des automatisations pour réserver les créneaux calendrier et envoyer les notifications clients. Pour voir l'état de la semaine, on passe sur Grafana. Pour confirmer avec un client, on passe sur Slack. <strong>Cinq apps, cinq interfaces, cinq modèles mentaux</strong> — pour ce qui revient à une seule tâche matinale.`,

      zh: `一家教练创业公司在如今小团队的标准技术栈上构建了运营体系：<strong>无代码平台</strong>做排程，<strong>Make</strong>（前身 Integromat）做自动化，<strong>Grafana</strong> 看指标，<strong>Google 日历</strong>做预约，<strong>Slack</strong> 处理其他一切。

每周一，教练打开排程面板，导航到正确视图，点击<em>"添加课程"</em>——然后逐一填写每个字段：日期、时间、课程类型、客户姓名。每周的每节课都要重复这个操作。

完成后，Make 触发自动化来预留日历时段并发送客户通知。要查看一周概况，切换到 Grafana。要与客户确认，切换到 Slack。<strong>五个应用，五个界面，五个心智模型</strong>——而这只是一个上午的任务。`,

      'zh-TW': `一家教練新創公司在如今小團隊的標準技術棧上建構了營運體系：<strong>無代碼平台</strong>做排程，<strong>Make</strong>（前身 Integromat）做自動化，<strong>Grafana</strong> 看指標，<strong>Google 日曆</strong>做預約，<strong>Slack</strong> 處理其他一切。

每週一，教練打開排程面板，導航到正確視圖，點擊<em>「新增課程」</em>——然後逐一填寫每個欄位：日期、時間、課程類型、客戶姓名。每週的每堂課都要重複這個操作。

完成後，Make 觸發自動化來預留日曆時段並發送客戶通知。要查看一週概況，切換到 Grafana。要與客戶確認，切換到 Slack。<strong>五個應用，五個介面，五個心智模型</strong>——而這只是一個上午的任務。`,
    },
    friction: {
      en: `The core problem isn't that any single tool is bad — it's that <strong>every task requires a different app</strong> with a different interface.

You want to add three coaching sessions? Open the dashboard, wait for it to load, click through the interface, fill in forms field by field. Something that could be described in one sentence — <em>"three coaching sessions Tuesday morning for Alice, Bob, and Carol"</em> — takes <strong>10 minutes of clicking</strong>.

Want to see if your server is healthy? Open Grafana, navigate to the right panel, check the metrics. Want to trigger an automation? Open Make, find the right scenario, run it manually.

The friction isn't in any one step — it's in the <strong>constant context-switching</strong>. Every micro-task pulls you into a different tool, a different mental model, a different login. The result: people avoid checking metrics because it's <em>"another tab to open."</em> They forget to trigger automations because the interface is buried three clicks deep.

The workflow technically works, but the human cost — <strong>the cognitive load of juggling five interfaces</strong> — is the real bottleneck.`,

      fr: `Le problème central n'est pas qu'un outil soit mauvais — c'est que <strong>chaque tâche exige une app différente</strong> avec une interface différente.

Tu veux ajouter trois sessions de coaching ? Ouvre le dashboard, attends le chargement, clique dans l'interface, remplis les formulaires champ par champ. Quelque chose qu'on pourrait décrire en une phrase — <em>"trois sessions de coaching mardi matin pour Alice, Bob et Carol"</em> — prend <strong>10 minutes de clics</strong>.

Tu veux savoir si ton serveur va bien ? Ouvre Grafana, navigue vers le bon panel, vérifie les métriques. Tu veux déclencher une automatisation ? Ouvre Make, trouve le bon scénario, lance-le manuellement.

La friction n'est pas dans une étape isolée — c'est dans le <strong>context-switching permanent</strong>. Chaque micro-tâche t'aspire dans un outil différent, un modèle mental différent, un login différent. Résultat : les gens évitent de vérifier les métriques parce que c'est <em>"encore un onglet à ouvrir."</em> Ils oublient de déclencher les automatisations parce que l'interface est enterrée à trois clics de profondeur.

Le workflow marche techniquement, mais le coût humain — <strong>la charge cognitive de jongler entre cinq interfaces</strong> — est le vrai goulet d'étranglement.`,

      zh: `核心问题不在于某个工具不好——而在于<strong>每项任务都需要不同的应用</strong>和不同的界面。

想添加三节教练课？打开面板，等待加载，在界面中点击，逐字段填写表单。本可以用一句话描述的事情——<em>"周二上午给 Alice、Bob 和 Carol 排三节教练课"</em>——要花<strong>10分钟点击</strong>。

想看服务器是否健康？打开 Grafana，导航到正确面板，检查指标。想触发自动化？打开 Make，找到正确场景，手动运行。

摩擦不在某个步骤——而在于<strong>持续的上下文切换</strong>。每个微任务都把你拉进不同的工具、不同的心智模型、不同的登录界面。结果是：人们因为<em>"又要开一个标签页"</em>而不去查看指标。因为界面藏在三层点击之后而忘记触发自动化。

工作流技术上可行，但人力成本——<strong>在五个界面间切换的认知负担</strong>——才是真正的瓶颈。`,

      'zh-TW': `核心問題不在於某個工具不好——而在於<strong>每項任務都需要不同的應用</strong>和不同的介面。

想新增三堂教練課？打開面板，等待載入，在介面中點擊，逐欄位填寫表單。本可以用一句話描述的事情——<em>「週二上午給 Alice、Bob 和 Carol 排三堂教練課」</em>——要花<strong>10分鐘點擊</strong>。

想看伺服器是否健康？打開 Grafana，導航到正確面板，檢查指標。想觸發自動化？打開 Make，找到正確場景，手動執行。

摩擦不在某個步驟——而在於<strong>持續的上下文切換</strong>。每個微任務都把你拉進不同的工具、不同的心智模型、不同的登入介面。結果是：人們因為<em>「又要開一個分頁」</em>而不去查看指標。因為介面藏在三層點擊之後而忘記觸發自動化。

工作流技術上可行，但人力成本——<strong>在五個介面間切換的認知負擔</strong>——才是真正的瓶頸。`,
    },
    shift: {
      en: `With <strong>MCP Apps</strong>, the entire paradigm flips. Instead of going to each tool, <strong>the tools come to you</strong> — right inside your existing chat.

The coach opens Claude, ChatGPT, or any MCP-compatible client and says what they need: <em>"Schedule three coaching sessions Tuesday morning."</em> A scheduling form appears <strong>in the conversation</strong>, pre-filled with smart defaults. They confirm, and the calendar slots are reserved, notifications sent — all without leaving the chat.

Need to check server health? <em>"Show me this week's Grafana metrics."</em> A live dashboard renders inline, no tab to open. Need to trigger a Make automation? Describe it in natural language — the right scenario fires.

This isn't just chat-as-remote-control for existing tools. The key insight is that <strong>components are pre-built</strong> (forms, tables, charts, calendars) and the AI composes them on the fly based on the request.

It's <strong>the new no-code</strong>: instead of designing workflows in a visual editor, you describe what you need and the system assembles a composite interface from multiple MCP servers in real time. One conversation, multiple data sources, one unified UI — assembled on demand.`,

      fr: `Avec <strong>MCP Apps</strong>, le paradigme s'inverse complètement. Au lieu d'aller vers chaque outil, <strong>les outils viennent à toi</strong> — directement dans ton chat existant.

Le coach ouvre Claude, ChatGPT, ou n'importe quel client compatible MCP et dit ce qu'il veut : <em>"Planifie trois sessions de coaching mardi matin."</em> Un formulaire de planning apparaît <strong>dans la conversation</strong>, pré-rempli avec des valeurs intelligentes. Il confirme, les créneaux sont réservés, les notifications envoyées — le tout sans quitter le chat.

Besoin de vérifier l'état du serveur ? <em>"Montre-moi les métriques Grafana de cette semaine."</em> Un dashboard live s'affiche inline, pas d'onglet à ouvrir. Besoin de déclencher une automatisation Make ? Décris-la en langage naturel — le bon scénario se lance.

Ce n'est pas juste du chat-comme-télécommande pour des outils existants. L'insight clé, c'est que <strong>les composants sont pré-codés</strong> (formulaires, tableaux, graphiques, calendriers) et l'IA les compose à la volée selon la demande.

C'est <strong>le nouveau no-code</strong> : au lieu de designer des workflows dans un éditeur visuel, tu décris ce que tu veux et le système assemble une interface composite depuis plusieurs serveurs MCP en temps réel. Une conversation, plusieurs sources de données, une interface unifiée — assemblée à la demande.`,

      zh: `通过 <strong>MCP Apps</strong>，整个范式被颠覆。不再是你去找每个工具，而是<strong>工具来找你</strong>——直接在你现有的聊天中。

教练打开 Claude、ChatGPT 或任何兼容 MCP 的客户端，说出需求：<em>"安排周二上午三节教练课。"</em>排程表单出现<strong>在对话中</strong>，预填智能默认值。确认后，日历时段即被预留，通知即被发送——全程不离开聊天。

需要检查服务器状态？<em>"给我看这周的 Grafana 指标。"</em>实时仪表板内联渲染，无需打开标签页。需要触发 Make 自动化？用自然语言描述——正确的场景自动触发。

这不仅仅是把聊天当成现有工具的遥控器。关键洞察是：<strong>组件已预构建</strong>（表单、表格、图表、日历），AI 根据请求即时组合它们。

这是<strong>新的无代码</strong>：不再在可视编辑器中设计工作流，而是描述你想要什么，系统从多个 MCP 服务器实时组装复合界面。一次对话，多个数据源，一个统一界面——按需组装。`,

      'zh-TW': `透過 <strong>MCP Apps</strong>，整個範式被顛覆。不再是你去找每個工具，而是<strong>工具來找你</strong>——直接在你現有的聊天中。

教練打開 Claude、ChatGPT 或任何相容 MCP 的客戶端，說出需求：<em>「安排週二上午三堂教練課。」</em>排程表單出現<strong>在對話中</strong>，預填智慧預設值。確認後，日曆時段即被預留，通知即被發送——全程不離開聊天。

需要檢查伺服器狀態？<em>「給我看這週的 Grafana 指標。」</em>即時儀表板內嵌渲染，無需開啟分頁。需要觸發 Make 自動化？用自然語言描述——正確的場景自動觸發。

這不僅僅是把聊天當成現有工具的遙控器。關鍵洞察是：<strong>元件已預建構</strong>（表單、表格、圖表、日曆），AI 根據請求即時組合它們。

這是<strong>新的無代碼</strong>：不再在視覺化編輯器中設計工作流，而是描述你想要什麼，系統從多個 MCP 伺服器即時組裝複合介面。一次對話，多個資料來源，一個統一介面——按需組裝。`,
    },
    punchline: {
      en: 'The interface comes to you — you don\'t go to the interface.',
      fr: "L'interface vient à toi — c'est pas toi qui vas à l'interface.",
      zh: '界面主动来找你——而不是你去找界面。',
      'zh-TW': '介面主動來找你——而不是你去找介面。',
    },
    stack: ['MCP Apps Protocol', '@casys/mcp-std', 'PML Gateway'],
    diagram: 'uc-chat-first',
    visualCaption: {
      en: 'From 5 scattered apps to a single composable chat interface',
      fr: 'De 5 apps dispersées à une seule interface chat composable',
      zh: '从5个分散的应用到单一的可组合聊天界面',
      'zh-TW': '從5個分散的應用到單一的可組合聊天介面',
    },
    visual: '/images/use-cases/scenario-modeler.png',
  },
  {
    id: 'plannable-mcp-workflows',
    tag: 'MCP Engine',
    icon: 'account_tree',
    title: {
      en: 'From Static Pipelines to Plannable MCP Workflows',
      fr: 'Des pipelines statiques aux workflows MCP planifiables',
      zh: '从静态管道到可规划的 MCP 工作流',
      'zh-TW': '從靜態管線到可規劃的 MCP 工作流',
    },
    situation: {
      en: `An industrial engineering consulting firm needed an <strong>AI assistant for their field technicians</strong>. The goal: a conversational interface that could run diagnostics on equipment, restart production systems, and modify operational parameters — but with <strong>mandatory human approval before any action</strong> that could affect live infrastructure.

At the time, the <strong>Model Context Protocol didn't exist yet</strong>. The tooling landscape was dominated by Python frameworks. We built the first version using <strong>LangGraph</strong> combined with <a href="https://github.com/crazyyanchao/llmcompiler" target="_blank" rel="noopener">llmcompiler</a>, a Python package implementing the <a href="https://github.com/SqueezeAILab/LLMCompiler" target="_blank" rel="noopener">LLMCompiler</a> architecture (ICML 2024, SqueezeAILab). The approach was elegant on paper: declare each tool with <strong>Pydantic schemas</strong> for inputs and outputs, then let a DAG planner decompose user requests into parallel-executable steps.

A technician could say <em>"run a full diagnostic on turbine 3"</em> and the planner would build a dependency graph — query the equipment database, schedule the diagnostic procedure, prepare the compliance report. Each step dispatched to its executor. It worked.`,

      fr: `Un cabinet de conseil en <strong>ingénierie industrielle</strong> avait besoin d'un assistant IA pour ses techniciens terrain. L'objectif : une interface conversationnelle capable de lancer des diagnostics sur les équipements, redémarrer des systèmes de production et modifier des paramètres opérationnels — mais avec une <strong>validation humaine obligatoire avant toute action</strong> pouvant affecter l'infrastructure en service.

À l'époque, le <strong>Model Context Protocol n'existait pas encore</strong>. L'écosystème était dominé par les frameworks Python. On a construit la première version avec <strong>LangGraph</strong> combiné à <a href="https://github.com/crazyyanchao/llmcompiler" target="_blank" rel="noopener">llmcompiler</a>, un package Python implémentant l'architecture <a href="https://github.com/SqueezeAILab/LLMCompiler" target="_blank" rel="noopener">LLMCompiler</a> (ICML 2024, SqueezeAILab). L'approche était élégante sur le papier : déclarer chaque outil avec des <strong>schémas Pydantic</strong> pour les entrées et sorties, puis laisser un planificateur DAG décomposer les requêtes en étapes exécutables en parallèle.

Un technicien pouvait dire <em>"lance un diagnostic complet sur la turbine 3"</em> et le planificateur construisait un graphe de dépendances — interroger la base équipements, programmer la procédure de diagnostic, préparer le rapport de conformité. Chaque étape dispatchée à son exécuteur. Ça marchait.`,

      zh: `一家<strong>工业工程咨询公司</strong>需要为其现场技术人员构建一个 AI 助手。目标是：一个对话式界面，能够对设备运行诊断、重启生产系统、修改运行参数——但在任何可能影响在线基础设施的操作前，必须有<strong>强制性的人工审批</strong>。

当时，<strong>Model Context Protocol 还不存在</strong>。工具生态由 Python 框架主导。我们用 <strong>LangGraph</strong> 结合 <a href="https://github.com/crazyyanchao/llmcompiler" target="_blank" rel="noopener">llmcompiler</a> 构建了第一版，这是一个实现了 <a href="https://github.com/SqueezeAILab/LLMCompiler" target="_blank" rel="noopener">LLMCompiler</a> 架构（ICML 2024，SqueezeAILab）的 Python 包。理论上这个方案很优雅：用 <strong>Pydantic 模式</strong>声明每个工具的输入和输出，然后让 DAG 规划器将用户请求分解为可并行执行的步骤。

技术人员可以说<em>"对涡轮机 3 运行完整诊断"</em>，规划器就会构建一个依赖图——查询设备数据库、调度诊断程序、准备合规报告。每个步骤分发给对应的执行器。它确实可以工作。`,

      'zh-TW': `一家<strong>工業工程顧問公司</strong>需要為其現場技術人員建構一個 AI 助手。目標是：一個對話式介面，能夠對設備執行診斷、重啟生產系統、修改運行參數——但在任何可能影響線上基礎設施的操作前，必須有<strong>強制性的人工審批</strong>。

當時，<strong>Model Context Protocol 還不存在</strong>。工具生態由 Python 框架主導。我們用 <strong>LangGraph</strong> 結合 <a href="https://github.com/crazyyanchao/llmcompiler" target="_blank" rel="noopener">llmcompiler</a> 建構了第一版，這是一個實現了 <a href="https://github.com/SqueezeAILab/LLMCompiler" target="_blank" rel="noopener">LLMCompiler</a> 架構（ICML 2024，SqueezeAILab）的 Python 套件。理論上這個方案很優雅：用 <strong>Pydantic 模式</strong>宣告每個工具的輸入和輸出，然後讓 DAG 規劃器將使用者請求分解為可平行執行的步驟。

技術人員可以說<em>「對渦輪機 3 執行完整診斷」</em>，規劃器就會建構一個依賴圖——查詢設備資料庫、排程診斷程序、準備合規報告。每個步驟分發給對應的執行器。它確實可以運作。`,
    },
    friction: {
      en: `The problems surfaced the moment we tried to add <strong>safety checkpoints</strong>. LangGraph supports interrupts, but wiring Human-in-the-Loop into a DAG planner meant custom state management at every branching node. <em>"Confirm before restarting production line B"</em> — sounds like a one-line requirement, but in practice it demanded hand-coded serialization of pending actions, a bespoke UI layer for presenting confirmations, and careful orchestration to resume the graph after approval.

Beyond HIL, the architecture suffered from <strong>fundamental rigidity</strong>. Pydantic schemas are static — defined at compile time in Python. Every time a new tool was added or an input signature changed, the entire pipeline needed redeployment. The planner could only work with the tools it had been compiled against.

The planner was also <strong>blind to runtime patterns</strong>. It could decompose a request into parallel tasks, but it couldn't learn from past executions. If technicians consistently followed diagnostic A with calibration B, the system had no way to know. Every run started from scratch.

Finally, the architecture was <strong>Python-bound</strong>. The consulting firm wanted a TypeScript frontend for the technician interface, but LangGraph forced a Python backend. Two runtimes, two dependency chains, two deployment pipelines — for what should have been a single unified stack. A permanent tax on the operations team. (Ironically, LangGraph has since shipped a TypeScript version — but the fundamental problem of static schemas remains.)`,

      fr: `Les problèmes sont apparus dès qu'on a voulu ajouter les <strong>points de contrôle de sécurité</strong>. LangGraph supporte les interruptions, mais câbler du Human-in-the-Loop dans un planificateur DAG exigeait du state management custom à chaque noeud de branchement. <em>"Confirmer avant de redémarrer la ligne de production B"</em> — ça ressemble à un one-liner dans le cahier des charges, mais en pratique il fallait de la sérialisation codée à la main pour les actions en attente, une couche UI dédiée pour afficher les confirmations, et une orchestration soignée pour reprendre le graphe après validation.

Au-delà du HIL, l'architecture souffrait d'une <strong>rigidité fondamentale</strong>. Les schémas Pydantic sont statiques — définis au moment de la compilation en Python. À chaque ajout d'outil ou changement de signature, il fallait redéployer tout le pipeline. Le planificateur ne pouvait travailler qu'avec les outils contre lesquels il avait été compilé.

Le planificateur était aussi <strong>aveugle aux patterns d'exécution</strong>. Il pouvait décomposer une requête en tâches parallèles, mais il ne pouvait pas apprendre des runs passés. Si les techniciens enchaînaient systématiquement le diagnostic A avec la calibration B, le système n'en savait rien. Chaque exécution repartait de zéro.

Enfin, l'architecture était <strong>captive de Python</strong>. Le cabinet voulait un frontend TypeScript pour l'interface technicien, mais LangGraph imposait un backend Python. Deux runtimes, deux chaînes de dépendances, deux pipelines de déploiement — pour ce qui aurait dû être une stack unifiée. Une taxe permanente sur l'équipe ops. (Ironie du sort, LangGraph a depuis sorti une version TypeScript — mais le problème fondamental des schémas statiques reste entier.)`,

      zh: `问题在我们试图添加<strong>安全检查点</strong>时立即暴露。LangGraph 支持中断，但在 DAG 规划器中接入 Human-in-the-Loop 意味着每个分支节点都需要自定义状态管理。<em>"在重启生产线 B 之前确认"</em>——听起来像是一行需求，但实际上需要手写的待处理操作序列化、专门的 UI 层来展示确认界面，以及精心编排的审批后恢复逻辑。

除了 HIL，架构本身存在<strong>根本性的僵化</strong>。Pydantic 模式是静态的——在 Python 编译时定义。每次添加新工具或修改输入签名，都需要重新部署整个管道。规划器只能使用编译时已知的工具。

规划器还<strong>对运行时模式完全盲目</strong>。它能将请求分解为并行任务，但无法从过去的执行中学习。如果技术人员总是在诊断 A 后执行校准 B，系统无从知晓。每次运行都从零开始。

最后，架构<strong>绑定于 Python</strong>。咨询公司想用 TypeScript 构建技术人员界面的前端，但 LangGraph 强制要求 Python 后端。两个运行时、两条依赖链、两套部署管道——本应是统一技术栈的东西。对运维团队来说是永久性的额外负担。（讽刺的是，LangGraph 后来推出了 TypeScript 版本——但静态模式的根本问题依然存在。）`,

      'zh-TW': `問題在我們試圖新增<strong>安全檢查點</strong>時立即暴露。LangGraph 支援中斷，但在 DAG 規劃器中接入 Human-in-the-Loop 意味著每個分支節點都需要自訂狀態管理。<em>「在重啟生產線 B 之前確認」</em>——聽起來像是一行需求，但實際上需要手寫的待處理操作序列化、專門的 UI 層來展示確認介面，以及精心編排的審批後恢復邏輯。

除了 HIL，架構本身存在<strong>根本性的僵化</strong>。Pydantic 模式是靜態的——在 Python 編譯時定義。每次新增工具或修改輸入簽名，都需要重新部署整個管線。規劃器只能使用編譯時已知的工具。

規劃器還<strong>對執行時模式完全盲目</strong>。它能將請求分解為平行任務，但無法從過去的執行中學習。如果技術人員總是在診斷 A 後執行校準 B，系統無從知曉。每次執行都從零開始。

最後，架構<strong>綁定於 Python</strong>。顧問公司想用 TypeScript 建構技術人員介面的前端，但 LangGraph 強制要求 Python 後端。兩個執行環境、兩條依賴鏈、兩套部署管線——本應是統一技術棧的東西。對維運團隊來說是永久性的額外負擔。（諷刺的是，LangGraph 後來推出了 TypeScript 版本——但靜態模式的根本問題依然存在。）`,
    },
    shift: {
      en: `With the <strong>MCP Engine</strong>, the same architecture becomes dynamic, language-agnostic, and safe by default. Each diagnostic tool, each database query, each report generator is now an <strong>MCP server</strong> — a self-describing service with machine-readable capabilities that any client can discover at runtime. No recompilation. No redeployment. A new tool is deployed and it's immediately plannable.

For safety, the engine provides <strong>two complementary Human-in-the-Loop mechanisms</strong> that address different moments in a tool's lifecycle.

The first is the <strong>Approval Gate</strong>. Running inside a Deno sandbox, the MCP call is intercepted <em>before</em> it ever reaches the MCP server. The technician sees exactly what will happen — <em>"Restart cooling system on unit 7?"</em> — and approves or rejects. Nothing executes until a human says so. This is the primary safety layer: <strong>should we call this tool at all?</strong>

The second is <strong><a href="https://modelcontextprotocol.io/specification/draft/client/elicitation" target="_blank" rel="noopener">MCP Elicitation</a></strong> (published in the MCP specification, June 2025). This handles a different scenario: the tool has started executing, but the <em>server itself</em> needs additional information to continue. It pauses and sends a structured request back to the client — with <a href="https://thenewstack.io/how-elicitation-in-mcp-brings-human-in-the-loop-to-ai-tools/" target="_blank" rel="noopener">JSON Schema validation</a> on the response. <em>"Diagnostic on turbine 3 requires selecting a test profile: standard, extended, or stress?"</em> The technician picks one, the server resumes.

These two mechanisms are complementary, not redundant. Approval Gate asks <em>"should we do this?"</em> before execution. Elicitation asks <em>"we need more context to continue"</em> during execution. Together, they cover the full lifecycle of a safety-critical tool call — no custom state management, no bespoke UI. It's built into the protocol.

What comes next is a <strong>GRU transition model</strong> — a neural network trained on historical execution traces that learns to predict the most likely next tool and the terminal step of a workflow. If technicians consistently follow pattern A then B then C, the system will suggest it. Not rigid rules — <strong>observed patterns</strong> that adapt as practices evolve. This is the current R&D direction, building on the foundation the industrial client helped validate.`,

      fr: `Avec le <strong>MCP Engine</strong>, la même architecture devient dynamique, agnostique au langage, et sécurisée par défaut. Chaque outil de diagnostic, chaque requête base de données, chaque générateur de rapport est désormais un <strong>serveur MCP</strong> — un service auto-descriptif avec des capacités lisibles par la machine, découvrables à l'exécution par n'importe quel client. Pas de recompilation. Pas de redéploiement. Un nouvel outil est déployé et il est immédiatement planifiable.

Pour la sécurité, le moteur fournit <strong>deux mécanismes Human-in-the-Loop complémentaires</strong> qui interviennent à des moments différents du cycle de vie d'un outil.

Le premier est l'<strong>Approval Gate</strong>. Exécuté dans un sandbox Deno, l'appel MCP est intercepté <em>avant</em> même d'atteindre le serveur MCP. Le technicien voit exactement ce qui va se passer — <em>"Redémarrer le système de refroidissement sur l'unité 7 ?"</em> — et approuve ou rejette. Rien ne s'exécute sans feu vert humain. C'est la couche de sécurité primaire : <strong>est-ce qu'on doit appeler cet outil ?</strong>

Le second est l'<strong><a href="https://modelcontextprotocol.io/specification/draft/client/elicitation" target="_blank" rel="noopener">Elicitation MCP</a></strong> (publiée dans la spécification MCP, juin 2025). Celui-ci gère un scénario différent : l'outil a commencé à s'exécuter, mais le <em>serveur lui-même</em> a besoin d'informations supplémentaires pour continuer. Il se met en pause et renvoie une requête structurée au client — avec <a href="https://thenewstack.io/how-elicitation-in-mcp-brings-human-in-the-loop-to-ai-tools/" target="_blank" rel="noopener">validation JSON Schema</a> sur la réponse. <em>"Le diagnostic sur la turbine 3 nécessite de choisir un profil de test : standard, étendu, ou stress ?"</em> Le technicien choisit, le serveur reprend.

Ces deux mécanismes sont complémentaires, pas redondants. L'Approval Gate demande <em>"est-ce qu'on fait ça ?"</em> avant l'exécution. L'Elicitation demande <em>"on a besoin de plus de contexte pour continuer"</em> pendant l'exécution. Ensemble, ils couvrent le cycle de vie complet d'un appel outil critique — pas de state management custom, pas de couche UI dédiée. C'est intégré au protocole.

L'étape suivante est un <strong>modèle de transition GRU</strong> — un réseau de neurones entraîné sur les traces d'exécution historiques qui apprend à prédire l'outil suivant le plus probable et l'étape terminale d'un workflow. Si les techniciens enchaînent systématiquement A puis B puis C, le système le suggèrera. Pas des règles rigides — des <strong>patterns observés</strong> qui s'adaptent à mesure que les pratiques évoluent. C'est la direction R&D actuelle, construite sur les fondations que le client industriel a contribué à valider.`,

      zh: `通过 <strong>MCP Engine</strong>，同样的架构变得动态、语言无关，并且默认安全。每个诊断工具、每个数据库查询、每个报告生成器现在都是一个 <strong>MCP 服务器</strong>——一个自描述服务，具有机器可读的能力，任何客户端都能在运行时发现。无需重新编译。无需重新部署。新工具部署后立即可规划。

在安全方面，引擎提供了<strong>两个互补的 Human-in-the-Loop 机制</strong>，分别作用于工具生命周期的不同阶段。

第一个是<strong>审批门控（Approval Gate）</strong>。在 Deno 沙箱中运行，MCP 调用在到达 MCP 服务器<em>之前</em>就被拦截。技术人员能看到即将发生的操作——<em>"重启第 7 单元的冷却系统？"</em>——然后批准或拒绝。没有人工确认，什么都不会执行。这是主要的安全层：<strong>我们应该调用这个工具吗？</strong>

第二个是 <strong><a href="https://modelcontextprotocol.io/specification/draft/client/elicitation" target="_blank" rel="noopener">MCP Elicitation</a></strong>（MCP 规范，2025年6月发布）。它处理的是不同的场景：工具已经开始执行，但<em>服务器本身</em>需要额外信息才能继续。它会暂停并向客户端发送结构化请求——对响应进行 <a href="https://thenewstack.io/how-elicitation-in-mcp-brings-human-in-the-loop-to-ai-tools/" target="_blank" rel="noopener">JSON Schema 验证</a>。<em>"对涡轮机 3 的诊断需要选择测试配置：标准、扩展还是压力测试？"</em>技术人员选择后，服务器继续执行。

这两个机制是互补的，而非冗余。审批门控在执行<em>之前</em>询问<em>"我们应该这样做吗？"</em>。Elicitation 在执行<em>过程中</em>询问<em>"我们需要更多上下文才能继续"</em>。两者结合，覆盖了安全关键工具调用的完整生命周期——无需自定义状态管理，无需定制 UI。这是协议内置的功能。

下一步是 <strong>GRU 转换模型</strong>——一个在历史执行轨迹上训练的神经网络，学习预测最可能的下一个工具和工作流的终止步骤。如果技术人员始终按 A 然后 B 然后 C 的模式操作，系统就会主动建议。不是僵硬的规则——而是随着实践演变而<strong>适应的观察模式</strong>。这是当前的研发方向，建立在工业客户帮助验证的基础之上。`,

      'zh-TW': `透過 <strong>MCP Engine</strong>，同樣的架構變得動態、語言無關，並且預設安全。每個診斷工具、每個資料庫查詢、每個報告產生器現在都是一個 <strong>MCP 伺服器</strong>——一個自描述服務，具有機器可讀的能力，任何客戶端都能在執行時發現。無需重新編譯。無需重新部署。新工具部署後立即可規劃。

在安全方面，引擎提供了<strong>兩個互補的 Human-in-the-Loop 機制</strong>，分別作用於工具生命週期的不同階段。

第一個是<strong>審批閘道（Approval Gate）</strong>。在 Deno 沙箱中執行，MCP 呼叫在到達 MCP 伺服器<em>之前</em>就被攔截。技術人員能看到即將發生的操作——<em>「重啟第 7 單元的冷卻系統？」</em>——然後批准或拒絕。沒有人工確認，什麼都不會執行。這是主要的安全層：<strong>我們應該呼叫這個工具嗎？</strong>

第二個是 <strong><a href="https://modelcontextprotocol.io/specification/draft/client/elicitation" target="_blank" rel="noopener">MCP Elicitation</a></strong>（MCP 規範，2025年6月發布）。它處理的是不同的場景：工具已經開始執行，但<em>伺服器本身</em>需要額外資訊才能繼續。它會暫停並向客戶端發送結構化請求——對回應進行 <a href="https://thenewstack.io/how-elicitation-in-mcp-brings-human-in-the-loop-to-ai-tools/" target="_blank" rel="noopener">JSON Schema 驗證</a>。<em>「對渦輪機 3 的診斷需要選擇測試設定檔：標準、擴展還是壓力測試？」</em>技術人員選擇後，伺服器繼續執行。

這兩個機制是互補的，而非冗餘。審批閘道在執行<em>之前</em>詢問<em>「我們應該這樣做嗎？」</em>。Elicitation 在執行<em>過程中</em>詢問<em>「我們需要更多上下文才能繼續」</em>。兩者結合，覆蓋了安全關鍵工具呼叫的完整生命週期——無需自訂狀態管理，無需定製 UI。這是協定內建的功能。

下一步是 <strong>GRU 轉換模型</strong>——一個在歷史執行軌跡上訓練的神經網路，學習預測最可能的下一個工具和工作流的終止步驟。如果技術人員始終按 A 然後 B 然後 C 的模式操作，系統就會主動建議。不是僵硬的規則——而是隨著實踐演變而<strong>適應的觀察模式</strong>。這是當前的研發方向，建立在工業客戶幫助驗證的基礎之上。`,
    },
    punchline: {
      en: 'The safety checkpoint isn\'t bolted on — it\'s built into the protocol.',
      fr: 'Le point de contrôle n\'est pas boulonné après coup — il est intégré au protocole.',
      zh: '安全检查点不是后期加装的——它内建于协议之中。',
      'zh-TW': '安全檢查點不是後期加裝的——它內建於協定之中。',
    },
    stack: ['MCP Engine', 'Deno Sandbox', 'MCP Elicitation', 'LLMCompiler (legacy)', 'PML Gateway'],
    diagram: 'uc-plannable-workflows',
    visualCaption: {
      en: 'Two complementary human-in-the-loop checkpoints: Approval Gate and Elicitation',
      fr: 'Deux points de contrôle humain complémentaires : Approval Gate et Elicitation',
      zh: '两个互补的人机协作检查点：审批门和信息征询',
      'zh-TW': '兩個互補的人機協作檢查點：審批閘道和資訊徵詢',
    },
  },
  {
    id: 'navigable-knowledge-graphs',
    tag: 'Knowledge Graph',
    icon: 'hub',
    title: {
      en: 'From Opaque Spreadsheets to Navigable Knowledge',
      fr: 'Des tableurs opaques à la connaissance navigable',
      zh: '从不透明的电子表格到可导航的知识',
      'zh-TW': '從不透明的試算表到可導航的知識',
    },
    situation: {
      en: `An <strong>industrial engineering consultancy</strong> specialising in advanced manufacturing regularly responds to complex tenders. Each response mobilises dozens of calculation formulas — sizing, costing, process parameters — spread across several <strong>domains of expertise</strong>. Each domain in the manufacturing flow maintains its own formulas, its own assumptions, its own specialists.

When a tender lands, the innovation director assembles a cross-domain team. Each domain lead opens their spreadsheets, runs their calculations, and produces a partial answer. The final bid is supposed to be the coherent sum of these parts — <strong>a single number backed by dozens of interdependent formulas</strong> owned by people who rarely see each other's work.`,

      fr: `Un <strong>bureau d'études en ingénierie industrielle</strong>, spécialisé en fabrication avancée, répond régulièrement à des appels d'offres complexes. Chaque réponse mobilise des dizaines de formules de calcul — dimensionnement, coûts, paramètres process — réparties entre plusieurs <strong>domaines de compétence</strong>. Chaque domaine du flux de fabrication a ses propres formules, ses propres hypothèses, ses propres experts.

Quand un appel d'offres arrive, le directeur de l'innovation constitue une équipe transverse. Chaque responsable de domaine ouvre ses tableurs, lance ses calculs et produit une réponse partielle. L'offre finale est censée être la somme cohérente de ces parties — <strong>un chiffre unique adossé à des dizaines de formules interdépendantes</strong> portées par des gens qui voient rarement le travail des autres.`,

      zh: `一家专注于先进制造的<strong>工业工程咨询公司</strong>定期参与复杂的招标项目。每次投标都需要调用数十个计算公式——尺寸设计、成本核算、工艺参数——分布在多个<strong>专业领域</strong>中。制造流程中的每个领域都有自己的公式、自己的假设、自己的专家。

当一份招标书到来时，创新总监组建一支跨领域团队。每位领域负责人打开自己的电子表格，运行计算，产出部分结果。最终标书应该是这些部分的连贯总和——<strong>一个数字，背后是数十个相互依赖的公式</strong>，分别由彼此很少看到对方工作的人维护。`,

      'zh-TW': `一家專注於先進製造的<strong>工業工程顧問公司</strong>定期參與複雜的招標專案。每次投標都需要調用數十個計算公式——尺寸設計、成本核算、製程參數——分布在多個<strong>專業領域</strong>中。製造流程中的每個領域都有自己的公式、自己的假設、自己的專家。

當一份招標書到來時，創新總監組建一支跨領域團隊。每位領域負責人打開自己的試算表，執行計算，產出部分結果。最終標書應該是這些部分的連貫總和——<strong>一個數字，背後是數十個相互依賴的公式</strong>，分別由彼此很少看到對方工作的人維護。`,
    },
    friction: {
      en: `The formulas live inside <strong>opaque Excel files</strong>. Nobody knows which assumptions feed which calculation. Worse: different domains produce contradictory answers for the same parameters — and these contradictions remain <strong>invisible until the consolidation meeting</strong>.

Those meetings become, in the founder's own words, <em>"endless."</em> Each domain defends its parameters. It's as much political as it is technical. The problem isn't that people are wrong — it's that <strong>nobody can see the end-to-end result</strong>. The exercise devolves from <em>"what's the best answer?"</em> into <em>"who's right?"</em>

A domain lead changes an input assumption. What's the downstream impact on the final bid price? Nobody knows without manually tracing through three other spreadsheets, owned by three other people, built on three different modelling conventions. <strong>Every parameter change is a blind bet.</strong>

The real cost isn't just time — though the hours spent in consolidation meetings are significant. It's <strong>coherence</strong>. Bids go out with internal contradictions that no one caught, because the tool that holds the knowledge — the spreadsheet — was never designed to show how things connect.`,

      fr: `Les formules vivent dans des <strong>fichiers Excel opaques</strong>. Personne ne sait quelles hypothèses alimentent quel calcul. Pire : des domaines différents produisent des réponses contradictoires pour les mêmes paramètres — et ces contradictions restent <strong>invisibles jusqu'à la réunion de consolidation</strong>.

Ces réunions deviennent, selon les mots du fondateur, <em>"interminables."</em> Chaque domaine défend ses paramètres. C'est autant politique que technique. Le problème n'est pas que les gens se trompent — c'est que <strong>personne ne peut voir le résultat de bout en bout</strong>. L'exercice glisse de <em>"quelle est la meilleure réponse ?"</em> vers <em>"qui a raison ?"</em>

Un responsable de domaine modifie une hypothèse d'entrée. Quel est l'impact en aval sur le prix final de l'offre ? Personne ne le sait sans tracer manuellement à travers trois autres tableurs, détenus par trois autres personnes, construits selon trois conventions de modélisation différentes. <strong>Chaque changement de paramètre est un pari à l'aveugle.</strong>

Le vrai coût n'est pas seulement le temps — même si les heures passées en réunions de consolidation sont considérables. C'est la <strong>cohérence</strong>. Des offres partent avec des contradictions internes que personne n'a détectées, parce que l'outil qui porte la connaissance — le tableur — n'a jamais été conçu pour montrer comment les choses se connectent.`,

      zh: `公式藏在<strong>不透明的 Excel 文件</strong>中。没有人知道哪些假设支撑着哪个计算。更糟的是：不同领域对同一参数给出矛盾的答案——而这些矛盾在<strong>汇总会议之前完全不可见</strong>。

用创始人自己的话说，这些会议变得<em>"没完没了。"</em>每个领域都在捍卫自己的参数。这既是技术问题，也是政治问题。问题不在于谁算错了——而在于<strong>没有人能看到端到端的结果</strong>。讨论从<em>"最佳答案是什么？"</em>滑向了<em>"谁是对的？"</em>

一位领域负责人修改了一个输入假设。对最终报价的下游影响是什么？没有人知道——除非手动追踪另外三个电子表格，由三个不同的人维护，基于三种不同的建模规范。<strong>每次参数变更都是一次盲赌。</strong>

真正的成本不仅仅是时间——尽管汇总会议耗费的工时相当可观。更重要的是<strong>一致性</strong>。投标书带着内部矛盾发出去，没有人发现，因为承载知识的工具——电子表格——从来就不是为展示事物之间的关联而设计的。`,

      'zh-TW': `公式藏在<strong>不透明的 Excel 檔案</strong>中。沒有人知道哪些假設支撐著哪個計算。更糟的是：不同領域對同一參數給出矛盾的答案——而這些矛盾在<strong>彙總會議之前完全不可見</strong>。

用創辦人自己的話說，這些會議變得<em>「沒完沒了。」</em>每個領域都在捍衛自己的參數。這既是技術問題，也是政治問題。問題不在於誰算錯了——而在於<strong>沒有人能看到端到端的結果</strong>。討論從<em>「最佳答案是什麼？」</em>滑向了<em>「誰是對的？」</em>

一位領域負責人修改了一個輸入假設。對最終報價的下游影響是什麼？沒有人知道——除非手動追蹤另外三個試算表，由三個不同的人維護，基於三種不同的建模規範。<strong>每次參數變更都是一次盲賭。</strong>

真正的成本不僅僅是時間——儘管彙總會議耗費的工時相當可觀。更重要的是<strong>一致性</strong>。投標書帶著內部矛盾發出去，沒有人發現，因為承載知識的工具——試算表——從來就不是為展示事物之間的關聯而設計的。`,
    },
    shift: {
      en: `Each Excel formula is parsed and translated into a page in a <strong>knowledge graph</strong>. Variables become pages. Formulas become pages. When the output of one formula feeds the input of another, that cross-reference becomes a <strong>navigable link</strong>.

What was an opaque spreadsheet becomes a system where dependencies are explicit. An engineer clicks on a cost parameter and immediately sees every formula that consumes it, every domain it crosses, every downstream output it affects. <em>"It's great because I can navigate — I can see which elements impact which thing,"</em> the innovation director said during the first walkthrough.

The contradictions between domains don't disappear — but they become <strong>visible</strong>, and therefore resolvable. When two domains use different values for the same variable, the graph shows the conflict as two incoming links with divergent sources. No more surprises at the consolidation meeting. No more <em>"who's right?"</em> — instead, a shared view of the dependency structure that everyone can trace.

The concept works like a <strong>product Bill of Materials</strong>, but for calculations. Just as a BOM decomposes a physical product into its constituent parts with explicit parent-child relationships, this graph decomposes a bid response into its constituent formulas with explicit input-output dependencies. The structure makes the invisible visible.

This client's challenge crystallised the problem that PML was designed to solve. Navigating a graph of interdependent knowledge, tracing decision paths, testing parameter combinations — this is exactly what the <strong>MCP Engine</strong> targets at scale. The current R&D direction: an agent that would receive a tender, decompose the dependencies like a product BOM, explore the graph paths, and propose the optimal combination — with every step <strong>traceable and deterministic</strong>. That vision is under active construction, drawing on principles from product lifecycle management and model-based systems engineering.`,

      fr: `Chaque formule Excel est parsée et traduite en une page dans un <strong>knowledge graph</strong>. Les variables deviennent des pages. Les formules deviennent des pages. Quand la sortie d'une formule alimente l'entrée d'une autre, cette référence croisée devient un <strong>lien navigable</strong>.

Ce qui était un tableur opaque devient un système où les dépendances sont explicites. Un ingénieur clique sur un paramètre de coût et voit immédiatement chaque formule qui le consomme, chaque domaine qu'il traverse, chaque sortie en aval qu'il affecte. <em>"C'est super bien parce que je peux naviguer, je peux voir quels éléments impactent quelle chose,"</em> a dit le directeur de l'innovation lors de la première démonstration.

Les contradictions entre domaines ne disparaissent pas — mais elles deviennent <strong>visibles</strong>, et donc résolubles. Quand deux domaines utilisent des valeurs différentes pour la même variable, le graphe montre le conflit sous forme de deux liens entrants avec des sources divergentes. Plus de surprises en réunion de consolidation. Plus de <em>"qui a raison ?"</em> — à la place, une vue partagée de la structure de dépendances que tout le monde peut tracer.

Le concept fonctionne comme une <strong>nomenclature produit</strong> (Bill of Materials), mais pour les calculs. De la même façon qu'une BOM décompose un produit physique en ses composants avec des relations parent-enfant explicites, ce graphe décompose une réponse d'appel d'offres en ses formules constitutives avec des dépendances entrée-sortie explicites. La structure rend visible ce qui était invisible.

Ce client a cristallisé le problème que PML a été conçu pour résoudre. Naviguer un graphe de connaissances interdépendantes, tracer les chemins de décision, tester les combinaisons de paramètres — c'est exactement ce que le <strong>MCP Engine</strong> vise à l'échelle. La direction R&D actuelle : un agent qui recevrait un appel d'offres, décomposerait les dépendances comme une nomenclature produit, explorerait les chemins du graphe et proposerait la combinaison optimale — avec chaque étape <strong>traçable et déterministe</strong>. Cette vision est en cours de construction, nourrie par les principes du product lifecycle management et de l'ingénierie système basée sur les modèles.`,

      zh: `每个 Excel 公式被解析并转化为<strong>知识图谱</strong>中的一个页面。变量变成页面。公式变成页面。当一个公式的输出作为另一个公式的输入时，这种交叉引用变成一个<strong>可导航的链接</strong>。

不透明的电子表格变成了一个依赖关系显式化的系统。工程师点击一个成本参数，立即看到每个消费它的公式、它跨越的每个领域、它影响的每个下游输出。<em>"这非常好，因为我可以导航——我可以看到哪些元素影响哪些东西，"</em>创新总监在首次演示时说。

领域之间的矛盾不会消失——但它们变得<strong>可见</strong>，因此可以解决。当两个领域对同一变量使用不同的值时，图谱将冲突显示为两个来源不同的传入链接。汇总会议上不再有意外。不再是<em>"谁是对的？"</em>——而是一个所有人都能追踪的依赖结构共享视图。

这个概念的运作方式类似<strong>产品物料清单</strong>（BOM），但用于计算。就像 BOM 将物理产品分解为具有明确父子关系的组成部分一样，这个图谱将投标响应分解为具有明确输入-输出依赖关系的组成公式。结构让不可见的变为可见。

这个客户的挑战凝练了 PML 旨在解决的问题。导航相互依赖的知识图谱、追踪决策路径、测试参数组合——这正是 <strong>MCP Engine</strong> 在规模化层面的目标。当前的研发方向：一个代理将接收招标书，像产品 BOM 一样分解依赖关系，探索图谱路径，并提出最优组合——每一步都<strong>可追踪、确定性的</strong>。这一愿景正在积极建设中，借鉴了产品生命周期管理和基于模型的系统工程原则。`,

      'zh-TW': `每個 Excel 公式被解析並轉化為<strong>知識圖譜</strong>中的一個頁面。變數變成頁面。公式變成頁面。當一個公式的輸出作為另一個公式的輸入時，這種交叉引用變成一個<strong>可導航的連結</strong>。

不透明的試算表變成了一個依賴關係顯式化的系統。工程師點擊一個成本參數，立即看到每個消費它的公式、它跨越的每個領域、它影響的每個下游輸出。<em>「這非常好，因為我可以導航——我可以看到哪些元素影響哪些東西，」</em>創新總監在首次展示時說。

領域之間的矛盾不會消失——但它們變得<strong>可見</strong>，因此可以解決。當兩個領域對同一變數使用不同的值時，圖譜將衝突顯示為兩個來源不同的傳入連結。彙總會議上不再有意外。不再是<em>「誰是對的？」</em>——而是一個所有人都能追蹤的依賴結構共享視圖。

這個概念的運作方式類似<strong>產品物料清單</strong>（BOM），但用於計算。就像 BOM 將實體產品分解為具有明確父子關係的組成部分一樣，這個圖譜將投標回應分解為具有明確輸入-輸出依賴關係的組成公式。結構讓不可見的變為可見。

這個客戶的挑戰凝練了 PML 旨在解決的問題。導航相互依賴的知識圖譜、追蹤決策路徑、測試參數組合——這正是 <strong>MCP Engine</strong> 在規模化層面的目標。當前的研發方向：一個代理將接收招標書，像產品 BOM 一樣分解依賴關係，探索圖譜路徑，並提出最優組合——每一步都<strong>可追蹤、確定性的</strong>。這一願景正在積極建設中，借鑑了產品生命週期管理和基於模型的系統工程原則。`,
    },
    punchline: {
      en: 'The question was never to replace the experts — it was to make their expertise visible.',
      fr: "La question n'a jamais été de remplacer les experts — mais de rendre leur expertise visible.",
      zh: '问题从来不是取代专家——而是让他们的专业知识变得可见。',
      'zh-TW': '問題從來不是取代專家——而是讓他們的專業知識變得可見。',
    },
    stack: ['Knowledge Graph', 'Obsidian', 'Excel Parsing', 'MCP Engine (R&D)'],
    diagram: 'uc-knowledge-graph',
    visualCaption: {
      en: 'Opaque spreadsheets become a navigable dependency graph with visible conflicts',
      fr: 'Les tableurs opaques deviennent un graphe de dépendances navigable avec les conflits visibles',
      zh: '不透明的电子表格变成可导航的依赖图谱，冲突清晰可见',
      'zh-TW': '不透明的試算表變成可導航的依賴圖譜，衝突清晰可見',
    },
  },
];
