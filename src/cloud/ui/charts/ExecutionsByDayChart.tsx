/**
 * ExecutionsByDayChart - ECharts bar chart for daily executions
 *
 * Cloud-only: used by admin analytics dashboard.
 *
 * @module cloud/ui/charts/ExecutionsByDayChart
 */

import { useEffect, useRef } from "preact/hooks";
import type { DailyCount } from "../../admin/types.ts";

// ECharts type declaration
declare global {
  interface Window {
    echarts: typeof import("echarts");
  }
}

interface ExecutionsByDayChartProps {
  data: DailyCount[];
  height?: string;
}

export default function ExecutionsByDayChart({
  data,
  height = "200px",
}: ExecutionsByDayChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ReturnType<typeof window.echarts.init> | null>(
    null,
  );

  useEffect(() => {
    if (!chartRef.current || !window.echarts || data.length === 0) return;

    // Initialize or get existing chart
    if (!chartInstance.current) {
      chartInstance.current = window.echarts.init(chartRef.current, "dark");
    }

    const option = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "rgba(30, 30, 30, 0.9)",
        borderColor: "#444",
        textStyle: { color: "#fff" },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "3%",
        top: "10%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: data.map((d) => d.date),
        axisLine: { lineStyle: { color: "#444" } },
        axisLabel: { color: "#888", fontSize: 10 },
      },
      yAxis: {
        type: "value",
        axisLine: { lineStyle: { color: "#444" } },
        axisLabel: { color: "#888" },
        splitLine: { lineStyle: { color: "#333" } },
      },
      series: [
        {
          name: "Executions",
          type: "bar",
          data: data.map((d) => d.count),
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#3b82f6" },
                { offset: 1, color: "#1d4ed8" },
              ],
            },
            borderRadius: [4, 4, 0, 0],
          },
          emphasis: {
            itemStyle: { color: "#60a5fa" },
          },
        },
      ],
    };

    chartInstance.current.setOption(option);

    // Handle resize
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [data]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
    };
  }, []);

  if (data.length === 0) return null;

  return <div ref={chartRef} style={{ width: "100%", height }} />;
}
