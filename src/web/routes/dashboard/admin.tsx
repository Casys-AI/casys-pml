/**
 * Admin Analytics Dashboard Page
 *
 * Displays platform analytics for admin users.
 * Cloud-only: this page is excluded from public sync.
 *
 * @module web/routes/dashboard/admin
 */

import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import type { AuthState } from "../_middleware.ts";
import { getRawDb } from "../../../server/auth/db.ts";
import {
  getAdminAnalytics,
  isAdminUser,
  type AdminAnalytics,
  type TimeRange,
} from "../../../cloud/admin/mod.ts";
import AdminDashboardIsland from "../../islands/AdminDashboardIsland.tsx";

interface AdminPageData {
  user: NonNullable<AuthState["user"]>;
  analytics: AdminAnalytics;
  timeRange: TimeRange;
  error?: string;
}

export const handler = {
  async GET(ctx: FreshContext<AuthState>) {
    const { user } = ctx.state;
    const url = new URL(ctx.req.url);

    // Redirect to signin if not authenticated
    if (!user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/auth/signin?return=/dashboard/admin" },
      });
    }

    // Parse time range from query
    const timeRangeParam = url.searchParams.get("range") || "24h";
    const timeRange: TimeRange = ["24h", "7d", "30d"].includes(timeRangeParam)
      ? (timeRangeParam as TimeRange)
      : "24h";

    try {
      const db = await getRawDb();

      // Check admin access
      const isAdmin = await isAdminUser(db, user.id);
      if (!isAdmin) {
        return new Response(null, {
          status: 302,
          headers: { Location: "/dashboard?error=admin_required" },
        });
      }

      // Get analytics
      const analytics = await getAdminAnalytics(db, { timeRange });

      return page({
        user,
        analytics,
        timeRange,
      });
    } catch (error) {
      console.error("Error fetching admin analytics:", error);
      return page({
        user,
        analytics: null,
        timeRange,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
};

export default function AdminPage({ data }: { data: AdminPageData }) {
  const { user, analytics, timeRange, error } = data;

  return (
    <>
      <Head>
        <title>Admin Analytics | Casys PML</title>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2/dist/tailwind.min.css"
        />
      </Head>
      <div class="min-h-screen bg-gray-900 text-white">
        {/* Header */}
        <header class="bg-gray-800 border-b border-gray-700 px-6 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <a href="/dashboard" class="text-gray-400 hover:text-white">
                ← Dashboard
              </a>
              <h1 class="text-xl font-bold">Admin Analytics</h1>
            </div>
            <div class="flex items-center gap-4">
              <span class="text-gray-400">{user.username}</span>
              {user.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  class="w-8 h-8 rounded-full"
                />
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main class="p-6">
          {error ? (
            <div class="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
              <h2 class="text-red-500 font-bold">Error loading analytics</h2>
              <p class="text-gray-400">{error}</p>
            </div>
          ) : (
            <AdminDashboardIsland
              analytics={analytics}
              initialTimeRange={timeRange}
            />
          )}
        </main>
      </div>
    </>
  );
}
