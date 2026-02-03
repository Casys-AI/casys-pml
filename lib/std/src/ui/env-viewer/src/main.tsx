/**
 * Environment Variables Viewer UI for MCP Apps
 *
 * Interactive environment variables viewer using Preact + Park UI (Panda CSS).
 * Features:
 * - Sortable table display
 * - Sensitive value masking with reveal toggle
 * - Search/filter functionality
 * - Grouping by prefix (AWS_, NODE_, etc.)
 * - Copy to clipboard
 *
 * @module lib/std/src/ui/env-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface EnvData {
  env: Record<string, string>;
  sensitiveKeys?: string[];
  groupByPrefix?: boolean;
}

interface ContentItem {
  type: string;
  text?: string;
}

interface EnvEntry {
  key: string;
  value: string;
  isSensitive: boolean;
  prefix: string;
}

type SortDirection = "asc" | "desc";
type SortColumn = "key" | "value" | "prefix";

// ============================================================================
// Default Sensitive Patterns
// ============================================================================

const DEFAULT_SENSITIVE_PATTERNS = [
  "PASSWORD",
  "SECRET",
  "KEY",
  "TOKEN",
  "PRIVATE",
  "CREDENTIAL",
  "AUTH",
  "API_KEY",
  "APIKEY",
  "ACCESS_KEY",
  "ACCESSKEY",
];

// ============================================================================
// Prefix Detection
// ============================================================================

const COMMON_PREFIXES = [
  "AWS_",
  "AZURE_",
  "GCP_",
  "GOOGLE_",
  "NODE_",
  "NPM_",
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "LANG",
  "LC_",
  "XDG_",
  "DENO_",
  "BUN_",
  "DOCKER_",
  "K8S_",
  "KUBERNETES_",
  "CI_",
  "GITHUB_",
  "GITLAB_",
  "TRAVIS_",
  "CIRCLE_",
  "JENKINS_",
  "DATABASE_",
  "DB_",
  "REDIS_",
  "MONGO_",
  "POSTGRES_",
  "MYSQL_",
  "PG_",
  "SMTP_",
  "MAIL_",
  "EMAIL_",
  "S3_",
  "SQS_",
  "SNS_",
  "LOG_",
  "DEBUG",
  "VERBOSE",
  "SSL_",
  "TLS_",
  "HTTP_",
  "HTTPS_",
  "PROXY_",
  "NO_PROXY",
  "SSH_",
  "GPG_",
  "GIT_",
  "EDITOR",
  "VISUAL",
  "TERM",
  "DISPLAY",
  "HOSTNAME",
  "PWD",
  "OLDPWD",
  "SHLVL",
  "TMPDIR",
  "TEMP",
  "TMP",
];

function detectPrefix(key: string): string {
  // Check exact matches first
  if (["PATH", "HOME", "USER", "SHELL", "TERM", "EDITOR", "VISUAL", "DISPLAY", "HOSTNAME", "PWD", "OLDPWD", "SHLVL", "TMPDIR", "TEMP", "TMP", "DEBUG", "VERBOSE"].includes(key)) {
    return key;
  }

  // Check prefixes
  for (const prefix of COMMON_PREFIXES) {
    if (key.startsWith(prefix)) {
      // Return prefix without trailing underscore for grouping
      return prefix.endsWith("_") ? prefix.slice(0, -1) : prefix;
    }
  }

  // Try to detect custom prefix (first segment before underscore)
  const underscoreIdx = key.indexOf("_");
  if (underscoreIdx > 1 && underscoreIdx < key.length - 1) {
    return key.slice(0, underscoreIdx);
  }

  return "OTHER";
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Environment Variables Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Icon Components
// ============================================================================

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const icons: Record<string, string> = {
    copy: "M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    check: "M20 6L9 17l-5-5",
    search: "M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    "eye-off": "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22",
    "sort-asc": "M12 5v14M5 12l7-7 7 7",
    "sort-desc": "M12 19V5M5 12l7 7 7-7",
    folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
    "folder-open": "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1M2 10l.67 9h18.66l.67-9H2z",
    "chevron-down": "M6 9l6 6 6-6",
    "chevron-right": "M9 18l6-6-6-6",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
  };

  const path = icons[name] || icons["folder"];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

// ============================================================================
// Components
// ============================================================================

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: Event) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      notifyModel("copy", { key: label || text });
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text, label]);

  return (
    <button
      class={styles.copyBtn}
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy to clipboard"}
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
    </button>
  );
}

function RevealButton({
  revealed,
  onToggle,
}: {
  revealed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      class={styles.revealBtn}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={revealed ? "Hide value" : "Reveal value"}
      aria-label={revealed ? "Hide value" : "Reveal value"}
    >
      <Icon name={revealed ? "eye" : "eye-off"} size={14} />
    </button>
  );
}

function MaskedValue({ value, revealed }: { value: string; revealed: boolean }) {
  if (revealed) {
    return (
      <code class={styles.valueCode} title={value}>
        {value}
      </code>
    );
  }

  // Mask the value with asterisks, showing length hint
  const maskedLength = Math.min(value.length, 20);
  const masked = "*".repeat(maskedLength);

  return (
    <code class={css(styles.valueCode, styles.maskedValue)} title="Value hidden">
      {masked}
      {value.length > 20 && <span class={styles.lengthHint}>({value.length} chars)</span>}
    </code>
  );
}

function SortIndicator({ column, sortColumn, sortDirection }: {
  column: SortColumn;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
}) {
  if (column !== sortColumn) {
    return <span class={styles.sortIndicatorInactive}>&#8645;</span>;
  }
  return (
    <span class={styles.sortIndicatorActive}>
      {sortDirection === "asc" ? "\u25B2" : "\u25BC"}
    </span>
  );
}

function EnvRow({
  entry,
  revealed,
  onToggleReveal,
}: {
  entry: EnvEntry;
  revealed: boolean;
  onToggleReveal: () => void;
}) {
  return (
    <tr class={styles.row}>
      <td class={styles.keyCell}>
        <div class={styles.keyWrapper}>
          <code class={styles.keyCode}>{entry.key}</code>
          {entry.isSensitive && (
            <span class={styles.sensitiveIcon} title="Sensitive value">
              <Icon name="lock" size={12} />
            </span>
          )}
          <CopyButton text={entry.key} label={entry.key} />
        </div>
      </td>
      <td class={styles.valueCell}>
        <div class={styles.valueWrapper}>
          {entry.isSensitive ? (
            <>
              <MaskedValue value={entry.value} revealed={revealed} />
              <RevealButton revealed={revealed} onToggle={onToggleReveal} />
            </>
          ) : (
            <code class={styles.valueCode} title={entry.value}>
              {entry.value}
            </code>
          )}
          <CopyButton text={entry.value} label={`${entry.key} value`} />
        </div>
      </td>
    </tr>
  );
}

function GroupSection({
  prefix,
  entries,
  isExpanded,
  onToggle,
  revealedKeys,
  onToggleReveal,
}: {
  prefix: string;
  entries: EnvEntry[];
  isExpanded: boolean;
  onToggle: () => void;
  revealedKeys: Set<string>;
  onToggleReveal: (key: string) => void;
}) {
  const sensitiveCount = entries.filter((e) => e.isSensitive).length;

  return (
    <div class={styles.groupSection}>
      <button
        class={styles.groupHeader}
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={`group-${prefix}`}
      >
        <span class={styles.groupIcon}>
          <Icon name={isExpanded ? "folder-open" : "folder"} size={16} />
        </span>
        <span class={styles.groupTitle}>{prefix}</span>
        <span class={styles.groupCount}>{entries.length}</span>
        {sensitiveCount > 0 && (
          <span class={styles.groupSensitive} title={`${sensitiveCount} sensitive`}>
            <Icon name="shield" size={12} />
            {sensitiveCount}
          </span>
        )}
        <span class={styles.chevron}>
          <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={16} />
        </span>
      </button>
      {isExpanded && (
        <div id={`group-${prefix}`} class={styles.groupContent}>
          <table class={styles.table}>
            <thead class={styles.srOnly}>
              <tr>
                <th>Variable Name</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <EnvRow
                  key={entry.key}
                  entry={entry}
                  revealed={revealedKeys.has(entry.key)}
                  onToggleReveal={() => onToggleReveal(entry.key)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function EnvViewer() {
  const [data, setData] = useState<EnvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("key");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupByPrefix, setGroupByPrefix] = useState(true);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[env-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[env-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[]; isError?: boolean }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }

        const parsed = JSON.parse(textContent.text);
        const normalized = normalizeData(parsed);
        setData(normalized);

        // Apply groupByPrefix setting from data
        if (normalized.groupByPrefix !== undefined) {
          setGroupByPrefix(normalized.groupByPrefix);
        }

        // Expand all groups by default
        const entries = processEntries(normalized);
        const groups = new Set(entries.map((e) => e.prefix));
        setExpandedGroups(groups);
      } catch (e) {
        setError(`Failed to parse data: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => {
      setLoading(true);
    };
  }, []);

  // Sensitive patterns (merge defaults with custom)
  const sensitivePatterns = useMemo(() => {
    const custom = data?.sensitiveKeys || [];
    return [...DEFAULT_SENSITIVE_PATTERNS, ...custom];
  }, [data?.sensitiveKeys]);

  // Process entries
  const entries = useMemo(() => {
    if (!data?.env) return [];
    return processEntries(data, sensitivePatterns);
  }, [data, sensitivePatterns]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (!filterText) return entries;
    const search = filterText.toLowerCase();
    return entries.filter(
      (e) =>
        e.key.toLowerCase().includes(search) ||
        e.value.toLowerCase().includes(search) ||
        e.prefix.toLowerCase().includes(search)
    );
  }, [entries, filterText]);

  // Sort entries
  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      let cmp: number;
      if (sortColumn === "key") {
        cmp = a.key.localeCompare(b.key);
      } else if (sortColumn === "value") {
        cmp = a.value.localeCompare(b.value);
      } else {
        cmp = a.prefix.localeCompare(b.prefix) || a.key.localeCompare(b.key);
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [filteredEntries, sortColumn, sortDirection]);

  // Group by prefix
  const groupedEntries = useMemo(() => {
    if (!groupByPrefix) return null;

    const groups = new Map<string, EnvEntry[]>();
    for (const entry of sortedEntries) {
      if (!groups.has(entry.prefix)) {
        groups.set(entry.prefix, []);
      }
      groups.get(entry.prefix)!.push(entry);
    }

    // Sort groups alphabetically
    return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [sortedEntries, groupByPrefix]);

  // Statistics
  const stats = useMemo(() => {
    const total = entries.length;
    const sensitive = entries.filter((e) => e.isSensitive).length;
    const filtered = filteredEntries.length;
    return { total, sensitive, filtered };
  }, [entries, filteredEntries]);

  // Handlers
  const handleFilter = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setFilterText(value);
    if (value) notifyModel("filter", { text: value });
  }, []);

  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
    notifyModel("sort", { column, direction: sortDirection });
  }, [sortColumn, sortDirection]);

  const toggleReveal = useCallback((key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        notifyModel("hide", { key });
      } else {
        next.add(key);
        notifyModel("reveal", { key });
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((prefix: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) {
        next.delete(prefix);
      } else {
        next.add(prefix);
      }
      return next;
    });
  }, []);

  const revealAll = useCallback(() => {
    const sensitiveKeys = entries.filter((e) => e.isSensitive).map((e) => e.key);
    setRevealedKeys(new Set(sensitiveKeys));
    notifyModel("reveal_all", { count: sensitiveKeys.length });
  }, [entries]);

  const hideAll = useCallback(() => {
    setRevealedKeys(new Set());
    notifyModel("hide_all", {});
  }, []);

  const expandAllGroups = useCallback(() => {
    if (groupedEntries) {
      setExpandedGroups(new Set(groupedEntries.keys()));
    }
  }, [groupedEntries]);

  const collapseAllGroups = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  // Render states
  if (loading) {
    return (
      <div class={styles.container}>
        <div class={styles.loading}>Loading environment variables...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div class={styles.container}>
        <div class={styles.error}>{error}</div>
      </div>
    );
  }

  if (!data || Object.keys(data.env).length === 0) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No environment variables to display</div>
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Toolbar */}
      <div class={styles.toolbar}>
        <div class={styles.searchWrapper}>
          <span class={styles.searchIcon}>
            <Icon name="search" size={16} />
          </span>
          <input
            type="text"
            placeholder="Filter variables..."
            value={filterText}
            onInput={handleFilter}
            class={styles.searchInput}
            aria-label="Filter environment variables"
          />
        </div>
        <div class={styles.toolbarActions}>
          <label class={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={groupByPrefix}
              onChange={(e) => setGroupByPrefix((e.target as HTMLInputElement).checked)}
              class={styles.checkbox}
            />
            Group by prefix
          </label>
          {groupByPrefix && (
            <>
              <button class={styles.toolbarBtn} onClick={expandAllGroups} title="Expand all groups">
                Expand
              </button>
              <button class={styles.toolbarBtn} onClick={collapseAllGroups} title="Collapse all groups">
                Collapse
              </button>
            </>
          )}
          <button class={styles.toolbarBtn} onClick={revealAll} title="Reveal all sensitive values">
            Reveal All
          </button>
          <button class={styles.toolbarBtn} onClick={hideAll} title="Hide all sensitive values">
            Hide All
          </button>
        </div>
      </div>

      {/* Stats */}
      <div class={styles.statsBar}>
        <span class={styles.stat}>
          {stats.filtered} variable{stats.filtered !== 1 ? "s" : ""}
          {filterText && ` (filtered from ${stats.total})`}
        </span>
        {stats.sensitive > 0 && (
          <span class={styles.statSensitive}>
            <Icon name="shield" size={12} />
            {stats.sensitive} sensitive
          </span>
        )}
      </div>

      {/* Content */}
      {groupByPrefix && groupedEntries ? (
        <div class={styles.groupsContainer}>
          {Array.from(groupedEntries.entries()).map(([prefix, groupEntries]) => (
            <GroupSection
              key={prefix}
              prefix={prefix}
              entries={groupEntries}
              isExpanded={expandedGroups.has(prefix)}
              onToggle={() => toggleGroup(prefix)}
              revealedKeys={revealedKeys}
              onToggleReveal={toggleReveal}
            />
          ))}
        </div>
      ) : (
        <div class={styles.tableContainer}>
          <table class={styles.table}>
            <thead>
              <tr>
                <th class={styles.th} onClick={() => handleSort("key")}>
                  Variable
                  <SortIndicator column="key" sortColumn={sortColumn} sortDirection={sortDirection} />
                </th>
                <th class={styles.th} onClick={() => handleSort("value")}>
                  Value
                  <SortIndicator column="value" sortColumn={sortColumn} sortDirection={sortDirection} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry) => (
                <EnvRow
                  key={entry.key}
                  entry={entry}
                  revealed={revealedKeys.has(entry.key)}
                  onToggleReveal={() => toggleReveal(entry.key)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Styles (Panda CSS)
// ============================================================================

const styles = {
  container: css({
    p: "4",
    maxW: "100%",
    overflow: "hidden",
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
  }),
  toolbar: css({
    display: "flex",
    gap: "3",
    mb: "3",
    alignItems: "center",
    flexWrap: "wrap",
  }),
  searchWrapper: css({
    flex: 1,
    minW: "200px",
    position: "relative",
  }),
  searchIcon: css({
    position: "absolute",
    left: "3",
    top: "50%",
    transform: "translateY(-50%)",
    color: "fg.muted",
    pointerEvents: "none",
  }),
  searchInput: css({
    w: "full",
    pl: "10",
    pr: "3",
    py: "2",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    color: "fg.default",
    fontSize: "sm",
    outline: "none",
    _focus: {
      borderColor: "border.accent",
      shadow: "0 0 0 3px token(colors.blue.500/20)",
    },
    _placeholder: { color: "fg.muted" },
  }),
  toolbarActions: css({
    display: "flex",
    gap: "2",
    alignItems: "center",
    flexWrap: "wrap",
  }),
  toolbarBtn: css({
    px: "3",
    py: "1.5",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    color: "fg.default",
    cursor: "pointer",
    fontSize: "xs",
    fontWeight: "medium",
    _hover: { bg: "bg.muted" },
  }),
  toggleLabel: css({
    display: "flex",
    alignItems: "center",
    gap: "1.5",
    fontSize: "xs",
    color: "fg.default",
    cursor: "pointer",
    userSelect: "none",
  }),
  checkbox: css({
    w: "4",
    h: "4",
    cursor: "pointer",
  }),
  statsBar: css({
    display: "flex",
    gap: "3",
    mb: "3",
    alignItems: "center",
    fontSize: "xs",
    color: "fg.muted",
  }),
  stat: css({
    whiteSpace: "nowrap",
  }),
  statSensitive: css({
    display: "flex",
    alignItems: "center",
    gap: "1",
    px: "2",
    py: "0.5",
    bg: "orange.100",
    color: "orange.800",
    rounded: "full",
    fontSize: "xs",
    _dark: { bg: "orange.900", color: "orange.200" },
  }),
  tableContainer: css({
    overflowX: "auto",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
  }),
  table: css({
    w: "full",
    borderCollapse: "collapse",
  }),
  th: css({
    p: "3",
    textAlign: "left",
    bg: "bg.subtle",
    fontWeight: "semibold",
    borderBottom: "1px solid",
    borderColor: "border.default",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    _hover: { bg: "bg.muted" },
  }),
  sortIndicatorInactive: css({
    ml: "1",
    opacity: 0.3,
    fontSize: "xs",
  }),
  sortIndicatorActive: css({
    ml: "1",
    fontSize: "xs",
  }),
  row: css({
    _hover: { bg: "bg.subtle" },
    _notLast: {
      borderBottom: "1px solid",
      borderColor: "border.subtle",
    },
  }),
  keyCell: css({
    p: "3",
    verticalAlign: "top",
    w: "35%",
    minW: "180px",
  }),
  keyWrapper: css({
    display: "flex",
    alignItems: "center",
    gap: "1.5",
  }),
  keyCode: css({
    fontFamily: "mono",
    fontSize: "sm",
    fontWeight: "medium",
    color: "fg.default",
    wordBreak: "break-all",
  }),
  sensitiveIcon: css({
    color: "orange.600",
    flexShrink: 0,
    _dark: { color: "orange.400" },
  }),
  valueCell: css({
    p: "3",
    verticalAlign: "top",
  }),
  valueWrapper: css({
    display: "flex",
    alignItems: "flex-start",
    gap: "2",
  }),
  valueCode: css({
    flex: 1,
    fontFamily: "mono",
    fontSize: "sm",
    color: "fg.muted",
    wordBreak: "break-all",
    whiteSpace: "pre-wrap",
    maxW: "400px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),
  maskedValue: css({
    color: "fg.muted",
    fontStyle: "italic",
    letterSpacing: "0.1em",
  }),
  lengthHint: css({
    ml: "1",
    color: "fg.subtle",
    fontSize: "xs",
    fontStyle: "normal",
    letterSpacing: "normal",
  }),
  copyBtn: css({
    flexShrink: 0,
    p: "1.5",
    border: "none",
    bg: "transparent",
    color: "fg.muted",
    cursor: "pointer",
    rounded: "sm",
    opacity: 0.5,
    transition: "opacity 0.15s",
    _hover: { opacity: 1, bg: "bg.subtle" },
  }),
  revealBtn: css({
    flexShrink: 0,
    p: "1.5",
    border: "none",
    bg: "transparent",
    color: "orange.600",
    cursor: "pointer",
    rounded: "sm",
    opacity: 0.7,
    transition: "opacity 0.15s",
    _hover: { opacity: 1, bg: "orange.50" },
    _dark: { color: "orange.400", _hover: { bg: "orange.950" } },
  }),
  groupsContainer: css({
    display: "flex",
    flexDirection: "column",
    gap: "2",
  }),
  groupSection: css({
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    overflow: "hidden",
  }),
  groupHeader: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    w: "full",
    p: "3",
    bg: "bg.subtle",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    color: "fg.default",
    fontSize: "sm",
    fontWeight: "medium",
    _hover: { bg: "bg.muted" },
  }),
  groupIcon: css({
    color: "fg.muted",
    flexShrink: 0,
  }),
  groupTitle: css({
    flex: 1,
    fontFamily: "mono",
  }),
  groupCount: css({
    px: "2",
    py: "0.5",
    bg: "gray.200",
    color: "gray.700",
    rounded: "full",
    fontSize: "xs",
    fontWeight: "medium",
    _dark: { bg: "gray.700", color: "gray.300" },
  }),
  groupSensitive: css({
    display: "flex",
    alignItems: "center",
    gap: "1",
    px: "2",
    py: "0.5",
    bg: "orange.100",
    color: "orange.800",
    rounded: "full",
    fontSize: "xs",
    fontWeight: "medium",
    _dark: { bg: "orange.900", color: "orange.200" },
  }),
  chevron: css({
    color: "fg.muted",
    flexShrink: 0,
  }),
  groupContent: css({
    borderTop: "1px solid",
    borderColor: "border.default",
  }),
  srOnly: css({
    position: "absolute",
    w: "1px",
    h: "1px",
    p: "0",
    m: "-1px",
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: "0",
  }),
  loading: css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    p: "10",
    color: "fg.muted",
  }),
  empty: css({
    textAlign: "center",
    p: "10",
    color: "fg.muted",
  }),
  error: css({
    p: "4",
    bg: "red.50",
    color: "red.700",
    rounded: "md",
    _dark: { bg: "red.950", color: "red.300" },
  }),
};

// ============================================================================
// Helpers
// ============================================================================

function normalizeData(parsed: unknown): EnvData {
  // If it's already in the expected format
  if (parsed && typeof parsed === "object" && "env" in parsed) {
    const data = parsed as EnvData;
    return {
      env: data.env || {},
      sensitiveKeys: data.sensitiveKeys,
      groupByPrefix: data.groupByPrefix,
    };
  }

  // Plain object of key-value pairs
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return {
      env: parsed as Record<string, string>,
    };
  }

  // Array of [key, value] pairs
  if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
    const env: Record<string, string> = {};
    for (const [key, value] of parsed) {
      env[String(key)] = String(value);
    }
    return { env };
  }

  return { env: {} };
}

function processEntries(
  data: EnvData,
  sensitivePatterns: string[] = DEFAULT_SENSITIVE_PATTERNS
): EnvEntry[] {
  const entries: EnvEntry[] = [];

  for (const [key, value] of Object.entries(data.env)) {
    const upperKey = key.toUpperCase();
    const isSensitive = sensitivePatterns.some((pattern) =>
      upperKey.includes(pattern.toUpperCase())
    );
    const prefix = detectPrefix(key);

    entries.push({
      key,
      value: String(value),
      isSensitive,
      prefix,
    });
  }

  return entries;
}

// ============================================================================
// Mount
// ============================================================================

render(<EnvViewer />, document.getElementById("app")!);
