interface PoliticalCompassProps {
  economic: number; // -10 to +10
  social: number;   // -10 to +10
}

export default function PoliticalCompass({ economic, social }: PoliticalCompassProps) {
  const size = 200;
  const pad = 28;
  const inner = size - pad * 2;
  const cx = pad + inner / 2;
  const cy = pad + inner / 2;

  // Map values to pixel coordinates
  // economic: -10 (left) → +10 (right) maps to pad → pad+inner
  // social: -10 (libertarian/bottom) → +10 (authoritarian/top) maps to pad+inner → pad
  const px = pad + ((economic + 10) / 20) * inner;
  const py = pad + ((10 - social) / 20) * inner;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[200px] mx-auto"
      role="img"
      aria-label={`Political compass: economic ${economic.toFixed(1)}, social ${social.toFixed(1)}`}
    >
      {/* Quadrant backgrounds */}
      <rect x={pad} y={pad} width={inner / 2} height={inner / 2} fill="hsl(var(--destructive))" opacity="0.06" />
      <rect x={cx} y={pad} width={inner / 2} height={inner / 2} fill="hsl(var(--chart-2))" opacity="0.06" />
      <rect x={pad} y={cy} width={inner / 2} height={inner / 2} fill="hsl(var(--chart-2))" opacity="0.06" />
      <rect x={cx} y={cy} width={inner / 2} height={inner / 2} fill="hsl(var(--chart-4))" opacity="0.06" />

      {/* Grid border */}
      <rect x={pad} y={pad} width={inner} height={inner} fill="none" stroke="hsl(var(--border))" strokeWidth="1" />

      {/* Crosshairs */}
      <line x1={cx} y1={pad} x2={cx} y2={pad + inner} stroke="hsl(var(--border))" strokeWidth="1" />
      <line x1={pad} y1={cy} x2={pad + inner} y2={cy} stroke="hsl(var(--border))" strokeWidth="1" />

      {/* Quadrant labels */}
      <text x={pad + inner * 0.25} y={pad + inner * 0.25} textAnchor="middle" dominantBaseline="middle" fontSize="6" fill="hsl(var(--muted-foreground))" opacity="0.5">Auth Left</text>
      <text x={pad + inner * 0.75} y={pad + inner * 0.25} textAnchor="middle" dominantBaseline="middle" fontSize="6" fill="hsl(var(--muted-foreground))" opacity="0.5">Auth Right</text>
      <text x={pad + inner * 0.25} y={pad + inner * 0.75} textAnchor="middle" dominantBaseline="middle" fontSize="6" fill="hsl(var(--muted-foreground))" opacity="0.5">Lib Left</text>
      <text x={pad + inner * 0.75} y={pad + inner * 0.75} textAnchor="middle" dominantBaseline="middle" fontSize="6" fill="hsl(var(--muted-foreground))" opacity="0.5">Lib Right</text>

      {/* Axis labels */}
      <text x={pad - 2} y={cy} textAnchor="end" dominantBaseline="middle" fontSize="7" fill="hsl(var(--muted-foreground))">Left</text>
      <text x={pad + inner + 2} y={cy} textAnchor="start" dominantBaseline="middle" fontSize="7" fill="hsl(var(--muted-foreground))">Right</text>
      <text x={cx} y={pad - 4} textAnchor="middle" fontSize="7" fill="hsl(var(--muted-foreground))">Auth</text>
      <text x={cx} y={pad + inner + 10} textAnchor="middle" fontSize="7" fill="hsl(var(--muted-foreground))">Lib</text>

      {/* User position dot */}
      <circle cx={px} cy={py} r="5" fill="hsl(var(--primary))" opacity="0.9" />
      <circle cx={px} cy={py} r="5" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" opacity="0.4">
        <animate attributeName="r" values="5;9;5" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.1;0.4" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
