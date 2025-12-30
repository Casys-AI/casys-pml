/**
 * LatencyGaugeChart - ECharts gauge for latency percentiles
 *
 * @module web/components/ui/molecules/charts/LatencyGaugeChart
 */

import { useEffect, useRef } from "preact/hooks";

// ECharts type declaration
declare global {
  interface Window {
    echarts: typeof import("echarts");
  }
}

interface LatencyGaugeChartProps {
  p50: number;
  p95: number;
  p99: number;
  height?: string;
}

export default function LatencyGaugeChart({
  p50,
  p95,
  p99,
  height = "150px",
}: LatencyGaugeChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ReturnType<typeof window.echarts.init> | null>(
    null,
  );

  useEffect(() => {
    if (!chartRef.current || !window.echarts) return;

    if (!chartInstance.current) {
      chartInstance.current = window.echarts.init(chartRef.current, "dark");
    }

    // Max for gauge scale (rounded up to nearest 1000)
    const maxLatency = Math.max(p99 * 1.2, 1000);

    const option = {
      backgroundColor: "transparent",
      tooltip: {
        backgroundColor: "rgba(30, 30, 30, 0.9)",
        borderColor: "#444",
        textStyle: { color: "#fff" },
      },
      series: [
        {
          type: "gauge",
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: maxLatency,
          splitNumber: 4,
          center: ["50%", "75%"],
          radius: "90%",
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: [
                { offset: 0, color: "#22c55e" },
                { offset: 0.5, color: "#eab308" },
                { offset: 1, color: "#ef4444" },
              ],
            },
          },
          progress: {
            show: true,
            width: 12,
          },
          pointer: {
            show: false,
          },
          axisLine: {
            lineStyle: {
              width: 12,
              color: [[1, "#333"]],
            },
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: {
            distance: 15,
            color: "#888",
            fontSize: 10,
            formatter: (value: number) =>
              value >= 1000 ? `${(value / 1000).toFixed(0)}s` : `${value}ms`,
          },
          anchor: { show: false },
          title: { show: false },
          detail: {
            valueAnimation: true,
            width: "60%",
            lineHeight: 40,
            borderRadius: 8,
            offsetCenter: [0, "-15%"],
            fontSize: 20,
            fontWeight: "bold",
            formatter: `p95: ${p95 >= 1000 ? (p95 / 1000).toFixed(1) + "s" : p95 + "ms"}`,
            color: p95 > 2000 ? "#ef4444" : p95 > 500 ? "#eab308" : "#22c55e",
          },
          data: [{ value: p95, name: "p95" }],
        },
      ],
    };

    chartInstance.current.setOption(option);

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [p50, p95, p99]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
    };
  }, []);

  return <div ref={chartRef} style={{ width: "100%", height }} />;
}
