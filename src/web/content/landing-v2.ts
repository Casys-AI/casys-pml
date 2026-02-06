/**
 * Landing Page V2 Content
 *
 * "The Gateway for the Conversational Web"
 * Positioning: Boring infrastructure — reliable, essential, no AI hype.
 *
 * @module web/content/landing-v2
 */

// =============================================================================
// META & SEO
// =============================================================================

export const meta = {
  title: "PML - The Gateway for the Conversational Web",
  description:
    "Your apps, accessible from any chat. Observable, deterministic, self-hosted. " +
    "Build workflows once, run them from Claude, ChatGPT, or your own interface.",
  ogImage: "https://pml.casys.ai/assets/og/home-v2.png",
};

// =============================================================================
// HERO SECTION
// =============================================================================

export const hero = {
  eyebrow: "The Conversational Web Gateway",

  title: {
    line1: "The Gateway for the",
    accent: "Conversational Web",
  },

  description:
    "Your apps, accessible from any chat. " +
    "Build workflows once, use them from Claude, ChatGPT, or your own interface. " +
    "Observable. Deterministic. Self-hosted.",

  pillars: [
    { icon: "visibility" as const, label: "Observable" },
    { icon: "check_circle" as const, label: "Deterministic" },
    { icon: "dns" as const, label: "Self-Hosted" },
  ],

  cta: {
    primary: {
      label: "Start Building",
      href: "#quickstart",
    },
    secondary: {
      label: "Browse Catalog",
      href: "/catalog",
    },
  },
};

// =============================================================================
// PROBLEM SECTION
// =============================================================================

export const problem = {
  label: "The Problem",

  title: "Today, your AI tools are black boxes",

  subtitle: "You don't see what happens. You can't audit. You can't control.",

  points: [
    {
      icon: "visibility_off" as const,
      text: "No visibility into what's executing",
    },
    {
      icon: "casino" as const,
      text: "AI improvises every time — inconsistent results",
    },
    {
      icon: "lock" as const,
      text: "Locked into one vendor's ecosystem",
    },
  ],
};

// =============================================================================
// SOLUTION SECTION
// =============================================================================

export const solution = {
  label: "The Solution",

  title: "See what runs. Validate before it executes. Keep control.",

  points: [
    {
      icon: "visibility" as const,
      title: "Observable",
      description: "Every step traced. Every workflow auditable. Debug in seconds.",
    },
    {
      icon: "check_circle" as const,
      title: "Deterministic",
      description: "Validated workflows run the same way every time. No improvisation.",
    },
    {
      icon: "person" as const,
      title: "Human-in-the-loop",
      description: "Checkpoints for approval. Review and validate without going through AI.",
    },
    {
      icon: "dns" as const,
      title: "Self-hosted",
      description: "Run on your infrastructure. Your data stays yours. No vendor lock-in.",
    },
  ],
};

// =============================================================================
// CATALOG PREVIEW SECTION
// =============================================================================

