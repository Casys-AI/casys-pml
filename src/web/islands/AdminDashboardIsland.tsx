/**
 * AdminDashboardIsland - Admin analytics dashboard with time range selector
 *
 * Story 6.6 - Cloud-only admin analytics dashboard.
 * Displays user activity, system usage, errors, and resource metrics.
 */

import { useState } from "preact/hooks";
import type {
  AdminAnalytics,
  TimeRange,
} from "../../cloud/admin/types.ts";

interface AdminDashboardProps {
  analytics: AdminAnalytics;
  initialTimeRange: TimeRange;
}

/** Format number with K/M suffix */
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

/** Format percentage */
function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** Format duration in ms */
function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

/** Metric card component */
function MetricCard({
  label,
  value,
  subtext,
  color = "blue",
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: "blue" | "green" | "red" | "yellow" | "purple";
}) {
  const colorClasses = {
    blue: "bg-blue-900/30 border-blue-500/50",
    green: "bg-green-900/30 border-green-500/50",
    red: "bg-red-900/30 border-red-500/50",
    yellow: "bg-yellow-900/30 border-yellow-500/50",
    purple: "bg-purple-900/30 border-purple-500/50",
  };

  return (
    <div
      class={`rounded-lg border p-4 ${colorClasses[color]}`}
    >
      <div class="text-gray-400 text-sm mb-1">{label}</div>
      <div class="text-2xl font-bold text-white">{value}</div>
      {subtext && <div class="text-gray-500 text-xs mt-1">{subtext}</div>}
    </div>
  );
}

/** Section header component */
function SectionHeader({ title }: { title: string }) {
  return (
    <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
      <span class="w-1 h-6 bg-blue-500 rounded"></span>
      {title}
    </h2>
  );
}

