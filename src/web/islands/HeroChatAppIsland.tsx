/**
 * HeroChatAppIsland - Canvas Split avec vrais MCP UIs
 *
 * "Parlez. L'application apparaît."
 *
 * Features:
 * - Layout Canvas Split (chat compact + dashboard LARGE)
 * - Slide panel pour voir le code (pas de flip 3D)
 * - Multi use-cases avec pills + auto-rotation
 * - Vrais MCP UIs via AppBridge
 *
 * Refactorisé avec Tailwind v4
 *
 * @module web/islands/HeroChatAppIsland
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { DemoSelector, type DemoOption } from "../components/landing-v2/molecules/DemoSelector.tsx";
import CodeBlock from "../components/ui/atoms/CodeBlock.tsx";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Demo Data - Multiple workflows per use-case
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface UiComponent {
  resourceUri: string;
  mockData: unknown;
}

interface Workflow {
  userMessage: string;
  code: string;
  tools: string[];
  uiComponent: UiComponent;
}

interface UseCase {
  id: string;
  icon: string;
  label: string;
  workflows: Workflow[];
}

const USE_CASES: UseCase[] = [
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // USE CASE 1: DevOps - SRE, Platform Engineer, DevOps
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "devops",
    icon: "🔧",
    label: "DevOps",
    workflows: [
      // Workflow 1: Deploy to production (timeline-viewer)
      {
        userMessage: "Deploy api v2.3 to production",
        code: `const release = await mcp.github.get_release({ tag: "v2.3.0" });

const deploy = await mcp.k8s.rolling_update({
  deployment: "api-prod",
  image: \`gcr.io/myapp/api:\${release.tag}\`,
  strategy: "RollingUpdate"
});

await mcp.slack.post("#deploys", \`✅ api v2.3 deployed\`);
return deploy;`,
        tools: ["github.get_release", "k8s.rolling_update", "slack.post"],
        uiComponent: {
          resourceUri: "ui://mcp-std/timeline-viewer",
          mockData: {
            title: "Deploy api:v2.3 → Production",
            events: [
              { timestamp: "2026-02-05T14:30:00Z", type: "info", title: "Release fetched", description: "Tag v2.3.0 from main branch" },
              { timestamp: "2026-02-05T14:30:02Z", type: "info", title: "Image pulled", description: "gcr.io/myapp/api:v2.3.0" },
              { timestamp: "2026-02-05T14:30:05Z", type: "info", title: "Rolling update started", description: "0/3 pods ready" },
              { timestamp: "2026-02-05T14:30:12Z", type: "success", title: "Pod 1/3 ready", description: "api-prod-7f8d9-xk2m1" },
              { timestamp: "2026-02-05T14:30:18Z", type: "success", title: "Pod 2/3 ready", description: "api-prod-7f8d9-bv3n2" },
              { timestamp: "2026-02-05T14:30:24Z", type: "success", title: "Pod 3/3 ready", description: "api-prod-7f8d9-qw4p3" },
              { timestamp: "2026-02-05T14:30:26Z", type: "success", title: "Deploy complete", description: "All pods healthy, 0 errors" },
            ],
          },
        },
      },
      // Workflow 2: Compare configs - KILLER FEATURE (diff-viewer)
      {
        userMessage: "Compare staging vs prod config",
        code: `const [staging, prod] = await Promise.all([
  mcp.k8s.get_configmap("api-config", "staging"),
  mcp.k8s.get_configmap("api-config", "production")
]);

const diff = await mcp.std.diff(staging.data, prod.data);
return diff;`,
        tools: ["k8s.get_configmap", "std.diff"],
        uiComponent: {
          resourceUri: "ui://mcp-std/diff-viewer",
          mockData: {
            filename: "api-config.yaml",
            oldLabel: "staging",
            newLabel: "production",
            hunks: [
              {
                header: "@@ -8,6 +8,6 @@ database:",
                lines: [
                  { type: "context", content: "database:" },
                  { type: "context", content: "  host: postgres.internal" },
                  { type: "remove", content: "  pool_size: 10" },
                  { type: "add", content: "  pool_size: 50" },
                  { type: "remove", content: "  timeout_ms: 5000" },
                  { type: "add", content: "  timeout_ms: 30000" },
                ],
              },
              {
                header: "@@ -18,4 +18,6 @@ cache:",
                lines: [
                  { type: "context", content: "cache:" },
                  { type: "remove", content: "  enabled: false" },
                  { type: "add", content: "  enabled: true" },
                  { type: "add", content: "  ttl_seconds: 3600" },
                  { type: "add", content: "  provider: redis" },
                ],
              },
            ],
          },
        },
      },
      // Workflow 3: Analyze API latency - KILLER FEATURE (waterfall-viewer)
      {
        userMessage: "Why is /api/users slow?",
        code: `const trace = await mcp.jaeger.get_trace({
  service: "api",
  operation: "GET /api/users",
  lookback: "1h"
});

return mcp.std.analyze_latency(trace);`,
        tools: ["jaeger.get_trace", "std.analyze_latency"],
        uiComponent: {
          resourceUri: "ui://mcp-std/waterfall-viewer",
          mockData: [
            { url: "GET /api/users", method: "GET", status: 200, totalTime: 847, phases: { dns: 0, connect: 0, tls: 0, ttfb: 780, download: 67 } },
            { url: "postgres: SELECT * FROM users", method: "SQL", status: 200, totalTime: 623, phases: { dns: 0, connect: 8, tls: 0, ttfb: 612, download: 3 } },
            { url: "redis: GET user_cache", method: "CACHE", status: 404, totalTime: 12, phases: { dns: 0, connect: 1, tls: 0, ttfb: 10, download: 1 } },
            { url: "serialize response", method: "CPU", status: 200, totalTime: 145, phases: { dns: 0, connect: 0, tls: 0, ttfb: 145, download: 0 } },
          ],
        },
      },
    ],
  },
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // USE CASE 2: Security - SecOps, DevSecOps, SRE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "security",
    icon: "🔒",
    label: "Security",
    workflows: [
      // Workflow 1: Check SSL certificate (certificate-viewer)
      {
        userMessage: "Check SSL cert for api.acme.com",
        code: `const cert = await mcp.std.ssl_check({
  host: "api.acme.com",
  port: 443
});

if (cert.daysRemaining < 30) {
  await mcp.slack.post("#security", "⚠️ SSL cert expiring soon");
}
return cert;`,
        tools: ["std.ssl_check", "slack.post"],
        uiComponent: {
          resourceUri: "ui://mcp-std/certificate-viewer",
          mockData: {
            host: "api.acme.com",
            port: 443,
            valid: true,
            status: "valid",
            certificate: {
              subject: "CN=api.acme.com",
              issuer: "CN=Let's Encrypt Authority X3, O=Let's Encrypt, C=US",
              validFrom: "2026-01-15T00:00:00Z",
              validTo: "2026-04-15T00:00:00Z",
              daysRemaining: 68,
              serialNumber: "04:8E:2C:1F:3A:7B:9D:5E",
              signatureAlgorithm: "SHA256-RSA",
              sans: ["api.acme.com", "*.api.acme.com", "acme.com"],
            },
            chain: [
              { subject: "CN=api.acme.com", issuer: "CN=Let's Encrypt Authority X3" },
              { subject: "CN=Let's Encrypt Authority X3", issuer: "CN=ISRG Root X1" },
              { subject: "CN=ISRG Root X1", issuer: "CN=DST Root CA X3" },
            ],
          },
        },
      },
      // Workflow 2: Decode JWT - KILLER FEATURE (jwt-viewer)
      {
        userMessage: "Decode this auth token",
        code: `const token = context.input; // from clipboard or input

const decoded = await mcp.std.jwt_decode(token);
const valid = await mcp.auth.verify_token(token);

return { ...decoded, valid };`,
        tools: ["std.jwt_decode", "auth.verify_token"],
        uiComponent: {
          resourceUri: "ui://mcp-std/jwt-viewer",
          mockData: {
            header: {
              alg: "RS256",
              typ: "JWT",
              kid: "prod-key-2026-01",
            },
            payload: {
              sub: "user_8f3k2m1n",
              email: "alice@acme.com",
              name: "Alice Martin",
              roles: ["admin", "developer"],
              org_id: "org_acme",
              iat: 1738756800,
              exp: 1738843200,
              iss: "https://auth.acme.com",
              aud: "api.acme.com",
            },
            signature: "verified ✓",
            expired: false,
            expiresIn: "23h 42m",
          },
        },
      },
      // Workflow 3: Analyze headers (headers-viewer)
      {
        userMessage: "Audit security headers for acme.com",
        code: `const response = await mcp.std.http_get("https://acme.com");
const audit = await mcp.std.audit_headers(response.headers);

return audit;`,
        tools: ["std.http_get", "std.audit_headers"],
        uiComponent: {
          resourceUri: "ui://mcp-std/headers-viewer",
          mockData: {
            url: "https://acme.com",
            status: 200,
            type: "response",
            headers: {
              "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
              "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'",
              "x-frame-options": "DENY",
              "x-content-type-options": "nosniff",
              "x-xss-protection": "1; mode=block",
              "referrer-policy": "strict-origin-when-cross-origin",
              "permissions-policy": "geolocation=(), microphone=(), camera=()",
            },
          },
        },
      },
    ],
  },
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // USE CASE 3: Data - Data Engineer, Backend Dev, Analyst
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "data",
    icon: "📊",
    label: "Data",
    workflows: [
      // Workflow 1: Query database (table-viewer)
      {
        userMessage: "Show top customers by revenue",
        code: `const result = await mcp.postgres.query(\`
  SELECT name, revenue, orders, region, since
  FROM customers
  ORDER BY revenue DESC
  LIMIT 10
\`);

return result.rows;`,
        tools: ["postgres.query"],
        uiComponent: {
          resourceUri: "ui://mcp-std/table-viewer",
          mockData: {
            columns: ["Customer", "Revenue", "Orders", "Region", "Since"],
            rows: [
              ["Acme Corporation", "$1.2M", "847", "North America", "2019"],
              ["TechStart Inc", "$890K", "523", "Europe", "2020"],
              ["GlobalTech Ltd", "$654K", "412", "APAC", "2021"],
              ["DataFlow Systems", "$543K", "389", "North America", "2020"],
              ["CloudNine SaaS", "$432K", "298", "Europe", "2022"],
              ["Innovate.io", "$387K", "267", "APAC", "2021"],
            ],
          },
        },
      },
      // Workflow 2: Show schema - KILLER FEATURE (erd-viewer)
      {
        userMessage: "Show orders database schema",
        code: `const schema = await mcp.postgres.get_schema("orders");
const relations = await mcp.postgres.get_foreign_keys("orders");

return { tables: schema, relationships: relations };`,
        tools: ["postgres.get_schema", "postgres.get_foreign_keys"],
        uiComponent: {
          resourceUri: "ui://mcp-std/erd-viewer",
          mockData: {
            schema: "orders",
            tables: [
              {
                name: "customers",
                columns: [
                  { name: "id", type: "uuid", isPrimaryKey: true },
                  { name: "email", type: "varchar(255)" },
                  { name: "name", type: "varchar(100)" },
                  { name: "created_at", type: "timestamp" },
                ],
              },
              {
                name: "orders",
                columns: [
                  { name: "id", type: "uuid", isPrimaryKey: true },
                  { name: "customer_id", type: "uuid" },
                  { name: "total", type: "decimal(10,2)" },
                  { name: "status", type: "varchar(20)" },
                  { name: "created_at", type: "timestamp" },
                ],
              },
              {
                name: "order_items",
                columns: [
                  { name: "id", type: "uuid", isPrimaryKey: true },
                  { name: "order_id", type: "uuid" },
                  { name: "product_id", type: "uuid" },
                  { name: "quantity", type: "int" },
                  { name: "price", type: "decimal(10,2)" },
                ],
              },
            ],
            relationships: [
              { fromTable: "orders", fromColumn: "customer_id", toTable: "customers", toColumn: "id" },
              { fromTable: "order_items", fromColumn: "order_id", toTable: "orders", toColumn: "id" },
            ],
          },
        },
      },
      // Workflow 3: Explain query - KILLER FEATURE (plan-viewer)
      {
        userMessage: "Why is this query slow?",
        code: `const plan = await mcp.postgres.explain(\`
  SELECT * FROM orders
  WHERE customer_id = $1 AND status = 'pending'
\`, { analyze: true });

return plan;`,
        tools: ["postgres.explain"],
        uiComponent: {
          resourceUri: "ui://mcp-std/plan-viewer",
          mockData: {
            query: "SELECT * FROM orders WHERE customer_id = $1 AND status = 'pending'",
            totalCost: 1247.5,
            executionTime: "842ms",
            nodes: [
              { id: "1", type: "Seq Scan", relation: "orders", cost: 1247.5, rows: 50000, actual: 48923, warning: "Sequential scan - consider index" },
              { id: "2", type: "Filter", condition: "status = 'pending'", cost: 12.5, rows: 1250, actual: 1189, parent: "1" },
              { id: "3", type: "Filter", condition: "customer_id = $1", cost: 0.5, rows: 12, actual: 8, parent: "2" },
            ],
            suggestions: [
              "CREATE INDEX idx_orders_customer_status ON orders(customer_id, status)",
              "Consider partitioning orders table by status",
            ],
          },
        },
      },
    ],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Timing constants
const WORKFLOW_ROTATE_MS = 8000; // 8s between workflows within a use-case
const USE_CASE_ROTATE_MS = 40000; // 40s before switching use-case
const PAUSE_AFTER_INTERACTION_MS = 30000; // 30s pause after user interaction

export default function HeroChatAppIsland() {
  const [useCaseIndex, setUseCaseIndex] = useState(0);
  const [workflowIndex, setWorkflowIndex] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeUseCase = USE_CASES[useCaseIndex];
  const activeWorkflow = activeUseCase.workflows[workflowIndex];

  const demoOptions: DemoOption[] = useMemo(
    () => USE_CASES.map((uc) => ({ id: uc.id, icon: uc.icon, label: uc.label })),
    []
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    };
  }, []);

  // Auto-rotate workflows within use-case (8s)
  useEffect(() => {
    if (isPaused || showCode) return;

    const interval = setInterval(() => {
      setWorkflowIndex((i) => (i + 1) % activeUseCase.workflows.length);
    }, WORKFLOW_ROTATE_MS);

    return () => clearInterval(interval);
  }, [isPaused, showCode, activeUseCase.workflows.length]);

  // Auto-rotate use-cases (40s)
  useEffect(() => {
    if (isPaused || showCode) return;

    const interval = setInterval(() => {
      setUseCaseIndex((i) => (i + 1) % USE_CASES.length);
      setWorkflowIndex(0); // Reset to first workflow
    }, USE_CASE_ROTATE_MS);

    return () => clearInterval(interval);
  }, [isPaused, showCode]);

  const handleDemoSelect = useCallback((index: number) => {
    setUseCaseIndex(index);
    setWorkflowIndex(0);
    setShowCode(false);
    setIsPaused(true);

    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => setIsPaused(false), PAUSE_AFTER_INTERACTION_MS);
  }, []);

  const toggleCode = useCallback(() => {
    setShowCode((v) => !v);
  }, []);

  return (
    <div
      class="relative w-full max-w-[1200px]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="img"
      aria-label="Interactive demo showing MCP Apps appearing in chat"
    >
      {/* Ambient glow */}
      <div
        class="absolute -inset-16 rounded-[60px] opacity-25 blur-[60px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse 70% 50% at 60% 40%, rgba(255,184,111,0.4) 0%, transparent 70%)" }}
      />

      {/* Main container */}
      <div class="relative z-10 flex bg-[#09090b] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl h-[520px]">

        {/* Left: Chat Panel */}
        <div class="w-[260px] flex-shrink-0 flex flex-col bg-[#0a0a0c] border-r border-white/[0.06]">
          {/* Window chrome */}
          <div class="flex items-center gap-2 px-4 py-3 bg-white/[0.02] border-b border-white/[0.05]">
            <div class="flex gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <span class="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <span class="w-2.5 h-2.5 rounded-full bg-green-500/70" />
            </div>
            <span class="ml-auto font-mono text-[0.65rem] text-stone-600">conversation</span>
          </div>

          {/* Messages - all workflows, clickable */}
          <div class="flex-1 p-3 flex flex-col gap-2 overflow-y-auto">
            {activeUseCase.workflows.map((wf, i) => {
              const isActive = i === workflowIndex;
              const isPast = i < workflowIndex;
              const isFuture = i > workflowIndex;

              return (
                <button
                  key={i}
                  onClick={() => {
                    setWorkflowIndex(i);
                    setIsPaused(true);
                    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
                    resumeTimeoutRef.current = setTimeout(() => setIsPaused(false), PAUSE_AFTER_INTERACTION_MS);
                  }}
                  class={`flex flex-col gap-1.5 text-left transition-all duration-200 rounded-lg p-1.5 -m-1.5 ${
                    isActive ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"
                  } ${isFuture ? "opacity-40" : ""}`}
                >
                  {/* User message */}
                  <div class="flex gap-2">
                    <div class={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                      isFuture ? "bg-stone-800" : "bg-pml-accent/15"
                    }`}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill={isFuture ? "#57534e" : "#FFB86F"}>
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class={`p-1.5 rounded-md rounded-tl-sm ${
                        isFuture
                          ? "bg-stone-800/50 border border-stone-700/30"
                          : "bg-pml-accent/10 border border-pml-accent/15"
                      }`}>
                        <p class={`text-[0.7rem] leading-snug ${isFuture ? "text-stone-500" : "text-stone-200"}`}>
                          {wf.userMessage}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Status indicator */}
                  <div class="flex gap-2 pl-7">
                    {isActive ? (
                      <span class="inline-flex items-center gap-1 font-mono text-[0.6rem] text-pml-accent">
                        <span class="w-1.5 h-1.5 rounded-full bg-pml-accent animate-pulse" />
                        rendering...
                      </span>
                    ) : isPast ? (
                      <span class="font-mono text-[0.6rem] text-green-500/70">✓ rendered</span>
                    ) : (
                      <span class="font-mono text-[0.6rem] text-stone-600">○ pending</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Canvas mode badge */}
          <div class="px-4 py-3 border-t border-white/[0.04] flex justify-center">
            <span class="inline-flex items-center gap-1.5 font-mono text-[0.55rem] text-stone-600 uppercase tracking-wider">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
              canvas mode
            </span>
          </div>
        </div>

        {/* Right: Dashboard */}
        <div class="flex-1 flex flex-col relative overflow-hidden">
          {/* Header */}
          <div class="flex items-center gap-3 px-5 py-3 bg-white/[0.02] border-b border-white/[0.06]">
            <span class="text-xl">{activeUseCase.icon}</span>
            <span class="text-base font-medium text-stone-200">{activeUseCase.label}</span>
            <span class="ml-auto inline-flex items-center gap-1.5 font-mono text-[0.6rem] px-3 py-1.5 rounded-md bg-green-500/10 text-green-400 uppercase tracking-wide">
              <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          </div>

          {/* MCP UI Frame */}
          <div class="flex-1 p-4 overflow-hidden">
            <McpUiFrame
              key={`${activeUseCase.id}-${workflowIndex}`}
              resourceUri={activeWorkflow.uiComponent.resourceUri}
              mockData={activeWorkflow.uiComponent.mockData}
            />
          </div>

          {/* Code toggle button */}
          <button
            onClick={toggleCode}
            class="absolute bottom-4 right-4 z-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.08] text-stone-400 font-mono text-xs hover:bg-white/[0.1] hover:text-stone-200 transition-all"
          >
            {showCode ? (
              <>
                <span>UI</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                </svg>
              </>
            ) : (
              <>
                <span>&lt;/&gt;</span>
                <span>Code</span>
              </>
            )}
          </button>

          {/* Code panel (slide from right) */}
          <div
            class={`absolute inset-0 bg-[#050506] transition-transform duration-300 ease-out ${showCode ? "translate-x-0" : "translate-x-full"}`}
          >
            <div class="h-full flex flex-col">
              {/* Code header */}
              <div class="flex items-center gap-3 px-5 py-3 bg-white/[0.02] border-b border-white/[0.06]">
                <span class="font-mono text-sm text-stone-400">workflow.ts</span>
                <span class="text-[0.6rem] text-stone-600 uppercase tracking-wide">MCP Workflow</span>
              </div>

              {/* Code content - using CodeBlock */}
              <div class="flex-1 overflow-auto">
                <CodeBlock code={activeWorkflow.code} class="h-full rounded-none" />
              </div>

              {/* Tools used */}
              <div class="px-5 py-3 border-t border-white/[0.06] flex flex-wrap gap-2">
                {activeWorkflow.tools.map((tool) => (
                  <span key={tool} class="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 text-green-400 font-mono text-[0.65rem]">
                    <span class="text-green-500">✓</span>
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Demo selector */}
      <DemoSelector
        demos={demoOptions}
        activeIndex={useCaseIndex}
        onSelect={handleDemoSelect}
        class="mt-4 bg-white/[0.02] border border-white/[0.06] rounded-xl"
      />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MCP UI Frame (AppBridge pattern)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface McpUiFrameProps {
  resourceUri: string;
  mockData: unknown;
}

function McpUiFrame({ resourceUri, mockData }: McpUiFrameProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "connected" | "error">("idle");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);

  const resultToMcpContent = useCallback((result: unknown): Array<{ type: "text"; text: string }> => {
    if (result === null || result === undefined) {
      return [{ type: "text", text: "null" }];
    }
    if (typeof result === "string") {
      return [{ type: "text", text: result }];
    }
    return [{ type: "text", text: JSON.stringify(result, null, 2) }];
  }, []);

  const setupBridge = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    if (bridgeRef.current) {
      bridgeRef.current.close().catch(() => {});
    }

    setStatus("loading");

    const bridge = new AppBridge(
      null,
      { name: "Hero Preview", version: "1.0.0" },
      { openLinks: {}, logging: {} },
      { hostContext: { theme: "dark", displayMode: "inline" } },
    );

    bridge.oninitialized = () => {
      setStatus("connected");
      bridge.sendToolResult({
        content: resultToMcpContent(mockData),
        isError: false,
      });
    };

    bridgeRef.current = bridge;

    const transport = new PostMessageTransport(
      iframe.contentWindow,
      iframe.contentWindow,
    );

    bridge.connect(transport).then(() => {
      iframe.src = `/api/ui/resource?uri=${encodeURIComponent(resourceUri)}`;
    }).catch(() => {
      setStatus("error");
    });
  }, [resourceUri, mockData, resultToMcpContent]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe) {
      setupBridge();
    }

    return () => {
      if (bridgeRef.current) {
        bridgeRef.current.close().catch(() => {});
        bridgeRef.current = null;
      }
    };
  }, [setupBridge]);

  return (
    <div class="relative w-full h-full rounded-xl overflow-hidden bg-[#0a0a0c] border border-white/[0.06]">
      {status === "loading" && (
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="w-5 h-5 rounded-full border-2 border-white/10 border-t-pml-accent animate-spin" />
        </div>
      )}

      {status === "error" && (
        <div class="absolute inset-0 flex items-center justify-center text-[0.7rem] text-stone-600">
          Unavailable
        </div>
      )}

      <iframe
        ref={iframeRef}
        title="MCP UI"
        class="w-full h-full border-none bg-transparent transition-opacity duration-300"
        style={{ opacity: status === "connected" ? 1 : 0 }}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
