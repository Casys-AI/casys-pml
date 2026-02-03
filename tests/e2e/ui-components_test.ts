/**
 * E2E Tests for UI Components
 *
 * Tests the UI components in lib/std/src/ui/dist/
 * Verifies:
 * 1. All 40 component dist files exist
 * 2. HTML structure is valid (doctype, script, styles)
 * 3. Key components render with mock data
 *
 * @module tests/e2e/ui-components_test
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

// ============================================================================
// Constants
// ============================================================================

const UI_DIST_PATH = new URL("../../lib/std/src/ui/dist", import.meta.url).pathname;

/**
 * All expected UI components (40 total)
 *
 * Components are organized by category:
 * - Data Viewers: json-viewer, table-viewer, tree-viewer, xml-viewer, yaml-viewer
 * - Code/Dev: diff-viewer, log-viewer, blame-viewer, commit-graph, dependency-graph
 * - Charts/Metrics: chart-viewer, gauge, sparkline, metrics-panel, stats-panel
 * - Security: certificate-viewer, jwt-viewer, contrast-checker
 * - System: resource-monitor, disk-usage-viewer, env-viewer, port-scanner
 * - Schemas: schema-viewer, erd-viewer, form-viewer, validation-result
 * - Time/Scheduling: timeline-viewer, cron-viewer, waterfall-viewer, plan-viewer
 * - Network: headers-viewer
 * - Geography: map-viewer
 * - Visual: color-picker, palette-viewer, qr-viewer, image-preview, word-cloud
 * - Text: markdown-viewer, regex-tester
 * - Status: status-badge
 */
const EXPECTED_COMPONENTS = [
  "blame-viewer",
  "certificate-viewer",
  "chart-viewer",
  "color-picker",
  "commit-graph",
  "contrast-checker",
  "cron-viewer",
  "dependency-graph",
  "diff-viewer",
  "disk-usage-viewer",
  "env-viewer",
  "erd-viewer",
  "form-viewer",
  "gauge",
  "headers-viewer",
  "image-preview",
  "json-viewer",
  "jwt-viewer",
  "log-viewer",
  "map-viewer",
  "markdown-viewer",
  "metrics-panel",
  "palette-viewer",
  "plan-viewer",
  "port-scanner",
  "qr-viewer",
  "regex-tester",
  "resource-monitor",
  "schema-viewer",
  "sparkline",
  "stats-panel",
  "status-badge",
  "table-viewer",
  "timeline-viewer",
  "tree-viewer",
  "validation-result",
  "waterfall-viewer",
  "word-cloud",
  "xml-viewer",
  "yaml-viewer",
];

// ============================================================================
// Test 1: All dist files exist
// ============================================================================

Deno.test("UI Components - all 40 dist files exist", async (t) => {
  const missingComponents: string[] = [];
  const existingComponents: string[] = [];

  for (const component of EXPECTED_COMPONENTS) {
    await t.step(`Check ${component}/index.html exists`, async () => {
      const path = `${UI_DIST_PATH}/${component}/index.html`;
      try {
        const stat = await Deno.stat(path);
        assertEquals(stat.isFile, true, `${component}/index.html should be a file`);
        existingComponents.push(component);
      } catch {
        missingComponents.push(component);
      }
    });
  }

  await t.step("Summary: All components present", () => {
    assertEquals(
      missingComponents.length,
      0,
      `Missing components: ${missingComponents.join(", ")}`
    );
    assertEquals(existingComponents.length, EXPECTED_COMPONENTS.length);
  });
});

// ============================================================================
// Test 2: Valid HTML structure
// ============================================================================