export default function AdminDashboardIsland({
  analytics: initialAnalytics,
  initialTimeRange,
}: AdminDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(initialTimeRange);
  const [analytics, setAnalytics] = useState<AdminAnalytics>(initialAnalytics);
  const [loading, setLoading] = useState(false);

  // Fetch new analytics when time range changes
  async function handleTimeRangeChange(newRange: TimeRange) {
    if (newRange === timeRange) return;

    setLoading(true);
    setTimeRange(newRange);

    try {
      const response = await fetch(`/api/admin/analytics?timeRange=${newRange}`);
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  }

  const { userActivity, systemUsage, errorHealth, resources, technical } =
    analytics;

  return (
    <div class={loading ? "opacity-50 pointer-events-none" : ""}>
      {/* Time Range Selector */}
      <div class="flex items-center justify-between mb-6">
        <div class="flex gap-2">
          {(["24h", "7d", "30d"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => handleTimeRangeChange(range)}
              class={`px-4 py-2 rounded-lg font-medium transition-colors ${
                timeRange === range
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {range}
            </button>
          ))}
        </div>
        <div class="text-gray-500 text-sm">
          Generated: {new Date(analytics.generatedAt).toLocaleString()}
        </div>
      </div>

      {/* User Activity Section */}
      <section class="mb-8">
        <SectionHeader title="User Activity" />
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <MetricCard
            label="Active Users"
            value={formatNumber(userActivity.activeUsers)}
            color="blue"
          />
          <MetricCard
            label="DAU"
            value={formatNumber(userActivity.dailyActiveUsers)}
            subtext="Daily Active"
            color="blue"
          />
          <MetricCard
            label="WAU"
            value={formatNumber(userActivity.weeklyActiveUsers)}
            subtext="Weekly Active"
            color="blue"
          />
          <MetricCard
            label="MAU"
            value={formatNumber(userActivity.monthlyActiveUsers)}
            subtext="Monthly Active"
            color="blue"
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <MetricCard
            label="New Registrations"
            value={formatNumber(userActivity.newRegistrations)}
            color="green"
          />
          <MetricCard
            label="Returning Users"
            value={formatNumber(userActivity.returningUsers)}
            color="purple"
          />
        </div>

        {/* Top Users Table */}
        {userActivity.topUsers.length > 0 && (
          <div class="mt-4 bg-gray-800/50 rounded-lg p-4">
            <h3 class="text-sm font-medium text-gray-400 mb-3">Top Users</h3>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-gray-500 border-b border-gray-700">
                  <th class="text-left py-2">User</th>
                  <th class="text-right py-2">Executions</th>
                  <th class="text-right py-2">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {userActivity.topUsers.map((user, i) => (
                  <tr key={i} class="border-b border-gray-800">
                    <td class="py-2 text-white">{user.username}</td>
                    <td class="py-2 text-right text-gray-300">
                      {formatNumber(user.executionCount)}
                    </td>
                    <td class="py-2 text-right text-gray-500">
                      {new Date(user.lastActive).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* System Usage Section */}
      <section class="mb-8">
        <SectionHeader title="System Usage" />
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard
            label="Total Executions"
            value={formatNumber(systemUsage.totalExecutions)}
            color="green"
          />
          <MetricCard
            label="Capability Executions"
            value={formatNumber(systemUsage.capabilityExecutions)}
            color="green"
          />
          <MetricCard
            label="DAG Executions"
            value={formatNumber(systemUsage.dagExecutions)}
            color="purple"
          />
          <MetricCard
            label="Unique Capabilities"
            value={formatNumber(systemUsage.uniqueCapabilities)}
            color="blue"
          />
          <MetricCard
            label="Avg per User"
            value={formatNumber(systemUsage.avgExecutionsPerUser)}
            color="blue"
          />
        </div>

        {/* Daily Chart (simple bar representation) */}
        {systemUsage.executionsByDay.length > 0 && (
          <div class="mt-4 bg-gray-800/50 rounded-lg p-4">
            <h3 class="text-sm font-medium text-gray-400 mb-3">
              Executions by Day
            </h3>
            <div class="flex items-end gap-1 h-24">
              {systemUsage.executionsByDay.map((day, i) => {
                const max = Math.max(
                  ...systemUsage.executionsByDay.map((d) => d.count),
                );
                const height = max > 0 ? (day.count / max) * 100 : 0;
                return (
                  <div
                    key={i}
                    class="flex-1 bg-blue-500/50 hover:bg-blue-500 transition-colors rounded-t"
                    style={{ height: `${height}%` }}
                    title={`${day.date}: ${day.count} executions`}
                  />
                );
              })}
            </div>
            <div class="flex justify-between text-xs text-gray-500 mt-1">
              <span>{systemUsage.executionsByDay[0]?.date}</span>
              <span>
                {systemUsage.executionsByDay[
                  systemUsage.executionsByDay.length - 1
                ]?.date}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Error & Health Section */}
      <section class="mb-8">
        <SectionHeader title="Errors & Health" />
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Error Rate"
            value={formatPercent(errorHealth.errorRate)}
            subtext={`${errorHealth.failedExecutions} / ${errorHealth.totalExecutions}`}
            color={errorHealth.errorRate > 0.1 ? "red" : "green"}
          />
          <MetricCard
            label="p50 Latency"
            value={formatMs(errorHealth.latencyPercentiles.p50)}
            color="blue"
          />
          <MetricCard
            label="p95 Latency"
            value={formatMs(errorHealth.latencyPercentiles.p95)}
            color="yellow"
          />
          <MetricCard
            label="p99 Latency"
            value={formatMs(errorHealth.latencyPercentiles.p99)}
            color={errorHealth.latencyPercentiles.p99 > 5000 ? "red" : "yellow"}
          />
        </div>

        {/* Errors by Type */}
        {errorHealth.errorsByType.length > 0 && (
          <div class="mt-4 bg-gray-800/50 rounded-lg p-4">
            <h3 class="text-sm font-medium text-gray-400 mb-3">Errors by Type</h3>
            <div class="space-y-2">
              {errorHealth.errorsByType.map((err, i) => (
                <div key={i} class="flex items-center justify-between">
                  <span class="text-gray-300 capitalize">{err.errorType}</span>
                  <span class="text-red-400 font-mono">{err.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Resources Section */}
      <section class="mb-8">
        <SectionHeader title="Resources" />
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard
            label="Total Users"
            value={formatNumber(resources.totalUsers)}
            color="blue"
          />
          <MetricCard
            label="Capabilities"
            value={formatNumber(resources.totalCapabilities)}
            color="purple"
          />
          <MetricCard
            label="Traces"
            value={formatNumber(resources.totalTraces)}
            color="green"
          />
          <MetricCard
            label="Graph Nodes"
            value={formatNumber(resources.graphNodes)}
            color="blue"
          />
          <MetricCard
            label="Graph Edges"
            value={formatNumber(resources.graphEdges)}
            color="blue"
          />
        </div>
      </section>

      {/* Technical/ML Section */}
      <section class="mb-8">
        <SectionHeader title="Technical / ML" />

        {/* SHGAT Status */}
        <div class="mb-4">
          <h3 class="text-sm font-medium text-gray-400 mb-2">SHGAT Model</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <MetricCard
              label="Status"
              value={technical.shgat.hasParams ? "Trained" : "Not trained"}
              color={technical.shgat.hasParams ? "green" : "yellow"}
            />
            <MetricCard
              label="Users with Params"
              value={formatNumber(technical.shgat.usersWithParams)}
              color="blue"
            />
            <MetricCard
              label="Last Updated"
              value={
                technical.shgat.lastUpdated
                  ? new Date(technical.shgat.lastUpdated).toLocaleDateString()
                  : "Never"
              }
              color="purple"
            />
          </div>
        </div>

        {/* Algorithm Traces */}
        <div class="mb-4">
          <h3 class="text-sm font-medium text-gray-400 mb-2">
            Algorithm Decisions
          </h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Total Traces"
              value={formatNumber(technical.algorithms.totalTraces)}
              color="blue"
            />
            <MetricCard
              label="Avg Score"
              value={technical.algorithms.avgFinalScore.toFixed(3)}
              color="purple"
            />
            <MetricCard
              label="Avg Threshold"
              value={technical.algorithms.avgThreshold.toFixed(3)}
              color="yellow"
            />
            <MetricCard
              label="Accept Rate"
              value={formatPercent(
                technical.algorithms.byDecision.find((d) =>
                  d.decision === "accept"
                )
                    ?.count /
                    Math.max(technical.algorithms.totalTraces, 1) || 0,
              )}
              color="green"
            />
          </div>

          {/* By Mode & Decision breakdown */}
          {(technical.algorithms.byMode.length > 0 ||
            technical.algorithms.byDecision.length > 0) && (
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {technical.algorithms.byMode.length > 0 && (
                <div class="bg-gray-800/50 rounded-lg p-4">
                  <h4 class="text-xs font-medium text-gray-500 mb-2">By Mode</h4>
                  <div class="space-y-1">
                    {technical.algorithms.byMode.map((m, i) => (
                      <div key={i} class="flex justify-between text-sm">
                        <span class="text-gray-300">{m.mode}</span>
                        <span class="text-gray-400 font-mono">{m.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {technical.algorithms.byDecision.length > 0 && (
                <div class="bg-gray-800/50 rounded-lg p-4">
                  <h4 class="text-xs font-medium text-gray-500 mb-2">
                    By Decision
                  </h4>
                  <div class="space-y-1">
                    {technical.algorithms.byDecision.map((d, i) => (
                      <div key={i} class="flex justify-between text-sm">
                        <span class="text-gray-300">{d.decision}</span>
                        <span class="text-gray-400 font-mono">{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Capability Registry */}
        <div>
          <h3 class="text-sm font-medium text-gray-400 mb-2">
            Capability Registry
          </h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Total Records"
              value={formatNumber(technical.capabilities.totalRecords)}
              color="purple"
            />
            <MetricCard
              label="Verified"
              value={formatNumber(technical.capabilities.verifiedCount)}
              color="green"
            />
            <MetricCard
              label="Total Usage"
              value={formatNumber(technical.capabilities.totalUsageCount)}
              color="blue"
            />
            <MetricCard
              label="Success Rate"
              value={formatPercent(technical.capabilities.successRate)}
              color={technical.capabilities.successRate > 0.8 ? "green" : "yellow"}
            />
          </div>

          {/* By Visibility & Routing */}
          {(technical.capabilities.byVisibility.length > 0 ||
            technical.capabilities.byRouting.length > 0) && (
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {technical.capabilities.byVisibility.length > 0 && (
                <div class="bg-gray-800/50 rounded-lg p-4">
                  <h4 class="text-xs font-medium text-gray-500 mb-2">
                    By Visibility
                  </h4>
                  <div class="space-y-1">
                    {technical.capabilities.byVisibility.map((v, i) => (
                      <div key={i} class="flex justify-between text-sm">
                        <span class="text-gray-300">{v.visibility}</span>
                        <span class="text-gray-400 font-mono">{v.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {technical.capabilities.byRouting.length > 0 && (
                <div class="bg-gray-800/50 rounded-lg p-4">
                  <h4 class="text-xs font-medium text-gray-500 mb-2">
                    By Routing
                  </h4>
                  <div class="space-y-1">
                    {technical.capabilities.byRouting.map((r, i) => (
                      <div key={i} class="flex justify-between text-sm">
                        <span class="text-gray-300">{r.routing}</span>
                        <span class="text-gray-400 font-mono">{r.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
