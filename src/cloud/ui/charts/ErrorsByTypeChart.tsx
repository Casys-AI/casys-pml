/**
 * ErrorsByTypeChart - ECharts pie chart for errors by type
 *
 * Cloud-only: used by admin analytics dashboard.
 *
 * @module cloud/ui/charts/ErrorsByTypeChart
 */

import { useEffect, useRef } from "preact/hooks";
import type { ErrorTypeCount } from "../../admin/types.ts";

// ECharts type declaration
declare global {
  interface Window {
    echarts: typeof import("echarts");
  }
}

interface ErrorsByTypeChartProps {
  data: ErrorTypeCount[];
  height?: string;
}

const ERROR_COLORS: Record<string, string> = {
  timeout: "#f59e0b",
  permission: "#ef4444",
  rate_limit: "#8b5cf6",
  not_found: "#6b7280",
  runtime: "#ec4899",
};

export default function ErrorsByTypeChart({
  data,
  height = "200px",
}: ErrorsByTypeChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ReturnType<typeof window.echarts.init> | null>(
    null,
  );

  useEffect(() => {
    if (!chartRef.current || !window.echarts || data.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = window.echarts.init(chartRef.current, "dark");
    }

    const option = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(30, 30, 30, 0.9)",
        borderColor: "#444",
        textStyle: { color: "#fff" },
        formatter: "{b}: {c} ({d}%)",
      },
      legend: {
        orient: "vertical",
        right: "5%",
        top: "center",
        textStyle: { color: "#888" },
      },
      series: [
        {
          name: "Error Type",
          type: "pie",
          radius: ["40%", "70%"],
          center: ["35%", "50%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 6,
            borderColor: "#1f2937",
            borderWidth: 2,
          },
          label: { show: false },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: "bold",
              color: "#fff",
            },
          },
          labelLine: { show: false },
          data: data.map((d) => ({
            value: d.count,
            name: d.errorType,
            itemStyle: {
              color: ERROR_COLORS[d.errorType] || "#6b7280",
            },
          })),
        },
      ],
    };

    chartInstance.current.setOption(option);

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [data]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
    };
  }, []);

  if (data.length === 0) return null;

  return <div ref={chartRef} style={{ width: "100%", height }} />;
}
