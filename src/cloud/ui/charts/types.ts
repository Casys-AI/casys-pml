/**
 * Chart Types
 *
 * Shared types for ECharts-based visualization components.
 *
 * @module cloud/ui/charts/types
 */

/** ECharts instance type */
export type EChartsInstance = ReturnType<typeof window.echarts.init>;

/** Global Window augmentation for ECharts */
declare global {
  interface Window {
    echarts: typeof import("echarts");
  }
}