export const catalogPreview = {
  label: "Catalog",

  title: "Browse. Use. Or build your own.",

  description: "Ready-to-use workflows. Or connect your own MCPs and create custom capabilities.",

  // Carousel capabilities - REAL composite workflows
  capabilities: [
    {
      namespace: "ops",
      action: "deployNotify",
      description: "Orchestrate release notifications across platforms",
      codeHtml: `<span class="kw">const</span> release = <span class="kw">await</span> <span class="fn">mcp.github.get_release</span>({ <span class="key">tag</span>: <span class="str">"latest"</span> });

<span class="kw">await</span> <span class="fn">mcp.slack.post_message</span>({
  <span class="key">channel</span>: <span class="str">"#deployments"</span>,
  <span class="key">text</span>: <span class="str">\`🚀 \${release.tag_name} deployed!\`</span>
});

<span class="kw">await</span> <span class="fn">mcp.notion.update_page</span>({
  <span class="key">page_id</span>: <span class="str">"releases"</span>,
  <span class="key">properties</span>: { <span class="key">Status</span>: <span class="str">"Live"</span> }
});

<span class="kw">return</span> { <span class="key">version</span>: release.tag_name };`,
      tools: ["github.get_release", "slack.post_message", "notion.update_page"],
    },
    {
      namespace: "sales",
      action: "researchCompany",
      description: "Multi-source intelligence with parallel fetching",
      codeHtml: `<span class="kw">const</span> [web, linkedin, funding] = <span class="kw">await</span> <span class="fn">Promise.all</span>([
  <span class="fn">mcp.brave.search</span>({ <span class="key">query</span>: <span class="str">\`\${company} news\`</span> }),
  <span class="fn">mcp.linkedin.company</span>({ <span class="key">name</span>: company }),
  <span class="fn">mcp.crunchbase.funding</span>({ <span class="key">company</span> })
]);

<span class="kw">const</span> summary = <span class="kw">await</span> <span class="fn">mcp.std.agent_summarize</span>({
  <span class="key">content</span>: <span class="fn">JSON.stringify</span>({ web, linkedin, funding }),
  <span class="key">format</span>: <span class="str">"bullet_points"</span>
});

<span class="kw">return</span> { company, summary, <span class="key">sources</span>: <span class="num">3</span> };`,
      tools: ["brave.search", "linkedin.company", "crunchbase.funding", "agent_summarize"],
    },
    {
      namespace: "data",
      action: "syncPipeline",
      description: "ETL workflow with validation and notifications",
      codeHtml: `<span class="kw">const</span> leads = <span class="kw">await</span> <span class="fn">mcp.postgres.query</span>({
  <span class="key">query</span>: <span class="str">"SELECT * FROM leads WHERE synced = false"</span>
});

<span class="kw">for</span> (<span class="kw">const</span> lead <span class="kw">of</span> leads.rows) {
  <span class="kw">const</span> valid = <span class="kw">await</span> <span class="fn">mcp.std.validate_email</span>({ <span class="key">email</span>: lead.email });
  <span class="kw">if</span> (valid) <span class="kw">await</span> <span class="fn">mcp.salesforce.upsert</span>({ <span class="key">data</span>: lead });
}

<span class="kw">await</span> <span class="fn">mcp.slack.dm</span>({ <span class="key">user</span>: <span class="str">"@sales"</span>, <span class="key">text</span>: <span class="str">\`✓ \${leads.rows.length} synced\`</span> });`,
      tools: ["postgres.query", "validate_email", "salesforce.upsert", "slack.dm"],
    },
    {
      namespace: "ai",
      action: "analyzeRepo",
      description: "Deep codebase analysis with agent delegation",
      codeHtml: `<span class="kw">const</span> files = <span class="kw">await</span> <span class="fn">mcp.fs.glob</span>({ <span class="key">pattern</span>: <span class="str">"src/**/*.ts"</span> });

<span class="kw">const</span> analysis = <span class="kw">await</span> <span class="fn">mcp.std.agent_delegate</span>({
  <span class="key">goal</span>: <span class="str">"Analyze architecture patterns"</span>,
  <span class="key">tools</span>: [<span class="str">"fs_read"</span>, <span class="str">"grep"</span>],
  <span class="key">maxIterations</span>: <span class="num">10</span>
});

<span class="kw">await</span> <span class="fn">mcp.notion.create_page</span>({
  <span class="key">title</span>: <span class="str">"Architecture Report"</span>,
  <span class="key">content</span>: analysis.summary
});`,
      tools: ["fs.glob", "agent_delegate", "notion.create_page"],
    },
    {
      namespace: "support",
      action: "triageTicket",
      description: "Auto-classify and route support tickets",
      codeHtml: `<span class="kw">const</span> ticket = <span class="kw">await</span> <span class="fn">mcp.zendesk.get_ticket</span>({ <span class="key">id</span>: ticketId });

<span class="kw">const</span> classification = <span class="kw">await</span> <span class="fn">mcp.std.agent_classify</span>({
  <span class="key">text</span>: ticket.description,
  <span class="key">categories</span>: [<span class="str">"bug"</span>, <span class="str">"feature"</span>, <span class="str">"billing"</span>]
});

<span class="kw">await</span> <span class="fn">mcp.linear.create_issue</span>({
  <span class="key">title</span>: ticket.subject,
  <span class="key">labels</span>: [classification.category]
});`,
      tools: ["zendesk.get_ticket", "agent_classify", "linear.create_issue"],
    },
  ],

  // Quick grid of other namespaces
  namespaces: [
    { ns: "fake", count: 29, icon: "🎭", desc: "Mock data" },
    { ns: "db", count: 5, icon: "🗄️", desc: "Database" },
    { ns: "fs", count: 4, icon: "📂", desc: "Filesystem" },
    { ns: "nlp", count: 3, icon: "🧠", desc: "Text analysis" },
    { ns: "browser", count: 2, icon: "🌐", desc: "Automation" },
    { ns: "git", count: 2, icon: "📦", desc: "Version control" },
    { ns: "startup", count: 2, icon: "🚀", desc: "Business data" },
    { ns: "docker", count: 1, icon: "🐳", desc: "Containers" },
  ],

  cta: {
    label: "Explore Catalog",
    href: "/catalog",
  },
};

