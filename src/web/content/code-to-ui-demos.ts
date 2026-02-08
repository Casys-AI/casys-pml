/**
 * Code to UI Demo Data
 *
 * Use cases for the landing page "Write → Get" showcase.
 * Each demo shows a code snippet and the resulting UI components.
 *
 * @module web/content/code-to-ui-demos
 */

export interface CodeToUiDemo {
  /** Unique identifier */
  id: string;
  /** Display title */
  title: string;
  /** Short description */
  description: string;
  /** Icon/emoji */
  icon: string;
  /** Code snippet to display */
  code: string;
  /** Tools used in the workflow */
  tools: string[];
  /** UI components to show as result */
  uiComponents: {
    /** Component resource URI */
    resourceUri: string;
    /** Mock data for the preview */
    mockData: unknown;
    /** Grid position/size hint */
    size?: "small" | "medium" | "large";
  }[];
  /** Accent color for this demo */
  accentColor: string;
}

export const CODE_TO_UI_DEMOS: CodeToUiDemo[] = [
  {
    id: "ops-deploy",
    title: "Deploy & Notify",
    description: "Orchestrate releases across platforms",
    icon: "🚀",
    accentColor: "#FF6B6B",
    tools: ["github.get_release", "slack.post_message", "notion.update_page"],
    code: `const release = await mcp.github.get_release({ tag: "latest" });

const [slack, notion] = await Promise.all([
  mcp.slack.post_message({
    channel: "#deployments",
    text: \`🚀 \${release.tag_name} deployed!\`
  }),
  mcp.notion.update_page({
    page_id: "releases",
    properties: { Status: "Live" }
  })
]);

return { version: release.tag_name, notified: 2 };`,
    uiComponents: [
      {
        resourceUri: "ui://mcp-std/timeline-viewer",
        size: "large",
        mockData: {
          title: "Deployment Timeline",
          events: [
            { timestamp: "2026-02-04T14:32:01Z", type: "success", title: "GitHub Release fetched", description: "Tag v2.4.1" },
            { timestamp: "2026-02-04T14:32:02Z", type: "success", title: "Slack notified", description: "#deployments channel" },
            { timestamp: "2026-02-04T14:32:02Z", type: "success", title: "Notion updated", description: "Status → Live" },
            { timestamp: "2026-02-04T14:32:03Z", type: "success", title: "Deploy complete", description: "v2.4.1 is live" },
          ],
        },
      },
      {
        resourceUri: "ui://mcp-std/gauge",
        size: "small",
        mockData: {
          value: 100,
          min: 0,
          max: 100,
          label: "Deploy",
          unit: "%",
        },
      },
    ],
  },
  {
    id: "sales-research",
    title: "Company Intel",
    description: "Multi-source research with parallel fetching",
    icon: "🔍",
    accentColor: "#4ECDC4",
    tools: ["brave.search", "linkedin.company", "crunchbase.funding", "agent_summarize"],
    code: `const [web, linkedin, funding] = await Promise.all([
  mcp.brave.search({ query: \`\${company} news\` }),
  mcp.linkedin.company({ name: company }),
  mcp.crunchbase.funding({ company })
]);

const summary = await mcp.std.agent_summarize({
  content: JSON.stringify({ web, linkedin, funding }),
  format: "bullet_points"
});

return { company, summary, sources: 3 };`,
    uiComponents: [
      {
        resourceUri: "ui://mcp-std/markdown-viewer",
        size: "large",
        mockData: {
          content: "## Acme Corp\n\n| Metric | Value |\n|--------|-------|\n| Employees | 2,400 |\n| Funding | $142M |\n| Founded | 2019 |\n\n### Key Insights\n\n- **Growth**: 340% YoY revenue\n- **Market**: Leader in AI infra\n- **Team**: Ex-Google, Meta",
        },
      },
      {
        resourceUri: "ui://mcp-std/gauge",
        size: "small",
        mockData: {
          value: 3,
          min: 0,
          max: 3,
          label: "Sources",
          unit: "",
        },
      },
    ],
  },
  {
    id: "data-pipeline",
    title: "Sync Pipeline",
    description: "ETL with validation and notifications",
    icon: "🔄",
    accentColor: "#95E1D3",
    tools: ["postgres.query", "validate_email", "salesforce.upsert", "slack.dm"],
    code: `const leads = await mcp.postgres.query({
  query: "SELECT * FROM leads WHERE synced = false"
});

for (const lead of leads.rows) {
  const valid = await mcp.std.validate_email({ email: lead.email });
  if (valid) await mcp.salesforce.upsert({ data: lead });
}

await mcp.slack.dm({
  user: "@sales",
  text: \`✓ \${leads.rows.length} leads synced\`
});`,
    uiComponents: [
      {
        resourceUri: "ui://mcp-std/table-viewer",
        size: "large",
        mockData: {
          columns: ["email", "company", "status"],
          rows: [
            ["j.smith@acme.co", "Acme Corp", "✓ synced"],
            ["a.jones@tech.io", "TechIO", "✓ synced"],
            ["invalid@...", "—", "✗ invalid"],
            ["m.lee@startup.ai", "StartupAI", "✓ synced"],
          ],
        },
      },
      {
        resourceUri: "ui://mcp-std/gauge",
        size: "small",
        mockData: {
          value: 87,
          min: 0,
          max: 100,
          label: "Sync Rate",
          unit: "%",
          thresholds: { warning: 70, critical: 50 },
        },
      },
    ],
  },
  {
    id: "server-monitor",
    title: "Server Monitor",
    description: "Dashboard temps réel + alertes multi-canal",
    icon: "📊",
    accentColor: "#FF6B6B",
    tools: ["system_info", "process_list", "resend.send", "twilio.whatsapp"],
    code: `const [cpu, mem, disk, procs] = await Promise.all([
  mcp.std.cpu_usage(),
  mcp.std.memory_info(),
  mcp.std.df_usage(),
  mcp.std.process_list({ sort: "cpu", limit: 5 })
]);

// Alerte multi-canal si seuil critique
if (cpu.percent > 85 || disk.usedPercent > 90) {
  await Promise.all([
    mcp.resend.send({
      to: "ops@company.com",
      subject: "⚠️ Server Alert",
      html: \`CPU: \${cpu.percent}% | Disk: \${disk.usedPercent}%\`
    }),
    mcp.twilio.whatsapp({
      to: "+33612345678",
      body: \`🚨 Alert: CPU \${cpu.percent}%\`
    })
  ]);
}

return { cpu, mem, disk, procs };`,
    uiComponents: [
      {
        resourceUri: "ui://mcp-std/gauge",
        size: "small",
        mockData: { value: 87, min: 0, max: 100, label: "CPU", unit: "%", thresholds: { warning: 70, critical: 85 } },
      },
      {
        resourceUri: "ui://mcp-std/gauge",
        size: "small",
        mockData: { value: 62, min: 0, max: 100, label: "RAM", unit: "%", thresholds: { warning: 75, critical: 90 } },
      },
      {
        resourceUri: "ui://mcp-std/gauge",
        size: "small",
        mockData: { value: 91, min: 0, max: 100, label: "Disk", unit: "%", thresholds: { warning: 80, critical: 90 } },
      },
      {
        resourceUri: "ui://mcp-std/table-viewer",
        size: "large",
        mockData: {
          columns: ["process", "cpu", "memory"],
          rows: [
            ["node api", "34.2%", "512MB"],
            ["postgres", "28.1%", "1.2GB"],
            ["redis", "15.4%", "256MB"],
            ["nginx", "8.7%", "64MB"],
          ],
        },
      },
    ],
  },
  {
    id: "ai-analysis",
    title: "Repo Analysis",
    description: "Deep codebase analysis with agent delegation",
    icon: "🤖",
    accentColor: "#C792EA",
    tools: ["fs.glob", "agent_delegate", "notion.create_page"],
    code: `const files = await mcp.fs.glob({ pattern: "src/**/*.ts" });

const analysis = await mcp.std.agent_delegate({
  goal: "Analyze architecture patterns",
  tools: ["fs_read", "grep"],
  maxIterations: 10
});

await mcp.notion.create_page({
  title: "Architecture Report",
  content: analysis.summary
});`,
    uiComponents: [
      {
        resourceUri: "ui://mcp-std/tree-viewer",
        size: "medium",
        mockData: {
          id: "root",
          label: "src/",
          type: "folder",
          children: [
            { id: "api", label: "api/", type: "folder", children: [
              { id: "routes", label: "routes.ts", type: "file" },
              { id: "handlers", label: "handlers.ts", type: "file" },
            ]},
            { id: "core", label: "core/", type: "folder", children: [
              { id: "engine", label: "engine.ts", type: "file" },
              { id: "types", label: "types.ts", type: "file" },
            ]},
            { id: "utils", label: "utils/", type: "folder", children: [
              { id: "helpers", label: "helpers.ts", type: "file" },
            ]},
          ],
        },
      },
      {
        resourceUri: "ui://mcp-std/chart-viewer",
        size: "medium",
        mockData: {
          type: "pie",
          title: "Code Distribution",
          labels: ["Components", "Services", "Utils", "Tests"],
          datasets: [{ data: [42, 28, 18, 12] }],
        },
      },
    ],
  },
];

/**
 * Get demo by ID
 */
export function getDemoById(id: string): CodeToUiDemo | undefined {
  return CODE_TO_UI_DEMOS.find(d => d.id === id);
}