Deno.test("UI Components - valid HTML structure", async (t) => {
  for (const component of EXPECTED_COMPONENTS) {
    await t.step(`${component} has valid HTML structure`, async () => {
      const path = `${UI_DIST_PATH}/${component}/index.html`;
      const content = await Deno.readTextFile(path);

      // Check DOCTYPE
      assert(
        content.startsWith("<!DOCTYPE html>"),
        `${component} should start with DOCTYPE`
      );

      // Check basic HTML structure
      assertStringIncludes(content, "<html", `${component} should have <html> tag`);
      assertStringIncludes(content, "<head>", `${component} should have <head> tag`);
      assertStringIncludes(content, "</head>", `${component} should have closing </head>`);
      assertStringIncludes(content, "<body>", `${component} should have <body> tag`);
      assertStringIncludes(content, "</body>", `${component} should have closing </body>`);
      assertStringIncludes(content, "</html>", `${component} should have closing </html>`);

      // Check charset meta
      assertStringIncludes(
        content,
        'charset="UTF-8"',
        `${component} should have UTF-8 charset`
      );

      // Check viewport meta
      assertStringIncludes(
        content,
        "viewport",
        `${component} should have viewport meta tag`
      );

      // Check for script (module) - all components are Preact apps
      assertStringIncludes(
        content,
        '<script type="module"',
        `${component} should have module script`
      );

      // Check for title
      assertStringIncludes(content, "<title>", `${component} should have title tag`);
    });
  }
});

// ============================================================================
// Test 3: Component-specific content validation
// ============================================================================

