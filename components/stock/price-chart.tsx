"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { CandlePoint } from "@/lib/market-data/types";

export function PriceChart({
  points,
  positive,
  height = 320,
}: {
  points: CandlePoint[];
  positive: boolean;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

    const color = positive ? "#10b981" : "#ef4444";

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#71717a",
        fontFamily: "var(--font-sans)",
      },
      grid: {
        horzLines: { color: "rgba(113,113,122,0.12)" },
        vertLines: { visible: false },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      crosshair: {
        vertLine: { color: color, width: 1, labelBackgroundColor: color },
        horzLine: { color: color, labelBackgroundColor: color },
      },
    });
    chartRef.current = chart;

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      lineWidth: 2,
      topColor: positive ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)",
      bottomColor: positive ? "rgba(16,185,129,0)" : "rgba(239,68,68,0)",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    series.setData(
      points.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      })),
    );

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [points, positive]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
