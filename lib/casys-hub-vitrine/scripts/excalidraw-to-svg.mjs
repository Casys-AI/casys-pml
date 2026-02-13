#!/usr/bin/env node
/**
 * excalidraw-to-svg.mjs — Convert .excalidraw JSON files to clean SVGs.
 *
 * Produces SVGs compatible with ExcalidrawDiagram.astro theme system.
 * Uses <defs> markers for arrowheads, integer viewBox, and proper text layout.
 *
 * Usage:
 *   node scripts/excalidraw-to-svg.mjs [file1.excalidraw] [file2.excalidraw] ...
 *   node scripts/excalidraw-to-svg.mjs --all    # convert all in public/diagrams/
 *   node scripts/excalidraw-to-svg.mjs --stale  # only if .excalidraw newer than .svg
 */

import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";

const DIAGRAMS_DIR = path.resolve(import.meta.dirname, "..", "public", "diagrams");
const FONT = `"Inter", "Segoe UI", system-ui, -apple-system, sans-serif`;
const PADDING = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const r = (n) => Math.round(n * 100) / 100; // round to 2 decimals max

function hexToRgba(hex, opacity) {
  if (opacity == null || opacity >= 100) return hex;
  const c = parseInt(hex.slice(1), 16);
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${r(opacity / 100)})`;
}

function getRx(el) {
  if (!el.roundness) return 0;
  const limit = Math.min(el.width, el.height) / 2;
  return Math.min(el.roundness.value ?? Math.min(el.width, el.height) * 0.125, limit);
}

function fillOf(el) {
  return el.backgroundColor && el.fillStyle === "solid"
    ? hexToRgba(el.backgroundColor, el.opacity)
    : "none";
}

// ─── Arrowhead marker collector ───────────────────────────────────────────────

class MarkerRegistry {
  #markers = new Map();

  /** Returns marker-end attribute value. Deduplicates by color. */
  getEnd(color) {
    const id = `ah-${color.replace("#", "")}`;
    if (!this.#markers.has(id)) {
      this.#markers.set(
        id,
        `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="${color}"/></marker>`,
      );
    }
    return `url(#${id})`;
  }

  toDefs() {
    if (this.#markers.size === 0) return "";
    return `  <defs>\n    ${[...this.#markers.values()].join("\n    ")}\n  </defs>\n`;
  }
}

// ─── Element renderers ────────────────────────────────────────────────────────

function renderRect(el) {
  const rx = getRx(el);
  const sw = el.strokeWidth ?? 1;
  return `  <rect x="${r(el.x)}" y="${r(el.y)}" width="${r(el.width)}" height="${r(el.height)}"${rx ? ` rx="${r(rx)}"` : ""} fill="${fillOf(el)}" stroke="${el.strokeColor}" stroke-width="${sw}"/>`;
}

function renderDiamond(el) {
  const cx = r(el.x + el.width / 2);
  const cy = r(el.y + el.height / 2);
  const hw = r(el.width / 2);
  const hh = r(el.height / 2);
  const sw = el.strokeWidth ?? 1;
  return `  <path d="M${cx} ${cy - hh}l${hw} ${hh} ${-hw} ${hh} ${-hw} ${-hh}Z" fill="${fillOf(el)}" stroke="${el.strokeColor}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

function renderEllipse(el) {
  const sw = el.strokeWidth ?? 1;
  return `  <ellipse cx="${r(el.x + el.width / 2)}" cy="${r(el.y + el.height / 2)}" rx="${r(el.width / 2)}" ry="${r(el.height / 2)}" fill="${fillOf(el)}" stroke="${el.strokeColor}" stroke-width="${sw}"/>`;
}

function renderText(el) {
  const lines = el.text.split("\n");
  const sz = el.fontSize ?? 16;
  const lh = r(sz * 1.3);
  const anchor = el.textAlign === "center" ? "middle" : el.textAlign === "right" ? "end" : "start";
  const tx = r(
    el.textAlign === "center"
      ? el.x + (el.width ?? 0) / 2
      : el.textAlign === "right"
        ? el.x + (el.width ?? 0)
        : el.x,
  );
  const ty = r(el.y + sz);

  if (lines.length === 1) {
    return `  <text x="${tx}" y="${ty}" font-family=${JSON.stringify(FONT)} font-size="${sz}" fill="${el.strokeColor}" text-anchor="${anchor}">${esc(lines[0])}</text>`;
  }

  const spans = lines
    .map((line, i) => `    <tspan x="${tx}"${i > 0 ? ` dy="${lh}"` : ""}>${esc(line)}</tspan>`)
    .join("\n");
  return `  <text font-family=${JSON.stringify(FONT)} font-size="${sz}" fill="${el.strokeColor}" text-anchor="${anchor}" y="${ty}">\n${spans}\n  </text>`;
}

function renderArrowOrLine(el, markers) {
  if (!el.points || el.points.length < 2) return "";
  const sw = el.strokeWidth ?? 1;
  const dash = el.strokeStyle === "dashed" ? ` stroke-dasharray="8 4"` : "";

  const pts = el.points.map((p) => [r(el.x + p[0]), r(el.y + p[1])]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]} ${p[1]}`).join(" ");

  let markerAttr = "";
  if (el.type === "arrow" && el.endArrowhead !== null) {
    markerAttr += ` marker-end="${markers.getEnd(el.strokeColor)}"`;
  }
  if (el.type === "arrow" && el.startArrowhead === "arrow") {
    markerAttr += ` marker-start="${markers.getEnd(el.strokeColor)}"`;
  }

  return `  <path d="${d}" fill="none" stroke="${el.strokeColor}" stroke-width="${sw}"${dash} stroke-linejoin="round" stroke-linecap="round"${markerAttr}/>`;
}

