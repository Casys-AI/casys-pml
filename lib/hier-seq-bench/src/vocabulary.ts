import type { Level, VocabNode } from "./types.ts";

/** Spec used to define nodes before building the full VocabNode map */
interface NodeSpec {
  level: Level;
  name: string;
  description: string;
  children?: Array<{ name: string; optional?: boolean }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain: data — data pipeline operations
// ─────────────────────────────────────────────────────────────────────────────
const DATA: NodeSpec[] = [
  // L0
  { level: 0, name: "read_file",        description: "Read data from a file" },
  { level: 0, name: "write_file",       description: "Write data to a file" },
  { level: 0, name: "parse_csv",        description: "Parse CSV input into records" },
  { level: 0, name: "validate_schema",  description: "Validate records against a schema" },
  { level: 0, name: "transform_record", description: "Apply field transformations to a record" },
  { level: 0, name: "filter_rows",      description: "Filter records matching a condition" },
  { level: 0, name: "sort_records",     description: "Sort records by one or more fields" },
  { level: 0, name: "deduplicate",      description: "Remove duplicate records from a dataset" },
  { level: 0, name: "compute_metrics",  description: "Compute aggregate statistics on records" },
  { level: 0, name: "merge_datasets",   description: "Merge two record sets into one" },

  // L1
  {
    level: 1, name: "file-io",
    description: "Read from and write to files",
    children: [{ name: "read_file" }, { name: "write_file" }],
  },
  {
    level: 1, name: "csv-ops",
    description: "Parse and validate CSV data",
    children: [{ name: "parse_csv" }, { name: "validate_schema", optional: true }],
  },
  {
    level: 1, name: "transform-ops",
    description: "Transform, filter and sort records",
    children: [{ name: "transform_record" }, { name: "filter_rows", optional: true }, { name: "sort_records", optional: true }],
  },
  {
    level: 1, name: "quality-ops",
    description: "Deduplicate and validate data quality",
    children: [{ name: "deduplicate" }, { name: "validate_schema" }],
  },

  // L2
  {
    level: 2, name: "data-ingestion",
    description: "Ingest and validate data from file sources",
    children: [{ name: "file-io" }, { name: "csv-ops" }, { name: "quality-ops", optional: true }],
  },
  {
    level: 2, name: "data-transformation",
    description: "Transform and prepare a dataset for downstream use",
    children: [{ name: "transform-ops" }, { name: "compute_metrics", optional: true }],
  },
  {
    level: 2, name: "data-export",
    description: "Export a processed dataset to file",
    children: [{ name: "transform-ops" }, { name: "file-io" }],
  },
  {
    level: 2, name: "dataset-merge",
    description: "Merge multiple datasets with deduplication",
    children: [{ name: "merge_datasets" }, { name: "quality-ops" }],
  },

  // L3
  {
    level: 3, name: "etl-pipeline",
    description: "Run a complete ETL pipeline: ingest, transform, and export data",
    children: [{ name: "data-ingestion" }, { name: "data-transformation" }, { name: "data-export" }],
  },
  {
    level: 3, name: "data-audit",
    description: "Audit a dataset for quality issues and produce a metrics report",
    children: [{ name: "data-ingestion" }, { name: "compute_metrics" }, { name: "validate_schema" }],
  },
  {
    level: 3, name: "dataset-consolidation",
    description: "Consolidate multiple datasets into a unified clean dataset",
    children: [{ name: "dataset-merge" }, { name: "data-transformation" }, { name: "data-export", optional: true }],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Domain: auth — authentication and session management
// ─────────────────────────────────────────────────────────────────────────────
const AUTH: NodeSpec[] = [
  // L0
  { level: 0, name: "check_token",          description: "Verify an authentication token" },
  { level: 0, name: "refresh_token",        description: "Refresh an expired authentication token" },
  { level: 0, name: "validate_permissions", description: "Check user permissions for a resource" },
  { level: 0, name: "log_access",           description: "Log an access event to the audit trail" },
  { level: 0, name: "create_session",       description: "Create a new user session" },
  { level: 0, name: "revoke_session",       description: "Revoke an active user session" },
  { level: 0, name: "fetch_user_profile",   description: "Fetch the authenticated user's profile" },
  { level: 0, name: "update_last_login",    description: "Update the last login timestamp for a user" },

  // L1
  {
    level: 1, name: "token-ops",
    description: "Verify and optionally refresh authentication tokens",
    children: [{ name: "check_token" }, { name: "refresh_token", optional: true }],
  },
  {
    level: 1, name: "session-ops",
    description: "Create a session and log the access event",
    children: [{ name: "create_session" }, { name: "log_access" }],
  },
  {
    level: 1, name: "permission-ops",
    description: "Validate permissions and log the access decision",
    children: [{ name: "validate_permissions" }, { name: "log_access" }],
  },

  // L2
  {
    level: 2, name: "auth-flow",
    description: "Full authentication flow: verify token, check permissions, open session",
    children: [{ name: "token-ops" }, { name: "permission-ops" }, { name: "session-ops" }],
  },
  {
    level: 2, name: "session-renewal",
    description: "Renew a session by refreshing the token and updating the login record",
    children: [{ name: "refresh_token" }, { name: "update_last_login" }, { name: "log_access" }],
  },
  {
    level: 2, name: "secure-access-check",
    description: "Verify token validity and user permissions before granting access",
    children: [{ name: "token-ops" }, { name: "validate_permissions" }],
  },

  // L3
  {
    level: 3, name: "full-auth-cycle",
    description: "Complete authentication cycle including profile fetch and session setup",
    children: [{ name: "auth-flow" }, { name: "fetch_user_profile" }, { name: "update_last_login" }],
  },
  {
    level: 3, name: "session-termination",
    description: "Securely terminate a user session with full audit trail",
    children: [{ name: "revoke_session" }, { name: "log_access" }, { name: "update_last_login" }],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Domain: notify — notifications and communication
// ─────────────────────────────────────────────────────────────────────────────
const NOTIFY: NodeSpec[] = [
  // L0
  { level: 0, name: "send_email",             description: "Send an email notification" },
  { level: 0, name: "send_sms",               description: "Send an SMS message" },
  { level: 0, name: "push_notification",      description: "Send a push notification to a device" },
  { level: 0, name: "log_notification",       description: "Log a notification delivery event" },
  { level: 0, name: "fetch_contact_info",     description: "Fetch recipient contact details" },
  { level: 0, name: "update_delivery_status", description: "Update the delivery status of a notification" },
  { level: 0, name: "render_template",        description: "Render a message template with dynamic data" },
  { level: 0, name: "track_open_rate",        description: "Record notification open and engagement metrics" },

  // L1
  {
    level: 1, name: "multi-channel",
    description: "Send a notification via email and optionally SMS",
    children: [{ name: "send_email" }, { name: "send_sms", optional: true }],
  },
  {
    level: 1, name: "notification-audit",
    description: "Log delivery and update notification status",
    children: [{ name: "log_notification" }, { name: "update_delivery_status" }],
  },
  {
    level: 1, name: "template-render",
    description: "Fetch contact info and render the notification template",
    children: [{ name: "fetch_contact_info" }, { name: "render_template" }],
  },

  // L2
  {
    level: 2, name: "contact-notification",
    description: "Notify a contact via multiple channels with delivery tracking",
    children: [{ name: "template-render" }, { name: "multi-channel" }, { name: "notification-audit" }],
  },
  {
    level: 2, name: "engagement-tracking",
    description: "Track notification delivery and engagement metrics",
    children: [{ name: "notification-audit" }, { name: "track_open_rate" }],
  },
  {
    level: 2, name: "push-campaign",
    description: "Send and track a push notification to a list of devices",
    children: [{ name: "fetch_contact_info" }, { name: "push_notification" }, { name: "notification-audit" }],
  },

  // L3
  {
    level: 3, name: "notification-campaign",
    description: "Run a complete notification campaign with delivery tracking and engagement metrics",
    children: [{ name: "contact-notification" }, { name: "engagement-tracking" }],
  },
  {
    level: 3, name: "transactional-notify",
    description: "Send a transactional notification (e.g. order confirmation) and verify delivery",
    children: [{ name: "contact-notification" }, { name: "update_delivery_status" }],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Domain: report — reporting and analytics
// ─────────────────────────────────────────────────────────────────────────────
const REPORT: NodeSpec[] = [
  // L0
  { level: 0, name: "query_db",        description: "Query the database for report data" },
  { level: 0, name: "aggregate_data",  description: "Aggregate query results into summary statistics" },
  { level: 0, name: "format_report",   description: "Format data into a structured report" },
  { level: 0, name: "render_pdf",      description: "Render a report as a PDF document" },
  { level: 0, name: "send_report",     description: "Send a completed report to its recipients" },
  { level: 0, name: "archive_report",  description: "Archive a report for future reference" },
  { level: 0, name: "calculate_kpis",  description: "Calculate key performance indicators from data" },
  { level: 0, name: "compare_periods", description: "Compare metrics across time periods" },

  // L1
  {
    level: 1, name: "data-query",
    description: "Query and aggregate database data for reporting",
    children: [{ name: "query_db" }, { name: "aggregate_data" }],
  },
  {
    level: 1, name: "report-render",
    description: "Format and optionally render a report as PDF",
    children: [{ name: "format_report" }, { name: "render_pdf", optional: true }],
  },
  {
    level: 1, name: "kpi-analysis",
    description: "Calculate KPIs and compare across time periods",
    children: [{ name: "calculate_kpis" }, { name: "compare_periods", optional: true }],
  },

  // L2
  {
    level: 2, name: "report-generation",
    description: "Generate a complete report from database query to formatted output",
    children: [{ name: "data-query" }, { name: "kpi-analysis" }, { name: "report-render" }],
  },
  {
    level: 2, name: "report-distribution",
    description: "Distribute and archive a finalized report",
    children: [{ name: "send_report" }, { name: "archive_report" }],
  },
  {
    level: 2, name: "analytics-snapshot",
    description: "Take a point-in-time analytics snapshot with KPI calculations",
    children: [{ name: "data-query" }, { name: "kpi-analysis" }],
  },

  // L3
  {
    level: 3, name: "scheduled-report",
    description: "Generate and distribute a scheduled report with full archival",
    children: [{ name: "report-generation" }, { name: "report-distribution" }],
  },
  {
    level: 3, name: "executive-dashboard",
    description: "Produce an executive dashboard: KPIs, period comparisons, PDF delivery",
    children: [{ name: "analytics-snapshot" }, { name: "report-render" }, { name: "report-distribution" }],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Cross-domain L4 scenarios
// Children reference other domains explicitly: "auth:full-auth-cycle"
// ─────────────────────────────────────────────────────────────────────────────
const CROSS: NodeSpec[] = [
  {
    level: 4, name: "customer-onboarding",
    description: "Onboard a new customer: authenticate, ingest profile data, send welcome notification",
    children: [
      { name: "auth:full-auth-cycle" },
      { name: "data:data-ingestion" },
      { name: "notify:transactional-notify" },
    ],
  },
  {
    level: 4, name: "monthly-reporting",
    description: "Generate and distribute the monthly business report with KPIs and stakeholder notification",
    children: [
      { name: "report:scheduled-report" },
      { name: "notify:notification-campaign" },
    ],
  },
  {
    level: 4, name: "data-migration",
    description: "Migrate a full dataset: authenticate, run ETL pipeline, notify on completion",
    children: [
      { name: "auth:secure-access-check" },
      { name: "data:etl-pipeline" },
      { name: "notify:transactional-notify" },
    ],
  },
  {
    level: 4, name: "account-deactivation",
    description: "Deactivate a user account: terminate session, audit data, notify the user",
    children: [
      { name: "auth:session-termination" },
      { name: "data:data-audit" },
      { name: "notify:contact-notification" },
    ],
  },
  {
    level: 4, name: "analytics-review",
    description: "Run a full analytics review: authenticate, produce executive report, distribute to stakeholders",
    children: [
      { name: "auth:secure-access-check" },
      { name: "report:executive-dashboard" },
      { name: "notify:contact-notification", optional: true },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Exported domain specs (used by grammar builder)
// ─────────────────────────────────────────────────────────────────────────────
export const DOMAIN_SPECS: Array<{ domain: string; specs: NodeSpec[] }> = [
  { domain: "data",   specs: DATA },
  { domain: "auth",   specs: AUTH },
  { domain: "notify", specs: NOTIFY },
  { domain: "report", specs: REPORT },
  { domain: "cross",  specs: CROSS },
];

// ─────────────────────────────────────────────────────────────────────────────
// Build the full VocabNode map from domain specs
// ─────────────────────────────────────────────────────────────────────────────
export function buildVocabulary(): Map<string, VocabNode> {
  const nodes = new Map<string, VocabNode>();

  // First pass: create nodes
  for (const { domain, specs } of DOMAIN_SPECS) {
    for (const spec of specs) {
      const id = `${domain}:${spec.name}`;
      const childIds = (spec.children ?? []).map(c =>
        c.name.includes(":") ? c.name : `${domain}:${c.name}`
      );
      nodes.set(id, {
        id,
        level: spec.level,
        domain,
        name: spec.name,
        description: spec.description,
        childIds,
        parentIds: [],
      });
    }
  }

  // Second pass: fill parentIds
  for (const [, node] of nodes) {
    for (const childId of node.childIds) {
      const child = nodes.get(childId);
      if (child && !child.parentIds.includes(node.id)) {
        child.parentIds.push(node.id);
      }
    }
  }

  return nodes;
}