// =============================================================================
// QUICK START SECTION
// =============================================================================

export const quickStart = {
  label: "Quick Start",
  title: "Get started in minutes",
  subtitle: "Connect PML to your chat. Access your apps instantly.",

  steps: [
    {
      id: "install",
      title: "Install PML",
      description: "One command. Works on Linux, macOS, and Windows.",
      filename: "terminal",
      codeHtml: `<span class="cmd">$</span> curl -fsSL https://pml.casys.ai/install.sh | sh
<span class="dim">✓ Installed pml to /usr/local/bin/pml</span>`,
    },
    {
      id: "init",
      title: "Initialize your project",
      description: "Creates config for Claude Code, ChatGPT, or your own interface.",
      filename: "terminal",
      codeHtml: `<span class="cmd">$</span> pml init
<span class="dim">Created .pml.json</span>
<span class="dim">Created .mcp.json</span>`,
    },
    {
      id: "use",
      title: "Access your apps",
      description: "Your workflows are now accessible from any connected chat.",
      filename: "chat",
      codeHtml: `<span class="comment"># From any chat:</span>
"Deploy the latest release and notify the team"

<span class="dim">→ ops:deployNotify executed</span>
<span class="dim">→ 3 tools called, 1.2s total</span>`,
    },
  ],

  cta: {
    label: "Read the Docs",
    href: "/docs",
  },
};

// =============================================================================
// BLOG SECTION
// =============================================================================

export const blog = {
  label: "Blog",
  title: "Insights & Updates",
  description: "Technical deep dives and product updates.",
  cta: {
    label: "View All Posts →",
    href: "/blog",
  },
};

// =============================================================================
// BETA SIGNUP SECTION
// =============================================================================

export const betaSignup = {
  title: "Join the beta",
  description: "Be among the first to build on the conversational web.",

  form: {
    placeholder: "Enter your email",
    button: "Start Building",
  },

  note: "We'll reach out when your spot is ready.",
};

// =============================================================================
// CTA SECTION
// =============================================================================

export const cta = {
  title: "Ready to take control?",

  description: "Observable workflows. Deterministic execution. Your infrastructure.",

  actions: {
    primary: {
      label: "Start Building",
      href: "#quickstart",
      icon: "arrow",
    },
    secondary: {
      label: "Browse Catalog",
      href: "/catalog",
      icon: "arrow",
    },
  },
};

// =============================================================================
// NAVIGATION
// =============================================================================

export const navigation = {
  brand: {
    name: "Casys PML",
    tagline: "Conversational Web Gateway",
  },
  links: [
    { href: "#catalog", label: "Catalog" },
    { href: "/docs", label: "Docs" },
    { href: "/blog", label: "Blog" },
    { href: "#beta", label: "Beta", highlight: true },
  ],
  github: "https://github.com/Casys-AI/casys-pml",
};

// =============================================================================
// FOOTER
// =============================================================================

export const footer = {
  brand: {
    name: "Casys PML",
    tagline: "Conversational Web Gateway",
  },
  links: [
    { href: "https://casys.ai", label: "Casys.ai", external: true },
    { href: "https://github.com/Casys-AI/casys-pml", label: "GitHub", external: true },
    { href: "https://discord.gg/fuPg8drR", label: "Discord", external: true },
    { href: "/docs", label: "Docs" },
    { href: "/catalog", label: "Catalog" },
  ],
};