// ─── Bounding box ─────────────────────────────────────────────────────────────

function computeBBox(elements) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of elements) {
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const w = el.width ?? 0;
    const h = el.height ?? 0;

    // text: estimate rendered height from line count
    if (el.type === "text") {
      const lines = (el.text ?? "").split("\n").length;
      const fs = el.fontSize ?? 16;
      const textH = Math.max(h, lines * fs * 1.3);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + w);
      y1 = Math.max(y1, y + textH);
      continue;
    }

    if (el.points) {
      for (const p of el.points) {
        x0 = Math.min(x0, x + p[0]);
        y0 = Math.min(y0, y + p[1]);
        x1 = Math.max(x1, x + p[0]);
        y1 = Math.max(y1, y + p[1]);
      }
    }
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w);
    y1 = Math.max(y1, y + h);
  }
  return {
    x: Math.floor(x0 - PADDING),
    y: Math.floor(y0 - PADDING),
    w: Math.ceil(x1 - x0 + PADDING * 2),
    h: Math.ceil(y1 - y0 + PADDING * 2),
  };
}

// ─── Main converter ───────────────────────────────────────────────────────────

function convertFile(inputPath) {
  const json = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const elements = json.elements ?? [];
  const bgColor = json.appState?.viewBackgroundColor ?? "#ffffff";
  const markers = new MarkerRegistry();

  const bb = computeBBox(elements);
  const ox = -bb.x; // offset to shift everything so viewBox starts at 0,0
  const oy = -bb.y;

  // Shift element coordinates in-place so all positions are relative to 0,0
  for (const el of elements) {
    el.x = (el.x ?? 0) + ox;
    el.y = (el.y ?? 0) + oy;
  }

  const parts = elements
    .map((el) => {
      switch (el.type) {
        case "rectangle": return renderRect(el);
        case "diamond":   return renderDiamond(el);
        case "ellipse":   return renderEllipse(el);
        case "text":      return renderText(el);
        case "arrow":
        case "line":      return renderArrowOrLine(el, markers);
        default:
          console.warn(`  [WARN] Skipping unknown type: ${el.type} (${el.id})`);
          return null;
      }
    })
    .filter(Boolean);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bb.w} ${bb.h}" width="${bb.w}" height="${bb.h}">`,
    `  <!-- svg-source:excalidraw — ${path.basename(inputPath)} -->`,
    markers.toDefs(),
    `  <rect x="0" y="0" width="${bb.w}" height="${bb.h}" fill="${bgColor}"/>`,
    ...parts,
    `</svg>`,
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const outPath = inputPath.replace(/\.excalidraw$/, ".svg");
  fs.writeFileSync(outPath, svg, "utf-8");
  console.log(`  OK  ${path.relative(process.cwd(), outPath)}`);
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("Usage: node scripts/excalidraw-to-svg.mjs [--all|--stale] [file1.excalidraw ...]");
  process.exit(0);
}

let files = [];

if (args.includes("--all") || args.includes("--stale")) {
  const staleOnly = args.includes("--stale");
  const allFiles = await glob("**/*.excalidraw", { cwd: DIAGRAMS_DIR });
  for (const rel of allFiles) {
    const full = path.join(DIAGRAMS_DIR, rel);
    const svgPath = full.replace(/\.excalidraw$/, ".svg");
    if (staleOnly && fs.existsSync(svgPath)) {
      const srcStat = fs.statSync(full);
      const dstStat = fs.statSync(svgPath);
      if (dstStat.mtimeMs >= srcStat.mtimeMs) continue;
    }
    files.push(full);
  }
} else {
  files = args.map((a) => path.resolve(a));
}

if (files.length === 0) {
  console.log("Nothing to convert.");
  process.exit(0);
}

console.log(`Converting ${files.length} file(s)...`);
for (const f of files) {
  try {
    convertFile(f);
  } catch (err) {
    console.error(`  FAIL ${path.relative(process.cwd(), f)}: ${err.message}`);
  }
}
