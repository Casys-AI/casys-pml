/**
 * XML Viewer UI for MCP Apps
 *
 * Interactive XML tree viewer with:
 * - Collapsible nodes
 * - Syntax highlighting (tags, attributes, values, text, comments)
 * - Indentation with guide lines
 * - Search/filter functionality
 * - Expand All / Collapse All
 * - Copy to clipboard
 *
 * @module lib/std/src/ui/xml-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface XmlNode {
  type: "element" | "text" | "comment" | "cdata" | "processing-instruction";
  name?: string;
  attributes?: Record<string, string>;
  children?: XmlNode[];
  value?: string;
  path: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "XML Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// XML Parser
// ============================================================================

/**
 * Simple XML parser that builds a tree structure.
 * Handles elements, attributes, text nodes, comments, and CDATA.
 */
function parseXml(xmlString: string): XmlNode | null {
  const trimmed = xmlString.trim();
  if (!trimmed) return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, "application/xml");

    // Check for parse errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error(parseError.textContent || "XML parsing error");
    }

    return domNodeToXmlNode(doc.documentElement, "$");
  } catch (e) {
    throw new Error(`Failed to parse XML: ${e instanceof Error ? e.message : "Unknown error"}`);
  }
}

function domNodeToXmlNode(node: Node, path: string): XmlNode | null {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    const xmlNode: XmlNode = {
      type: "element",
      name: element.tagName,
      path,
      attributes: {},
      children: [],
    };

    // Extract attributes
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      xmlNode.attributes![attr.name] = attr.value;
    }

    // Extract children
    let childIndex = 0;
    for (let i = 0; i < element.childNodes.length; i++) {
      const childNode = element.childNodes[i];
      const childXml = domNodeToXmlNode(childNode, `${path}/${element.tagName}[${childIndex}]`);
      if (childXml) {
        xmlNode.children!.push(childXml);
        if (childXml.type === "element") {
          childIndex++;
        }
      }
    }

    return xmlNode;
  } else if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    if (!text) return null;
    return {
      type: "text",
      value: text,
      path: `${path}/#text`,
    };
  } else if (node.nodeType === Node.COMMENT_NODE) {
    return {
      type: "comment",
      value: node.textContent || "",
      path: `${path}/#comment`,
    };
  } else if (node.nodeType === Node.CDATA_SECTION_NODE) {
    return {
      type: "cdata",
      value: node.textContent || "",
      path: `${path}/#cdata`,
    };
  } else if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
    const pi = node as ProcessingInstruction;
    return {
      type: "processing-instruction",
      name: pi.target,
      value: pi.data,
      path: `${path}/#pi`,
    };
  }

  return null;
}

// ============================================================================
// XML Tree Node Component
// ============================================================================