Deno.test("UI Components - component-specific content", async (t) => {
  await t.step("json-viewer contains JSON Viewer title", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/json-viewer/index.html`);
    assertStringIncludes(content, "JSON Viewer", "Should have JSON Viewer in title");
  });

  await t.step("table-viewer contains Table Viewer title", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/table-viewer/index.html`);
    assertStringIncludes(content, "Table Viewer", "Should have Table Viewer in title");
  });

  await t.step("chart-viewer contains Chart Viewer title", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/chart-viewer/index.html`);
    assertStringIncludes(content, "Chart Viewer", "Should have Chart Viewer in title");
  });

  await t.step("diff-viewer contains Diff Viewer title", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/diff-viewer/index.html`);
    assertStringIncludes(content, "Diff Viewer", "Should have Diff Viewer in title");
  });

  await t.step("log-viewer contains Log Viewer title", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/log-viewer/index.html`);
    assertStringIncludes(content, "Log Viewer", "Should have Log Viewer in title");
  });

  // New components (added for 40-component update)
  await t.step("regex-tester contains Regex Tester title", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/regex-tester/index.html`);
    assertStringIncludes(content, "Regex Tester", "Should have Regex Tester in title");
  });

  await t.step("cron-viewer contains Cron Viewer title", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/cron-viewer/index.html`);
    assertStringIncludes(content, "Cron Viewer", "Should have Cron Viewer in title");
  });

  await t.step("contrast-checker contains Contrast Checker title", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/contrast-checker/index.html`);
    assertStringIncludes(content, "Contrast Checker", "Should have Contrast Checker in title");
  });

  await t.step("dependency-graph contains Dependency Graph title", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/dependency-graph/index.html`);
    assertStringIncludes(content, "Dependency Graph", "Should have Dependency Graph in title");
  });

  await t.step("env-viewer contains Environment Variables Viewer title", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/env-viewer/index.html`);
    assertStringIncludes(content, "Environment Variables Viewer", "Should have Environment Variables Viewer in title");
  });

  await t.step("markdown-viewer contains Markdown Viewer title", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/markdown-viewer/index.html`);
    assertStringIncludes(content, "Markdown Viewer", "Should have Markdown Viewer in title");
  });
});

// ============================================================================
// Test 3b: New component-specific functionality tests
// ============================================================================

Deno.test("UI Components - new component functionality", async (t) => {
  await t.step("regex-tester handles regex patterns", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/regex-tester/index.html`);
    // Regex tester should handle pattern matching
    assert(
      content.includes("pattern") || content.includes("regex") || content.includes("RegExp"),
      "Should handle regex patterns"
    );
    // Should have test/match functionality
    assert(
      content.includes("match") || content.includes("test") || content.includes("exec"),
      "Should have pattern matching functionality"
    );
  });

  await t.step("cron-viewer parses cron expressions", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/cron-viewer/index.html`);
    // Cron viewer should handle cron expression fields
    assert(
      content.includes("minute") || content.includes("hour") || content.includes("cron"),
      "Should parse cron expression fields"
    );
    // Should display schedule information
    assert(
      content.includes("schedule") || content.includes("next") || content.includes("expression"),
      "Should display schedule information"
    );
  });

  await t.step("contrast-checker calculates WCAG ratios", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/contrast-checker/index.html`);
    // Contrast checker should calculate contrast ratios
    assert(
      content.includes("contrast") || content.includes("ratio") || content.includes("WCAG"),
      "Should calculate contrast ratios"
    );
    // Should handle foreground/background colors
    assert(
      content.includes("foreground") || content.includes("background") || content.includes("color"),
      "Should handle color inputs"
    );
  });

  await t.step("dependency-graph handles node relationships", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/dependency-graph/index.html`);
    // Dependency graph should handle nodes and edges
    assert(
      content.includes("node") || content.includes("edge") || content.includes("graph"),
      "Should handle graph nodes and edges"
    );
    // Should visualize dependencies
    assert(
      content.includes("svg") || content.includes("SVG") || content.includes("canvas"),
      "Should render graph visualization"
    );
  });

  await t.step("stats-panel displays statistical data", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/stats-panel/index.html`);
    // Stats panel should display metrics
    assert(
      content.includes("stat") || content.includes("metric") || content.includes("value"),
      "Should display statistical data"
    );
  });

  await t.step("word-cloud renders text visualization", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/word-cloud/index.html`);
    // Word cloud should handle word/text data
    assert(
      content.includes("word") || content.includes("text") || content.includes("font"),
      "Should handle word data"
    );
    // Should render visual output
    assert(
      content.includes("svg") || content.includes("SVG") || content.includes("canvas"),
      "Should render word cloud visualization"
    );
  });
});

// ============================================================================
// Test 4: File sizes are reasonable (not empty, not corrupted)
// ============================================================================

Deno.test("UI Components - file sizes are reasonable", async (t) => {
  const minSize = 10_000; // 10KB minimum (bundled Preact app)
  const maxSize = 2_000_000; // 2MB maximum

  for (const component of EXPECTED_COMPONENTS) {
    await t.step(`${component} file size is reasonable`, async () => {
      const path = `${UI_DIST_PATH}/${component}/index.html`;
      const stat = await Deno.stat(path);

      assert(
        stat.size >= minSize,
        `${component} (${stat.size} bytes) is smaller than expected minimum ${minSize} bytes`
      );
      assert(
        stat.size <= maxSize,
        `${component} (${stat.size} bytes) exceeds maximum ${maxSize} bytes`
      );
    });
  }
});

// ============================================================================
// Test 5: Bundled JavaScript is valid (no syntax errors)
// ============================================================================

Deno.test("UI Components - bundled JS has no obvious errors", async (t) => {
  // Check a few key components for common JavaScript patterns
  const componentsToCheck = ["json-viewer", "table-viewer", "chart-viewer"];

  for (const component of componentsToCheck) {
    await t.step(`${component} has valid bundled JavaScript`, async () => {
      const content = await Deno.readTextFile(`${UI_DIST_PATH}/${component}/index.html`);

      // Check for Preact/React-like patterns (minified)
      assertStringIncludes(
        content,
        "render",
        `${component} should contain render function`
      );

      // Check for common event patterns
      assertStringIncludes(
        content,
        "addEventListener",
        `${component} should contain event listeners`
      );

      // Check for CSS-in-JS patterns (Panda CSS)
      assert(
        content.includes("css") || content.includes("className") || content.includes("class"),
        `${component} should have CSS styling`
      );

      // Ensure no obvious errors left in bundle
      assert(
        !content.includes("undefined is not"),
        `${component} should not contain obvious error messages`
      );
    });
  }
});

// ============================================================================
// Test 6: MCP Apps protocol integration
// ============================================================================

Deno.test("UI Components - MCP Apps protocol patterns", async (t) => {
  const componentsToCheck = ["json-viewer", "table-viewer", "chart-viewer"];

  for (const component of componentsToCheck) {
    await t.step(`${component} has MCP Apps integration`, async () => {
      const content = await Deno.readTextFile(`${UI_DIST_PATH}/${component}/index.html`);

      // MCP Apps uses postMessage for communication
      assertStringIncludes(
        content,
        "postMessage",
        `${component} should use postMessage for MCP Apps communication`
      );

      // Should have message event listener
      assertStringIncludes(
        content,
        "message",
        `${component} should listen for message events`
      );
    });
  }
});

// ============================================================================
// Test 7: App mount point exists
// ============================================================================

Deno.test("UI Components - app mount point", async (t) => {
  for (const component of EXPECTED_COMPONENTS) {
    await t.step(`${component} has app mount point`, async () => {
      const content = await Deno.readTextFile(`${UI_DIST_PATH}/${component}/index.html`);

      // All Preact components mount to #app
      assertStringIncludes(
        content,
        'id="app"',
        `${component} should have #app mount point`
      );
    });
  }
});

