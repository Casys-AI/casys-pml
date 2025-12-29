// @ts-nocheck
/**
 * Open Graph Image for Blog Index
 * Route: /blog/og/index.png
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
              // Background gradient
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
                      "radial-gradient(circle at 70% 30%, rgba(255, 184, 111, 0.1) 0%, transparent 50%)",
                  },
                },
              },
              // Top bar with logo
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "40px",
                  },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: {
                          display: "flex",
                          alignItems: "center",
                        },
                        children: [
                          {
                            type: "div",
                            props: {
                              style: {
                                width: "40px",
                                height: "40px",
                                borderRadius: "10px",
                                backgroundColor: "#FFB86F",
                                marginRight: "14px",
                              },
                            },
                          },
                          {
                            type: "span",
                            props: {
                              style: {
                                fontSize: "26px",
                                fontWeight: 700,
                                color: "#ffffff",
                              },
                              children: "Casys PML",
                            },
                          },
                        ],
                      },
                    },
                    // Blog badge
                    {
                      type: "div",
                      props: {
                        style: {
                          padding: "8px 20px",
                          borderRadius: "20px",
                          backgroundColor: "rgba(255, 184, 111, 0.15)",
                          border: "1px solid rgba(255, 184, 111, 0.3)",
                          color: "#FFB86F",
                          fontSize: "14px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        },
                        children: "Engineering Blog",
                      },
                    },
                  ],
                },
              },
              // Main content
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
                          fontSize: "64px",
                          fontWeight: 700,
                          color: "#ffffff",
                          lineHeight: 1.15,
                          marginBottom: "24px",
                        },
                        children: "Insights & Deep Dives",
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: {
                          fontSize: "24px",
                          color: "#a8a29e",
                          lineHeight: 1.5,
                          maxWidth: "700px",
                        },
                        children:
                          "Technical explorations, debugging stories, and lessons learned building Casys PML.",
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
                      type: "div",
                      props: {
                        style: {
                          display: "flex",
                          gap: "16px",
                        },
                        children: [
                          {
                            type: "span",
                            props: {
                              style: {
                                padding: "4px 12px",
                                borderRadius: "4px",
                                backgroundColor: "rgba(139, 92, 246, 0.2)",
                                color: "#a78bfa",
                                fontSize: "13px",
                              },
                              children: "Architecture",
                            },
                          },
                          {
                            type: "span",
                            props: {
                              style: {
                                padding: "4px 12px",
                                borderRadius: "4px",
                                backgroundColor: "rgba(59, 130, 246, 0.2)",
                                color: "#60a5fa",
                                fontSize: "13px",
                              },
                              children: "Engineering",
                            },
                          },
                          {
                            type: "span",
                            props: {
                              style: {
                                padding: "4px 12px",
                                borderRadius: "4px",
                                backgroundColor: "rgba(16, 185, 129, 0.2)",
                                color: "#34d399",
                                fontSize: "13px",
                              },
                              children: "Research",
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: "span",
                      props: {
                        style: {
                          fontSize: "18px",
                          color: "#FFB86F",
                        },
                        children: "pml.casys.ai/blog",
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