function XmlTreeNode({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  searchTerm,
}: {
  node: XmlNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string, node: XmlNode) => void;
  searchTerm: string;
}) {
  const isExpanded = expanded.has(node.path);
  const hasChildren = node.children && node.children.length > 0;

  // Check if node matches search
  const matchesSearch = useMemo(() => {
    if (!searchTerm) return false;
    const term = searchTerm.toLowerCase();
    if (node.name?.toLowerCase().includes(term)) return true;
    if (node.value?.toLowerCase().includes(term)) return true;
    if (node.attributes) {
      for (const [key, value] of Object.entries(node.attributes)) {
        if (key.toLowerCase().includes(term) || value.toLowerCase().includes(term)) {
          return true;
        }
      }
    }
    return false;
  }, [node, searchTerm]);

  // Render different node types
  if (node.type === "text") {
    return (
      <div
        class={css({
          pl: `${depth * 20}px`,
          py: "1",
          fontFamily: "mono",
          fontSize: "sm",
          color: "fg.default",
          bg: matchesSearch ? "yellow.100" : "transparent",
          _dark: matchesSearch ? { bg: "yellow.900/30" } : {},
        })}
      >
        {node.value}
      </div>
    );
  }

  if (node.type === "comment") {
    return (
      <div
        class={css({
          pl: `${depth * 20}px`,
          py: "1",
          fontFamily: "mono",
          fontSize: "sm",
          color: "gray.500",
          fontStyle: "italic",
          bg: matchesSearch ? "yellow.100" : "transparent",
          _dark: matchesSearch ? { bg: "yellow.900/30" } : {},
        })}
      >
        {"<!-- "}{node.value}{" -->"}
      </div>
    );
  }

  if (node.type === "cdata") {
    return (
      <div
        class={css({
          pl: `${depth * 20}px`,
          py: "1",
          fontFamily: "mono",
          fontSize: "sm",
          color: "gray.600",
          bg: matchesSearch ? "yellow.100" : "transparent",
          _dark: { color: "gray.400" },
        })}
      >
        {"<![CDATA["}{node.value}{"]]>"}
      </div>
    );
  }

  if (node.type === "processing-instruction") {
    return (
      <div
        class={css({
          pl: `${depth * 20}px`,
          py: "1",
          fontFamily: "mono",
          fontSize: "sm",
          color: "gray.500",
        })}
      >
        {"<?"}{node.name} {node.value}{"?>"}
      </div>
    );
  }

  // Element node
  const hasOnlyTextChild = node.children?.length === 1 && node.children[0].type === "text";
  const isEmpty = !node.children || node.children.length === 0;

  return (
    <div class={css({ position: "relative" })}>
      {/* Indent guide line */}
      {depth > 0 && (
        <div
          class={css({
            position: "absolute",
            left: `${(depth - 1) * 20 + 8}px`,
            top: "0",
            bottom: "0",
            width: "1px",
            bg: "border.default",
            opacity: "0.3",
          })}
        />
      )}

      <div
        class={css({
          display: "flex",
          alignItems: "flex-start",
          gap: "0",
          py: "1",
          pl: `${depth * 20}px`,
          pr: "2",
          rounded: "sm",
          cursor: hasChildren && !hasOnlyTextChild ? "pointer" : "default",
          bg: matchesSearch ? "yellow.100" : "transparent",
          _hover: { bg: "bg.subtle" },
          _dark: matchesSearch ? { bg: "yellow.900/30" } : {},
          fontFamily: "mono",
          fontSize: "sm",
        })}
        onClick={() => {
          if (hasChildren && !hasOnlyTextChild) {
            onToggle(node.path);
          } else {
            onSelect(node.path, node);
          }
        }}
      >
        {/* Expand/collapse icon */}
        {hasChildren && !hasOnlyTextChild ? (
          <span
            class={css({
              w: "4",
              color: "fg.muted",
              fontSize: "xs",
              flexShrink: "0",
              userSelect: "none",
              mr: "1",
            })}
          >
            {isExpanded ? "v" : ">"}
          </span>
        ) : (
          <span class={css({ w: "4", flexShrink: "0", mr: "1" })} />
        )}

        {/* Opening tag */}
        <span class={styles.bracket}>{"<"}</span>
        <span class={styles.tagName}>{node.name}</span>

        {/* Attributes */}
        {node.attributes && Object.keys(node.attributes).length > 0 && (
          <>
            {Object.entries(node.attributes).map(([key, value]) => (
              <span key={key}>
                <span class={css({ color: "fg.default" })}> </span>
                <span class={styles.attrName}>{key}</span>
                <span class={styles.bracket}>=</span>
                <span class={styles.attrValue}>"{value}"</span>
              </span>
            ))}
          </>
        )}

        {/* Self-closing or with inline text */}
        {isEmpty ? (
          <>
            <span class={styles.bracket}>{" />"}</span>
          </>
        ) : hasOnlyTextChild ? (
          <>
            <span class={styles.bracket}>{">"}</span>
            <span class={css({ color: "fg.default" })}>{node.children![0].value}</span>
            <span class={styles.bracket}>{"</"}</span>
            <span class={styles.tagName}>{node.name}</span>
            <span class={styles.bracket}>{">"}</span>
          </>
        ) : (
          <>
            <span class={styles.bracket}>{">"}</span>
            {!isExpanded && (
              <span class={css({ color: "fg.muted", fontSize: "xs", ml: "1" })}>
                ({node.children!.length} children)
              </span>
            )}
          </>
        )}
      </div>

      {/* Children */}
      {hasChildren && !hasOnlyTextChild && isExpanded && (
        <>
          {node.children!.map((child, index) => (
            <XmlTreeNode
              key={`${child.path}-${index}`}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              searchTerm={searchTerm}
            />
          ))}

          {/* Closing tag */}
          <div
            class={css({
              pl: `${depth * 20 + 20}px`,
              py: "1",
              fontFamily: "mono",
              fontSize: "sm",
            })}
          >
            <span class={styles.bracket}>{"</"}</span>
            <span class={styles.tagName}>{node.name}</span>
            <span class={styles.bracket}>{">"}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function XmlViewer() {
  const [data, setData] = useState<XmlNode | null>(null);
  const [rawXml, setRawXml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["$"]));
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[xml-viewer] Connected to MCP host");
      })
      .catch(() => {
        console.log("[xml-viewer] No MCP host (standalone mode)");
        // Load demo data in standalone mode
        const demoXml = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="bk101" category="fiction">
    <author>Gambardella, Matthew</author>
    <title>XML Developer's Guide</title>
    <genre>Computer</genre>
    <price>44.95</price>
    <publish_date>2000-10-01</publish_date>
    <description>An in-depth look at creating applications with XML.</description>
  </book>
  <book id="bk102" category="fiction">
    <author>Ralls, Kim</author>
    <title>Midnight Rain</title>
    <genre>Fantasy</genre>
    <price>5.95</price>
    <publish_date>2000-12-16</publish_date>
    <description>A former architect battles corporate zombies.</description>
  </book>
  <!-- This is a comment -->
  <book id="bk103" category="non-fiction">
    <author>Corets, Eva</author>
    <title>Maeve Ascendant</title>
    <genre>Fantasy</genre>
    <price>5.95</price>
    <publish_date>2000-11-17</publish_date>
    <description>After the collapse of a nanotechnology society, young survivors rebuild.</description>
  </book>
  <metadata>
    <version>1.0</version>
    <last_updated>2026-02-03</last_updated>
    <status active="true" />
  </metadata>
</catalog>`;
        setRawXml(demoXml);
        try {
          const parsed = parseXml(demoXml);
          setData(parsed);
          setExpanded(new Set(["$"]));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
        setLoading(false);
      });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as
          | ContentItem
          | undefined;
        if (!textContent?.text) {
          setData(null);
          setRawXml("");
          return;
        }

        const text = textContent.text;
        setRawXml(text);
        const parsed = parseXml(text);
        setData(parsed);
        setExpanded(new Set(["$"]));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Handlers
  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSelect = useCallback((path: string, node: XmlNode) => {
    setSelectedPath(path);
    notifyModel("select", { path, node: { type: node.type, name: node.name, value: node.value } });
  }, []);

  const handleExpandAll = useCallback(() => {
    if (!data) return;
    const paths = collectPaths(data);
    setExpanded(new Set(paths));
  }, [data]);

  const handleCollapseAll = useCallback(() => {
    setExpanded(new Set(["$"]));
  }, []);

  const handleCopyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(rawXml).then(() => {
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus(null), 2000);
      notifyModel("copy", { content: "xml" });
    });
  }, [rawXml]);

  // Render
  if (loading) {
    return (
      <div class={styles.container}>
        <div class={styles.loading}>Loading XML...</div>
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

  if (!data) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No XML data</div>
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Toolbar */}
      <div class={styles.toolbar}>
        <input
          type="text"
          placeholder="Search tags, attributes, or values..."
          value={searchTerm}
          onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
          class={styles.searchInput}
        />
        <button class={styles.btn} onClick={handleExpandAll}>
          Expand All
        </button>
        <button class={styles.btn} onClick={handleCollapseAll}>
          Collapse
        </button>
        <button class={styles.btn} onClick={handleCopyToClipboard}>
          {copyStatus || "Copy"}
        </button>
      </div>

      {/* Selected path */}
      {selectedPath && (
        <div class={styles.pathBar}>
          <span class={css({ color: "fg.muted", fontSize: "xs" })}>Path:</span>
          <code class={css({ fontFamily: "mono", fontSize: "xs", color: "blue.600" })}>
            {selectedPath}
          </code>
        </div>
      )}

      {/* Tree */}
      <div class={styles.treeContainer}>
        <XmlTreeNode
          node={data}
          depth={0}
          expanded={expanded}
          onToggle={handleToggle}
          onSelect={handleSelect}
          searchTerm={searchTerm}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: css({
    p: "4",
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
    minH: "200px",
  }),
  toolbar: css({
    display: "flex",
    gap: "2",
    mb: "3",
    flexWrap: "wrap",
    alignItems: "center",
  }),
  searchInput: css({
    flex: 1,
    minW: "150px",
    p: "1.5",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    color: "fg.default",
    fontSize: "sm",
    outline: "none",
    _focus: { borderColor: "border.accent" },
  }),
  btn: css({
    px: "3",
    py: "1.5",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    color: "fg.default",
    fontSize: "xs",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
  }),
  pathBar: css({
    display: "flex",
    gap: "2",
    alignItems: "center",
    mb: "2",
    p: "2",
    bg: "bg.subtle",
    rounded: "md",
  }),
  treeContainer: css({
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    p: "3",
    bg: "bg.default",
    overflowX: "auto",
    fontFamily: "mono",
    fontSize: "sm",
  }),
  loading: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  empty: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  error: css({
    p: "4",
    bg: "red.50",
    color: "red.700",
    rounded: "md",
    _dark: { bg: "red.950", color: "red.300" },
  }),
  // XML syntax highlighting
  bracket: css({
    color: "fg.muted",
  }),
  tagName: css({
    color: "blue.600",
    fontWeight: "medium",
    _dark: { color: "blue.400" },
  }),
  attrName: css({
    color: "purple.600",
    _dark: { color: "purple.400" },
  }),
  attrValue: css({
    color: "green.600",
    _dark: { color: "green.400" },
  }),
};

// ============================================================================
// Helpers
// ============================================================================

function collectPaths(node: XmlNode): string[] {
  const paths = [node.path];
  if (node.children) {
    node.children.forEach((child) => paths.push(...collectPaths(child)));
  }
  return paths;
}

// ============================================================================
// Mount
// ============================================================================

render(<XmlViewer />, document.getElementById("app")!);
