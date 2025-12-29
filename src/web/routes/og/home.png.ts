// @ts-nocheck
/**
 * Open Graph Image for Homepage
 * Route: /og/home.png
 */

import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";

// Cache
let wasmInitialized = false;
let fontData: ArrayBuffer | null = null;
let fontDataBold: ArrayBuffer | null = null;

async function loadFonts() {
  if (!fontData) {
    fontData = await fetch(
      "https://cdn.jsdelivr.net/fontsource/fonts/geist-sans@latest/latin-600-normal.woff",
    ).then((res) => res.arrayBuffer());
  }
  if (!fontDataBold) {
    fontDataBold = await fetch(
      "https://cdn.jsdelivr.net/fontsource/fonts/geist-sans@latest/latin-700-normal.woff",
    ).then((res) => res.arrayBuffer());
  }
  return { fontData, fontDataBold };
}

export const handler = {
  async GET(_ctx: any) {
    try {
      // Load fonts
      const fonts = await loadFonts();

      // Initialize WASM if not done
      if (!wasmInitialized) {
        try {
          await initWasm(
            fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"),
          );
          wasmInitialized = true;
        } catch (_e) {
          wasmInitialized = true;
        }
      }

      // Generate SVG with Satori
      const svg = await satori(
        {
          type: "div",
          props: {
            style: {
              height: "100%",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#0a0a0c",
              padding: "60px",
              position: "relative",
            },
            children: [
              // Background grid pattern (decorative)
              {
                type: "div",
                props: {
                  style: {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundImage:
                      "radial-gradient(circle at 20% 80%, rgba(255, 184, 111, 0.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(167, 139, 250, 0.06) 0%, transparent 50%)",
                  },
                },
              },
              // Top bar with logo
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    marginBottom: "40px",
                  },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: {
                          width: "48px",
                          height: "48px",
                          borderRadius: "12px",
                          backgroundColor: "#FFB86F",
                          marginRight: "16px",
                        },
                      },
                    },
                    {
                      type: "span",
                      props: {
                        style: {
                          fontSize: "32px",
                          fontWeight: 700,
                          color: "#FFB86F",
                        },
                        children: "Casys PML",
                      },
                    },
                  ],
                },
              },
              // Main title
              {
                type: "div",
                props: {
                  style: {
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                  },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: {
                          fontSize: "72px",
                          fontWeight: 700,
                          color: "#ffffff",
                          lineHeight: 1.1,
                          marginBottom: "24px",
                        },
                        children: "Procedural Memory Layer",
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: {
                          fontSize: "28px",
                          color: "#a8a29e",
                          lineHeight: 1.4,
                          maxWidth: "800px",
                        },
                        children: "RAG gave agents knowledge. PML gives them capabilities.",
                      },
                    },
                  ],
                },
              },
              // Bottom bar
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px solid #333333",
                    paddingTop: "24px",
                  },
                  children: [
                    {
                      type: "span",
                      props: {
                        style: {
                          fontSize: "18px",
                          color: "#666666",
                        },
                        children: "Open Source",
                      },
                    },
                    {
                      type: "span",
                      props: {
                        style: {
                          fontSize: "18px",
                          color: "#FFB86F",
                        },
                        children: "pml.casys.ai",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          width: 1200,
          height: 630,
          fonts: [
            {
              name: "Geist",
              data: fonts.fontData!,
              weight: 600,
              style: "normal",
            },
            {
              name: "Geist",
              data: fonts.fontDataBold!,
              weight: 700,
              style: "normal",
            },
          ],
        },
      );

      // Convert SVG to PNG
      const resvg = new Resvg(svg, {
        fitTo: {
          mode: "width",
          value: 1200,
        },
      });
      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();

      return new Response(pngBuffer, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400, s-maxage=604800",
        },
      });
    } catch (error) {
      console.error("OG image generation error:", error);
      return new Response(`Error generating image: ${error}`, { status: 500 });
    }
  },
};
