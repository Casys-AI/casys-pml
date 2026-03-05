// @ts-nocheck
/**
 * Shared utilities for OG image generation with Satori + resvg-wasm.
 * Fonts are cached in memory, WASM initialized once.
 */

import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

let wasmInitialized = false;
let fontData: ArrayBuffer | null = null;
let fontDataBold: ArrayBuffer | null = null;
const require = createRequire(import.meta.url);

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.arrayBuffer();
}

async function readLocalFileAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  const buf = await fs.readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function loadFonts() {
  if (!fontData) {
    try {
      fontData = await fetchArrayBuffer(
        'https://cdn.jsdelivr.net/fontsource/fonts/geist-sans@latest/latin-600-normal.woff'
      );
    } catch {
      const localRegular = require.resolve('katex/dist/fonts/KaTeX_SansSerif-Regular.ttf');
      fontData = await readLocalFileAsArrayBuffer(localRegular);
    }
  }
  if (!fontDataBold) {
    try {
      fontDataBold = await fetchArrayBuffer(
        'https://cdn.jsdelivr.net/fontsource/fonts/geist-sans@latest/latin-700-normal.woff'
      );
    } catch {
      const localBold = require.resolve('katex/dist/fonts/KaTeX_SansSerif-Bold.ttf');
      fontDataBold = await readLocalFileAsArrayBuffer(localBold);
    }
  }
  return { fontData: fontData!, fontDataBold: fontDataBold! };
}

async function ensureWasm() {
  if (!wasmInitialized) {
    try {
      try {
        await initWasm(
          fetch('https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm')
        );
      } catch {
        const wasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm');
        const wasmBytes = await fs.readFile(wasmPath);
        await initWasm(wasmBytes);
      }
    } catch {
      // Already initialized, or initialized by another callsite.
    }
    wasmInitialized = true;
  }
}

export async function generateOgImage(element: any): Promise<Response> {
  const fonts = await loadFonts();
  await ensureWasm();

  const svg = await satori(element, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Geist', data: fonts.fontData, weight: 600, style: 'normal' as const },
      { name: 'Geist', data: fonts.fontDataBold, weight: 700, style: 'normal' as const },
    ],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return new Response(pngBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    },
  });
}
