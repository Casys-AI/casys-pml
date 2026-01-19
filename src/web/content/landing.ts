/**
 * Landing Page Content
 *
 * Centralized copy/messaging for the landing page.
 * Separates content from structure for easier editing and i18n.
 *
 * @module web/content/landing
 */

// =============================================================================
// META & SEO
// =============================================================================

export const meta = {
  title: "Casys PML - Procedural Memory Layer",
  description:
    "Stop asking 'which API do I call?' Express intent, and capabilities emerge. " +
    "PML captures emergent workflows and crystallizes them into reusable procedures. " +
    "RAG gave agents knowledge. PML gives them capabilities.",
  ogImage: "https://pml.casys.ai/assets/og/home.png",
};

// =============================================================================
// HERO SECTION
// =============================================================================

export const hero = {
  eyebrow: "Procedural Memory for AI Agents",

  title: {
    line1: "Your agent repeats itself.",
    accent: "What if it learned instead?",
  },

  description:
    "Today's AI thinks through every action from scratch. " +
    "PML gives it procedural memory — skills it builds, keeps, and reuses. " +
    "Not skills you write. Capabilities your AI discovers.",

  // For the visual diagram
  visual: {
    before: {
      label: "Day 1",
      query: '"How do I query your database?"',
    },
    after: {
      label: "Day 30",
      action: "db:query",
      result: "✓ Done",
      note: "236 calls. Zero re-explanations.",
    },
  },

  cta: {
    primary: {
      label: "See How It Works",
      href: "#how",
    },
    secondary: {
      label: "View on GitHub",
      href: "https://github.com/Casys-AI/casys-pml",
    },
  },
};

// =============================================================================
// CATALOG PREVIEW SECTION
// =============================================================================

export const catalogPreview = {
  label: "Catalog",

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

  // Quick grid of other namespaces (real data)
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
    label: "Browse Full Catalog",
    href: "/catalog",
  },
};

// =============================================================================
// QUICK START SECTION
// =============================================================================

export const quickStart = {
  label: "Quick Start",
  title: "Up and running in 3 steps",
  subtitle: "Add procedural memory to Claude Code in under a minute.",

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
      description: "Creates .mcp.json for Claude Code. PML starts automatically via stdio.",
      filename: "terminal",
      codeHtml: `<span class="cmd">$</span> cd your-project
<span class="cmd">$</span> <span class="flag">pml</span> init
<span class="dim">Created .pml.json</span>
<span class="dim">Created .mcp.json</span>

<span class="cmd">$</span> echo <span class="str">"PML_API_KEY=your_key"</span> >> .env`,
    },
    {
      id: "use",
      title: "Use with Claude Code",
      description: "That's it. Claude Code auto-starts PML. Just describe what you want.",
      filename: "claude-code",
      codeHtml: `<span class="comment"># PML tools are available automatically:</span>
<span class="flag">pml:discover</span>({ <span class="key">intent</span>: <span class="str">"read a JSON file"</span> })

<span class="flag">pml:execute</span>({
  <span class="key">intent</span>: <span class="str">"List dependencies from package.json"</span>,
  <span class="key">code</span>: <span class="str">\`const pkg = await mcp.fs.read_file(...);\`</span>
})`,
      result: "PML learns patterns as you work",
    },
  ],

  cta: {
    label: "Read the full docs",
    href: "/docs",
  },
};

// =============================================================================
// BLOG SECTION
// =============================================================================

export const blog = {
  label: "Engineering Blog",
  title: "Latest Insights",
  description: "Deep dives, debugging stories, and lessons learned.",
  cta: {
    label: "View All Posts →",
    href: "/blog",
  },
};

// =============================================================================
// CTA SECTION
// =============================================================================

export const cta = {
  title: "Curious? Dive in.",
  description:
    "Casys PML is fully open source. " +
    "Explore the code, run experiments, or contribute to the research.",

  actions: {
    primary: {
      label: "Clone & Experiment",
      href: "https://github.com/Casys-AI/casys-pml",
      icon: "github",
    },
    secondary: {
      label: "Read the Blog",
      href: "/blog",
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
    tagline: "Procedural Memory Layer",
  },
  links: [
    { href: "#catalog", label: "Capabilities" },
    { href: "/docs", label: "Docs" },
    { href: "/blog", label: "Blog" },
  ],
  github: "https://github.com/Casys-AI/casys-pml",
};

// =============================================================================
// FOOTER
// =============================================================================

export const footer = {
  brand: {
    name: "Casys PML",
    tagline: "Procedural Memory Layer",
  },
  links: [
    { href: "https://casys.ai", label: "Casys.ai", external: true },
    { href: "https://github.com/Casys-AI/casys-pml", label: "GitHub", external: true },
    { href: "/docs", label: "Docs" },
    { href: "/catalog", label: "Catalog" },
  ],
};
