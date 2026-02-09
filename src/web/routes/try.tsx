/**
 * Try Playground - Conversational UI Composer
 *
 * Page blanche où l'utilisateur chatte (via Puter.js) et les MCP UIs
 * apparaissent dynamiquement comme widgets repositionnables.
 *
 * @module web/routes/try
 */

import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import TryPlaygroundIsland from "../islands/TryPlaygroundIsland.tsx";

export const handler = {
  GET(_ctx: FreshContext) {
    if (!Deno.env.get("PLAYGROUND_ENABLED")) {
      return new Response("Not Found", { status: 404 });
    }
    return page({});
  },
};

export default function TryPage() {
  return (
    <>
      <Head>
        <title>Try PML - Conversational UI Playground</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content="Experience MCP Apps through conversation. Chat and watch UIs appear."
        />

        {/* Puter.js SDK */}
        <script src="https://js.puter.com/v2/" defer></script>

        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />

        <style>{`
          html, body {
            margin: 0;
            padding: 0;
            background: #08080a;
            color: #f5f0ea;
            font-family: 'Geist', system-ui, sans-serif;
            height: 100%;
            overflow: hidden;
          }
        `}</style>
      </Head>

      <TryPlaygroundIsland />
    </>
  );
}
