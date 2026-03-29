interface MoralFoundationsProps {
  care: number;      // 0-1
  fairness: number;  // 0-1
  loyalty: number;   // 0-1
  authority: number; // 0-1
  sanctity: number;  // 0-1
  liberty: number;   // 0-1
}

export default function MoralFoundations({ care, fairness, loyalty, authority, sanctity, liberty }: MoralFoundationsProps) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 65;

  const foundations = [
    { label: "Care", value: care },
    { label: "Fairness", value: fairness },
    { label: "Loyalty", value: loyalty },
    { label: "Authority", value: authority },
    { label: "Sanctity", value: sanctity },
    { label: "Liberty", value: liberty },
  ];

  const n = foundations.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2; // Start from top

  const getPoint = (index: number, radius: number) => ({
    x: cx + radius * Math.cos(startAngle + index * angleStep),
    y: cy + radius * Math.sin(startAngle + index * angleStep),
  });

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Data polygon
  const dataPoints = foundations.map((f, i) => getPoint(i, f.value * maxR));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[200px] mx-auto"
      role="img"
      aria-label="Moral foundations hexagonal chart"
    >
      {/* Grid rings */}
      {rings.map((r) => {
        const ringPoints = foundations
          .map((_, i) => {
            const p = getPoint(i, r * maxR);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          })
          .join(" ");
        return (
          <polygon
            key={r}
            points={ringPoints}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
            opacity={r === 0.5 ? "0.8" : "0.4"}
          />
        );
      })}

      {/* Axis lines */}
      {foundations.map((_, i) => {
        const p = getPoint(i, maxR);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
          />
        );
      })}

      {/* Data polygon */}
      <path d={dataPath} fill="hsl(var(--chart-2))" fillOpacity="0.15" stroke="hsl(var(--chart-2))" strokeWidth="1.5" />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="hsl(var(--chart-2))" />
      ))}

      {/* Labels */}
      {foundations.map((f, i) => {
        const labelR = maxR + 16;
        const p = getPoint(i, labelR);
        return (
          <g key={i}>
            <text
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="7.5"
              fontWeight="500"
              fill="hsl(var(--foreground))"
            >
              {f.label}
            </text>
            <text
              x={p.x}
              y={p.y + 9}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="6"
              fill="hsl(var(--muted-foreground))"
            >
              {Math.round(f.value * 100)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
