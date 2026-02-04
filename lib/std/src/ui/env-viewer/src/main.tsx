/**
 * Environment Variables Viewer UI for MCP Apps
 *
 * Interactive environment variables viewer using React + Park UI (Panda CSS).
 * Features:
 * - Sortable table display
 * - Sensitive value masking with reveal toggle
 * - Search/filter functionality
 * - Grouping by prefix (AWS_, NODE_, etc.)
 * - Copy to clipboard
 *
 * @module lib/std/src/ui/env-viewer
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, VStack } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { IconButton } from "../../components/ui/icon-button";
import { Input } from "../../components/ui/input";
import * as Checkbox from "../../components/ui/checkbox";
import * as Table from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Code } from "../../components/ui/code";
import "../../global.css";

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
  "PASSWORD", "SECRET", "KEY", "TOKEN", "PRIVATE", "CREDENTIAL",
  "AUTH", "API_KEY", "APIKEY", "ACCESS_KEY", "ACCESSKEY",
];

// ============================================================================
// Prefix Detection
// ============================================================================

const COMMON_PREFIXES = [
  "AWS_", "AZURE_", "GCP_", "GOOGLE_", "NODE_", "NPM_", "PATH", "HOME", "USER",
  "SHELL", "LANG", "LC_", "XDG_", "DENO_", "BUN_", "DOCKER_", "K8S_", "KUBERNETES_",
  "CI_", "GITHUB_", "GITLAB_", "TRAVIS_", "CIRCLE_", "JENKINS_", "DATABASE_", "DB_",
  "REDIS_", "MONGO_", "POSTGRES_", "MYSQL_", "PG_", "SMTP_", "MAIL_", "EMAIL_",
  "S3_", "SQS_", "SNS_", "LOG_", "DEBUG", "VERBOSE", "SSL_", "TLS_", "HTTP_",
  "HTTPS_", "PROXY_", "NO_PROXY", "SSH_", "GPG_", "GIT_", "EDITOR", "VISUAL",
  "TERM", "DISPLAY", "HOSTNAME", "PWD", "OLDPWD", "SHLVL", "TMPDIR", "TEMP", "TMP",
];

function detectPrefix(key: string): string {
  if (["PATH", "HOME", "USER", "SHELL", "TERM", "EDITOR", "VISUAL", "DISPLAY", "HOSTNAME", "PWD", "OLDPWD", "SHLVL", "TMPDIR", "TEMP", "TMP", "DEBUG", "VERBOSE"].includes(key)) {
    return key;
  }
  for (const prefix of COMMON_PREFIXES) {
    if (key.startsWith(prefix)) {
      return prefix.endsWith("_") ? prefix.slice(0, -1) : prefix;
    }
  }
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
    folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
    "folder-open": "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1M2 10l.67 9h18.66l.67-9H2z",
    "chevron-down": "M6 9l6 6 6-6",
    "chevron-right": "M9 18l6-6-6-6",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name] || icons["folder"]} />
    </svg>
  );
}

// ============================================================================
// Components
// ============================================================================

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      notifyModel("copy", { key: label || text });
    } catch {
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
    <IconButton
      variant="ghost"
      size="xs"
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy to clipboard"}
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
      className={css({ opacity: 0.5, _hover: { opacity: 1 } })}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
    </IconButton>
  );
}

function RevealButton({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <IconButton
      variant="ghost"
      size="xs"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={revealed ? "Hide value" : "Reveal value"}
      aria-label={revealed ? "Hide value" : "Reveal value"}
      className={css({
        color: "orange.600",
        opacity: 0.7,
        _hover: { opacity: 1, bg: "orange.50" },
        _dark: { color: "orange.400", _hover: { bg: "orange.950" } },
      })}
    >
      <Icon name={revealed ? "eye" : "eye-off"} size={14} />
    </IconButton>
  );
}

function MaskedValue({ value, revealed }: { value: string; revealed: boolean }) {
  if (revealed) {
    return <Code fontSize="sm" title={value} className={css({ wordBreak: "break-all" })}>{value}</Code>;
  }
  const maskedLength = Math.min(value.length, 20);
  const masked = "*".repeat(maskedLength);

  return (
    <Code fontSize="sm" title="Value hidden" className={css({ fontStyle: "italic", letterSpacing: "0.1em", color: "fg.muted" })}>
      {masked}
      {value.length > 20 && <Box as="span" ml="1" color="fg.subtle" fontSize="xs" fontStyle="normal" letterSpacing="normal">({value.length} chars)</Box>}
    </Code>
  );
}

function SortIndicator({ column, sortColumn, sortDirection }: { column: SortColumn; sortColumn: SortColumn; sortDirection: SortDirection }) {
  if (column !== sortColumn) {
    return <Box as="span" ml="1" opacity={0.3} fontSize="xs">&#8645;</Box>;
  }
  return <Box as="span" ml="1" fontSize="xs">{sortDirection === "asc" ? "\u25B2" : "\u25BC"}</Box>;
}

function EnvRow({ entry, revealed, onToggleReveal }: { entry: EnvEntry; revealed: boolean; onToggleReveal: () => void }) {
  return (
    <Table.Row className={css({ _hover: { bg: "bg.subtle" } })}>
      <Table.Cell p="3" verticalAlign="top" w="35%" minW="180px">
        <Flex alignItems="center" gap="1.5">
          <Code fontSize="sm" fontWeight="medium" className={css({ wordBreak: "break-all" })}>{entry.key}</Code>
          {entry.isSensitive && (
            <Box color={{ base: "orange.600", _dark: "orange.400" }} flexShrink={0} title="Sensitive value">
              <Icon name="lock" size={12} />
            </Box>
          )}
          <CopyButton text={entry.key} label={entry.key} />
        </Flex>
      </Table.Cell>
      <Table.Cell p="3" verticalAlign="top">
        <Flex alignItems="flex-start" gap="2">
          {entry.isSensitive ? (
            <>
              <MaskedValue value={entry.value} revealed={revealed} />
              <RevealButton revealed={revealed} onToggle={onToggleReveal} />
            </>
          ) : (
            <Code fontSize="sm" className={css({ wordBreak: "break-all", maxW: "400px" })} title={entry.value}>
              {entry.value}
            </Code>
          )}
          <CopyButton text={entry.value} label={`${entry.key} value`} />
        </Flex>
      </Table.Cell>
    </Table.Row>
  );
}

function GroupSection({
  prefix, entries, isExpanded, onToggle, revealedKeys, onToggleReveal,
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
    <Box border="1px solid" borderColor="border.default" rounded="lg" overflow="hidden">
      <Button
        variant="ghost"
        className={css({
          display: "flex", alignItems: "center", gap: "2", w: "full", p: "3",
          bg: "bg.subtle", textAlign: "left", color: "fg.default", fontSize: "sm",
          fontWeight: "medium", rounded: "0", justifyContent: "flex-start",
          _hover: { bg: "bg.muted" },
        })}
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={`group-${prefix}`}
      >
        <Box color="fg.muted" flexShrink={0}>
          <Icon name={isExpanded ? "folder-open" : "folder"} size={16} />
        </Box>
        <Box flex={1} fontFamily="mono">{prefix}</Box>
        <Badge variant="subtle">{entries.length}</Badge>
        {sensitiveCount > 0 && (
          <Badge colorPalette="orange" variant="subtle" title={`${sensitiveCount} sensitive`}>
            <Icon name="shield" size={12} /> {sensitiveCount}
          </Badge>
        )}
        <Box color="fg.muted" flexShrink={0}>
          <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={16} />
        </Box>
      </Button>
      {isExpanded && (
        <Box id={`group-${prefix}`}>
          <Table.Root size="sm" variant="outline">
            <Table.Head className={css({ srOnly: true })}>
              <Table.Row>
                <Table.Header>Variable Name</Table.Header>
                <Table.Header>Value</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {entries.map((entry) => (
                <EnvRow
                  key={entry.key}
                  entry={entry}
                  revealed={revealedKeys.has(entry.key)}
                  onToggleReveal={() => onToggleReveal(entry.key)}
                />
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Box>
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
        if (!textContent?.text) { setData(null); return; }
        const parsed = JSON.parse(textContent.text);
        const normalized = normalizeData(parsed);
        setData(normalized);
        if (normalized.groupByPrefix !== undefined) setGroupByPrefix(normalized.groupByPrefix);
        const entries = processEntries(normalized);
        const groups = new Set(entries.map((e) => e.prefix));
        setExpandedGroups(groups);
      } catch (e) {
        setError(`Failed to parse data: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const sensitivePatterns = useMemo(() => {
    const custom = data?.sensitiveKeys || [];
    return [...DEFAULT_SENSITIVE_PATTERNS, ...custom];
  }, [data?.sensitiveKeys]);

  const entries = useMemo(() => {
    if (!data?.env) return [];
    return processEntries(data, sensitivePatterns);
  }, [data, sensitivePatterns]);

  const filteredEntries = useMemo(() => {
    if (!filterText) return entries;
    const search = filterText.toLowerCase();
    return entries.filter((e) =>
      e.key.toLowerCase().includes(search) ||
      e.value.toLowerCase().includes(search) ||
      e.prefix.toLowerCase().includes(search)
    );
  }, [entries, filterText]);

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      let cmp: number;
      if (sortColumn === "key") cmp = a.key.localeCompare(b.key);
      else if (sortColumn === "value") cmp = a.value.localeCompare(b.value);
      else cmp = a.prefix.localeCompare(b.prefix) || a.key.localeCompare(b.key);
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [filteredEntries, sortColumn, sortDirection]);

  const groupedEntries = useMemo(() => {
    if (!groupByPrefix) return null;
    const groups = new Map<string, EnvEntry[]>();
    for (const entry of sortedEntries) {
      if (!groups.has(entry.prefix)) groups.set(entry.prefix, []);
      groups.get(entry.prefix)!.push(entry);
    }
    return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [sortedEntries, groupByPrefix]);

  const stats = useMemo(() => {
    const total = entries.length;
    const sensitive = entries.filter((e) => e.isSensitive).length;
    const filtered = filteredEntries.length;
    return { total, sensitive, filtered };
  }, [entries, filteredEntries]);

  const handleFilter = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setFilterText(value);
    if (value) notifyModel("filter", { text: value });
  }, []);

  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortColumn(column); setSortDirection("asc"); }
    notifyModel("sort", { column, direction: sortDirection });
  }, [sortColumn, sortDirection]);

  const toggleReveal = useCallback((key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); notifyModel("hide", { key }); }
      else { next.add(key); notifyModel("reveal", { key }); }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((prefix: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
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
    if (groupedEntries) setExpandedGroups(new Set(groupedEntries.keys()));
  }, [groupedEntries]);

  const collapseAllGroups = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  if (loading) {
    return (
      <Box p="4" maxW="100%" overflow="hidden" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas">
        <Flex alignItems="center" justifyContent="center" p="10" color="fg.muted">Loading environment variables...</Flex>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="4" maxW="100%" overflow="hidden" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas">
        <Box p="4" bg={{ base: "red.50", _dark: "red.950" }} color={{ base: "red.700", _dark: "red.300" }} rounded="md">{error}</Box>
      </Box>
    );
  }

  if (!data || Object.keys(data.env).length === 0) {
    return (
      <Box p="4" maxW="100%" overflow="hidden" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas">
        <Box textAlign="center" p="10" color="fg.muted">No environment variables to display</Box>
      </Box>
    );
  }

  return (
    <Box p="4" maxW="100%" overflow="hidden" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas">
      {/* Toolbar */}
      <Flex gap="3" mb="3" alignItems="center" flexWrap="wrap">
        <Box flex={1} minW="200px" position="relative">
          <Box position="absolute" left="3" top="50%" transform="translateY(-50%)" color="fg.muted" pointerEvents="none" zIndex={1}>
            <Icon name="search" size={16} />
          </Box>
          <Input
            type="text"
            placeholder="Filter variables..."
            value={filterText}
            onChange={handleFilter}
            aria-label="Filter environment variables"
            size="sm"
            className={css({ pl: "10" })}
          />
        </Box>
        <Flex gap="2" alignItems="center" flexWrap="wrap">
          <Checkbox.Root
            checked={groupByPrefix}
            onCheckedChange={(e) => setGroupByPrefix(!!e.checked)}
            className={css({ display: "flex", alignItems: "center", gap: "1.5", cursor: "pointer" })}
          >
            <Checkbox.Control className={css({ w: "4", h: "4" })}>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Label className={css({ fontSize: "xs", color: "fg.default", userSelect: "none" })}>
              Group by prefix
            </Checkbox.Label>
            <Checkbox.HiddenInput />
          </Checkbox.Root>
          {groupByPrefix && (
            <>
              <Button variant="outline" size="xs" onClick={expandAllGroups} title="Expand all groups">Expand</Button>
              <Button variant="outline" size="xs" onClick={collapseAllGroups} title="Collapse all groups">Collapse</Button>
            </>
          )}
          <Button variant="outline" size="xs" onClick={revealAll} title="Reveal all sensitive values">Reveal All</Button>
          <Button variant="outline" size="xs" onClick={hideAll} title="Hide all sensitive values">Hide All</Button>
        </Flex>
      </Flex>

      {/* Stats */}
      <Flex gap="3" mb="3" alignItems="center" fontSize="xs" color="fg.muted">
        <Box whiteSpace="nowrap">
          {stats.filtered} variable{stats.filtered !== 1 ? "s" : ""}
          {filterText && ` (filtered from ${stats.total})`}
        </Box>
        {stats.sensitive > 0 && (
          <Badge colorPalette="orange" variant="subtle">
            <Icon name="shield" size={12} /> {stats.sensitive} sensitive
          </Badge>
        )}
      </Flex>

      {/* Content */}
      {groupByPrefix && groupedEntries ? (
        <VStack gap="2" alignItems="stretch">
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
        </VStack>
      ) : (
        <Box overflowX="auto" rounded="lg">
          <Table.Root size="sm" variant="outline">
            <Table.Head>
              <Table.Row>
                <Table.Header
                  p="3"
                  cursor="pointer"
                  userSelect="none"
                  onClick={() => handleSort("key")}
                  className={css({ _hover: { bg: "bg.muted" } })}
                >
                  Variable
                  <SortIndicator column="key" sortColumn={sortColumn} sortDirection={sortDirection} />
                </Table.Header>
                <Table.Header
                  p="3"
                  cursor="pointer"
                  userSelect="none"
                  onClick={() => handleSort("value")}
                  className={css({ _hover: { bg: "bg.muted" } })}
                >
                  Value
                  <SortIndicator column="value" sortColumn={sortColumn} sortDirection={sortDirection} />
                </Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {sortedEntries.map((entry) => (
                <EnvRow
                  key={entry.key}
                  entry={entry}
                  revealed={revealedKeys.has(entry.key)}
                  onToggleReveal={() => toggleReveal(entry.key)}
                />
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeData(parsed: unknown): EnvData {
  if (parsed && typeof parsed === "object" && "env" in parsed) {
    const data = parsed as EnvData;
    return { env: data.env || {}, sensitiveKeys: data.sensitiveKeys, groupByPrefix: data.groupByPrefix };
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return { env: parsed as Record<string, string> };
  }
  if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
    const env: Record<string, string> = {};
    for (const [key, value] of parsed) {
      env[String(key)] = String(value);
    }
    return { env };
  }
  return { env: {} };
}

function processEntries(data: EnvData, sensitivePatterns: string[] = DEFAULT_SENSITIVE_PATTERNS): EnvEntry[] {
  const entries: EnvEntry[] = [];
  for (const [key, value] of Object.entries(data.env)) {
    const upperKey = key.toUpperCase();
    const isSensitive = sensitivePatterns.some((pattern) => upperKey.includes(pattern.toUpperCase()));
    const prefix = detectPrefix(key);
    entries.push({ key, value: String(value), isSensitive, prefix });
  }
  return entries;
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<EnvViewer />);
