/**
 * Settings Page
 *
 * Displays user settings including:
 * - API Key management (cloud mode only)
 * - MCP Gateway configuration
 * - Danger zone: Regenerate key, Delete account
 *
 * @module web/routes/dashboard/settings
 */

import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import type { AuthState } from "../_middleware.ts";
import { getDb } from "../../../server/auth/db.ts";
import { users } from "../../../db/schema/users.ts";
import { eq } from "drizzle-orm";
import { peekFlashApiKey } from "../../../server/auth/session.ts";
import { getSessionId } from "../../../server/auth/oauth.ts";
import { getKv } from "../../../server/auth/kv.ts";
import SettingsIsland from "../../islands/SettingsIsland.tsx";
import DangerZoneIsland from "../../islands/DangerZoneIsland.tsx";

interface SettingsData {
  user: NonNullable<AuthState["user"]>;
  isCloudMode: boolean;
  apiKeyPrefix: string | null;
  flashApiKey: string | null;
}

export const handler = {
  async GET(ctx: FreshContext<AuthState>) {
    const { user, isCloudMode } = ctx.state;

    // Redirect to signin if not authenticated (cloud mode)
    if (!user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/auth/signin?return=/dashboard/settings" },
      });
    }

    let apiKeyPrefix: string | null = null;
    let flashApiKey: string | null = null;

    // Get API key info (cloud mode only)
    if (isCloudMode && user.id !== "local") {
      try {
        const db = await getDb();
        const result = await db
          .select({ prefix: users.apiKeyPrefix })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        apiKeyPrefix = result[0]?.prefix ?? null;

        // Check for flash API key (shown once after login/regenerate)
        const sessionId = await getSessionId(ctx.req);
        if (sessionId) {
          const kv = await getKv();
          flashApiKey = await peekFlashApiKey(kv, sessionId);
        }
      } catch (error) {
        console.error("Error fetching API key info:", error);
      }
    }

    return page({
      user,
      isCloudMode,
      apiKeyPrefix,
      flashApiKey,
    });
  },
};

export default function SettingsPage({ data }: { data: SettingsData }) {
  const { user, isCloudMode, apiKeyPrefix, flashApiKey } = data;

  return (
    <>
      <Head>
        <title>Settings - Casys PML</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div class="min-h-screen bg-[#08080a] text-stone-100 font-[Geist,_-apple-system,_system-ui,_sans-serif]">
        <header class="flex justify-between items-center px-8 py-4 bg-[#0f0f12] border-b border-amber-400/8 max-sm:flex-col max-sm:gap-4">
          <div>
            <a href="/dashboard" class="flex items-center gap-2 text-stone-400 no-underline text-sm font-medium px-4 py-2 rounded-lg bg-[#08080a] border border-amber-400/8 transition-all duration-200 hover:text-amber-400 hover:border-amber-400/20">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </a>
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <img
                src={user.avatarUrl || "/default-avatar.svg"}
                alt={user.username}
                class="w-7 h-7 rounded-full border border-amber-400/8"
              />
              <span class="text-sm font-medium">
                {user.username === "local" ? "Local User" : user.username}
              </span>
            </div>
            {!isCloudMode && (
              <span class="flex items-center gap-1 px-2 py-1 text-xs font-[Geist_Mono,_monospace] text-green-400 bg-green-400/10 border border-green-400/20 rounded">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Local Mode
              </span>
            )}
          </div>
        </header>

        <main class="max-w-[800px] mx-auto p-8">
          <h1 class="font-[Instrument_Serif,_Georgia,_serif] text-3xl font-normal mb-8">Settings</h1>

          {isCloudMode && (
            <section class="bg-[#141418] border border-amber-400/8 rounded-xl mb-6 overflow-hidden">
              <h2 class="flex items-center gap-3 px-6 py-4 text-base font-semibold bg-[#0f0f12] border-b border-amber-400/8">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
                Your API Key
              </h2>
              <div class="p-6">
                <SettingsIsland
                  flashApiKey={flashApiKey}
                  apiKeyPrefix={apiKeyPrefix}
                />

                <div class="mt-6 p-4 bg-[#08080a] border border-amber-400/8 rounded-lg">
                  <h3 class="text-sm font-semibold mb-2">Setup</h3>
                  <p class="text-[0.8rem] text-stone-400 mb-2">Set your API key as an environment variable:</p>
                  <pre class="m-0 px-3 py-2 bg-[#0f0f12] rounded overflow-x-auto"><code class="font-[Geist_Mono,_monospace] text-[0.8rem] text-amber-400">export PML_API_KEY="your_api_key_here"</code></pre>
                </div>
              </div>
            </section>
          )}


          {isCloudMode && (
            <section class="bg-[#141418] border border-red-400/20 rounded-xl mb-6 overflow-hidden">
              <h2 class="flex items-center gap-3 px-6 py-4 text-base font-semibold bg-[#0f0f12] border-b border-amber-400/8 text-red-400">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Danger Zone
              </h2>
              <div class="p-6">
                <DangerZoneIsland />
              </div>
            </section>
          )}

          <footer class="text-center p-8 text-stone-500 text-[0.8rem]">
            <span class="px-4 py-2 bg-[#0f0f12] rounded-full">
              {isCloudMode
                ? "Running in cloud mode"
                : "Running in local mode - no authentication required"}
            </span>
          </footer>
        </main>
      </div>
    </>
  );
}
