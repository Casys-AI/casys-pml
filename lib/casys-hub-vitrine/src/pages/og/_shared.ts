// @ts-nocheck
/**
 * Shared utilities for OG image generation with Satori + resvg-wasm.
 * Fonts are cached in memory, WASM initialized once.
 */

import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

let wasmInitialized = false;
let fontData: ArrayBuffer | null = null;
let fontDataBold: ArrayBuffer | null = null;

async function loadFonts() {
  if (!fontData) {
    fontData = await fetch(
      'https://cdn.jsdelivr.net/fontsource/fonts/geist-sans@latest/latin-600-normal.woff'
    ).then((res) => res.arrayBuffer());
  }
  if (!fontDataBold) {
    fontDataBold = await fetch(
      'https://cdn.jsdelivr.net/fontsource/fonts/geist-sans@latest/latin-700-normal.woff'
    ).then((res) => res.arrayBuffer());
  }
  return { fontData: fontData!, fontDataBold: fontDataBold! };
}

async function ensureWasm() {
  if (!wasmInitialized) {
    try {
      await initWasm(
        fetch('https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm')
      );
    } catch (_e) {
      // Already initialized
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