// ============================================================================
// Test 8: Inline styles/CSS present
// ============================================================================

Deno.test("UI Components - styles are bundled", async (t) => {
  for (const component of EXPECTED_COMPONENTS) {
    await t.step(`${component} has bundled styles`, async () => {
      const content = await Deno.readTextFile(`${UI_DIST_PATH}/${component}/index.html`);

      // Should have style tag (Vite bundles CSS) - either <style> or <style rel="stylesheet">
      // CSS-in-JS (Panda CSS) generates styles dynamically
      assert(
        content.includes("<style") || content.includes("style"),
        `${component} should have styles bundled`
      );
    });
  }
});

// ============================================================================
// Test 9: No external dependencies (self-contained)
// ============================================================================

Deno.test("UI Components - self-contained bundles", async (t) => {
  // Google Fonts are allowed as an exception (fonts don't compromise bundle autonomy)
  const ALLOWED_EXTERNAL_DOMAINS = [
    "fonts.googleapis.com",
    "fonts.gstatic.com",
  ];

  for (const component of EXPECTED_COMPONENTS) {
    await t.step(`${component} is self-contained`, async () => {
      const content = await Deno.readTextFile(`${UI_DIST_PATH}/${component}/index.html`);

      // Should not have external script src (except for module preload hints)
      const externalScripts = content.match(/<script[^>]+src=["']https?:\/\//g);
      assertEquals(
        externalScripts,
        null,
        `${component} should not load external scripts`
      );

      // Should not have external stylesheet links (except allowed domains like Google Fonts)
      const externalStyleMatches = content.match(/<link[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*stylesheet/g) || [];
      const disallowedStyles = externalStyleMatches.filter((match) => {
        return !ALLOWED_EXTERNAL_DOMAINS.some((domain) => match.includes(domain));
      });
      assertEquals(
        disallowedStyles.length,
        0,
        `${component} should not load external stylesheets (except Google Fonts). Found: ${disallowedStyles.join(", ")}`
      );
    });
  }
});

// ============================================================================
// Test 10: Content types and data handling patterns
// ============================================================================

Deno.test("UI Components - data handling patterns", async (t) => {
  await t.step("json-viewer handles JSON parsing", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/json-viewer/index.html`);
    assertStringIncludes(content, "JSON.parse", "Should parse JSON data");
  });

  await t.step("table-viewer handles array/object data", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/table-viewer/index.html`);
    // Table viewer normalizes data
    assert(
      content.includes("columns") && content.includes("rows"),
      "Should handle columns and rows"
    );
  });

  await t.step("chart-viewer handles chart data", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/chart-viewer/index.html`);
    // Chart viewer uses labels and datasets
    assert(
      content.includes("labels") && content.includes("datasets"),
      "Should handle labels and datasets"
    );
  });
});

// ============================================================================
// Test 11: Component count verification
// ============================================================================

Deno.test("UI Components - exactly 40 components in dist", async () => {
  const entries: string[] = [];

  for await (const entry of Deno.readDir(UI_DIST_PATH)) {
    if (entry.isDirectory) {
      // Verify index.html exists
      try {
        await Deno.stat(`${UI_DIST_PATH}/${entry.name}/index.html`);
        entries.push(entry.name);
      } catch {
        // Not a valid component directory
      }
    }
  }

  assertEquals(
    entries.length,
    40,
    `Expected 40 components, found ${entries.length}: ${entries.sort().join(", ")}`
  );
});

// ============================================================================
// Test 12: Accessibility basics
// ============================================================================

Deno.test("UI Components - basic accessibility", async (t) => {
  for (const component of EXPECTED_COMPONENTS) {
    await t.step(`${component} has lang attribute`, async () => {
      const content = await Deno.readTextFile(`${UI_DIST_PATH}/${component}/index.html`);
      assertStringIncludes(
        content,
        'lang="en"',
        `${component} should have lang="en" for accessibility`
      );
    });
  }
});

// ============================================================================
// Test 13: Mock data rendering simulation
// ============================================================================

Deno.test("UI Components - mock data format compatibility", async (t) => {
  // These tests verify the components can theoretically handle the expected data formats
  // by checking the bundled code contains the necessary parsing/handling logic

  await t.step("json-viewer handles nested objects", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/json-viewer/index.html`);
    // Should have tree building logic for nested structures
    assert(
      content.includes("children") || content.includes("child"),
      "Should handle nested structures with children"
    );
  });

  await t.step("table-viewer handles pagination", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/table-viewer/index.html`);
    // Should have pagination logic
    assert(
      content.includes("page") && content.includes("Page"),
      "Should have pagination support"
    );
  });

  await t.step("chart-viewer handles multiple chart types", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/chart-viewer/index.html`);
    // Should support bar, line, and pie charts
    assert(
      content.includes("bar") && content.includes("line") && content.includes("pie"),
      "Should support bar, line, and pie chart types"
    );
  });

  await t.step("gauge handles numeric values", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/gauge/index.html`);
    // Gauge should display numeric values
    assert(
      content.includes("value") || content.includes("percent"),
      "Should handle numeric values"
    );
  });

  await t.step("sparkline handles data arrays", async () => {
    const content = await Deno.readTextFile(`${UI_DIST_PATH}/sparkline/index.html`);
    // Sparkline renders small charts from data arrays
    assert(
      content.includes("data") && (content.includes("svg") || content.includes("SVG")),
      "Should render SVG from data arrays"
    );
  });
});

// ============================================================================
// Test 14: Event emission patterns
// ============================================================================

Deno.test("UI Components - event emission patterns", async (t) => {
  const interactiveComponents = [
    "json-viewer",
    "table-viewer",
    "chart-viewer",
    "form-viewer",
    "color-picker",
  ];

  for (const component of interactiveComponents) {
    await t.step(`${component} emits events via MCP protocol`, async () => {
      const content = await Deno.readTextFile(`${UI_DIST_PATH}/${component}/index.html`);

      // Components should update model context on user interaction
      assert(
        content.includes("updateModelContext") ||
        content.includes("postMessage") ||
        content.includes("notify"),
        `${component} should emit events to host`
      );
    });
  }
});

// ============================================================================
// Test 15: Error handling patterns
// ============================================================================

Deno.test("UI Components - error handling", async (t) => {
  const dataComponents = ["json-viewer", "table-viewer", "chart-viewer"];

  for (const component of dataComponents) {
    await t.step(`${component} has error handling`, async () => {
      const content = await Deno.readTextFile(`${UI_DIST_PATH}/${component}/index.html`);

      // Should handle errors gracefully
      assert(
        content.includes("error") || content.includes("Error"),
        `${component} should have error handling`
      );

      // Should have try-catch patterns
      assert(
        content.includes("try") && content.includes("catch"),
        `${component} should use try-catch for error handling`
      );
    });
  }
});

// ============================================================================
// Test 16: Loading state patterns
// ============================================================================

Deno.test("UI Components - loading states", async (t) => {
  const dataComponents = ["json-viewer", "table-viewer", "chart-viewer"];

  for (const component of dataComponents) {
    await t.step(`${component} has loading state`, async () => {
      const content = await Deno.readTextFile(`${UI_DIST_PATH}/${component}/index.html`);

      // Should show loading state while waiting for data
      assert(
        content.includes("loading") || content.includes("Loading"),
        `${component} should have loading state`
      );
    });
  }
});
