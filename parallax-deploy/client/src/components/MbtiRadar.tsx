interface MbtiRadarProps {
  extraversion: number;  // 0-100
  intuition: number;     // 0-100
  feeling: number;       // 0-100
  perceiving: number;    // 0-100
  type: string;          // e.g. "INFP"
}

export default function MbtiRadar({ extraversion, intuition, feeling, perceiving, type }: MbtiRadarProps) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 68;

  // 4 axes: top (E/I), right (N/S), bottom (F/T), left (P/J)
  // Angles: top=270°, right=0°, bottom=90°, left=180°
  const axes = [
    { angle: -90, value: extraversion, labelHigh: "E", labelLow: "I" },
    { angle: 0, value: intuition, labelHigh: "N", labelLow: "S" },
    { angle: 90, value: feeling, labelHigh: "F", labelLow: "T" },
    { angle: 180, value: perceiving, labelHigh: "P", labelLow: "J" },
  ];

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Compute polygon points for user data
  const dataPoints = axes.map((a) => {
    const r = (a.value / 100) * maxR;
    return {
      x: cx + r * Math.cos(toRad(a.angle)),
      y: cy + r * Math.sin(toRad(a.angle)),
    };
  });
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[200px] mx-auto"
      role="img"
      aria-label={`MBTI radar chart: ${type}`}
    >
      {/* Grid rings */}
      {rings.map((r) => (
        <polygon
          key={r}
          points={axes
            .map((a) => {
              const rad = r * maxR;
              return `${cx + rad * Math.cos(toRad(a.angle))},${cy + rad * Math.sin(toRad(a.angle))}`;
            })
            .join(" ")}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="0.5"
          opacity={r === 0.5 ? "0.8" : "0.4"}
        />
      ))}

      {/* Axis lines */}
      {axes.map((a, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + maxR * Math.cos(toRad(a.angle))}
          y2={cy + maxR * Math.sin(toRad(a.angle))}
          stroke="hsl(var(--border))"
          strokeWidth="0.5"
        />
      ))}

      {/* Data polygon */}
      <path d={dataPath} fill="hsl(var(--primary))" fillOpacity="0.15" stroke="hsl(var(--primary))" strokeWidth="1.5" />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="hsl(var(--primary))" />
      ))}

      {/* Axis labels */}
      {axes.map((a, i) => {
        const labelR = maxR + 14;
        const lx = cx + labelR * Math.cos(toRad(a.angle));
        const ly = cy + labelR * Math.sin(toRad(a.angle));
        return (
          <g key={i}>
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9"
              fontWeight="600"
              fill="hsl(var(--foreground))"
            >
              {a.value >= 50 ? a.labelHigh : a.labelLow}
            </text>
            <text
              x={lx}
              y={ly + 10}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="6"
              fill="hsl(var(--muted-foreground))"
            >
              {a.value >= 50 ? a.labelLow : a.labelHigh}
            </text>
          </g>
        );
      })}

      {/* MBTI type in center */}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="16"
        fontWeight="700"
        fill="hsl(var(--foreground))"
        letterSpacing="1"
      >
        {type}
      </text>
    </svg>
  );
}
