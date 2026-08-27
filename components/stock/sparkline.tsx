import type { CandlePoint } from "@/lib/market-data/types";

export function Sparkline({
  points,
  positive,
  width = 120,
  height = 40,
}: {
  points: CandlePoint[];
  positive: boolean;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return <div style={{ width, height }} />;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = values.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / range) * height;
    return [x, y] as const;
  });

  const linePath = coords
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  const color = positive ? "#10b981" : "#ef4444";
  const gradientId = `spark-${positive ? "up" : "down"}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
