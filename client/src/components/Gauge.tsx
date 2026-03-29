interface GaugeProps {
  percentage: number;
  label: string;
  color: string;
  size?: number;
}

export default function Gauge({ percentage, label, color, size = 160 }: GaugeProps) {
  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2 + radius * 0.1; // slight offset down for half circle

  // Half circle arc (180 degrees, from left to right)
  const startAngle = Math.PI; // 180 degrees (left)
  const endAngle = 0; // 0 degrees (right)

  // Background track arc path
  const bgStartX = cx + radius * Math.cos(startAngle);
  const bgStartY = cy + radius * Math.sin(startAngle);
  const bgEndX = cx + radius * Math.cos(endAngle);
  const bgEndY = cy + radius * Math.sin(endAngle);
  const bgPath = `M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 0 1 ${bgEndX} ${bgEndY}`;

  // Progress arc
  const clampedPct = Math.max(0, Math.min(100, percentage));
  const progressAngle = Math.PI - (clampedPct / 100) * Math.PI;
  const progEndX = cx + radius * Math.cos(progressAngle);
  const progEndY = cy + radius * Math.sin(progressAngle);
  const largeArc = clampedPct > 50 ? 1 : 0;
  const progressPath = `M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 ${largeArc} 1 ${progEndX} ${progEndY}`;

  // Needle
  const needleLength = radius * 0.8;
  const needleAngle = Math.PI - (clampedPct / 100) * Math.PI;
  const needleEndX = cx + needleLength * Math.cos(needleAngle);
  const needleEndY = cy + needleLength * Math.sin(needleAngle);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
        {/* Background track */}
        <path
          d={bgPath}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        {clampedPct > 0 && (
          <path
            d={progressPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needleEndX}
          y2={needleEndY}
          stroke="hsl(var(--foreground))"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={strokeWidth * 0.4} fill="hsl(var(--foreground))" />
        {/* Percentage text */}
        <text
          x={cx}
          y={cy - radius * 0.15}
          textAnchor="middle"
          fontSize={size * 0.14}
          fontWeight={700}
          fill="hsl(var(--foreground))"
          fontFamily="var(--font-sans)"
        >
          {Math.round(clampedPct)}%
        </text>
      </svg>
      <p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
