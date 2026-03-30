interface GaugeProps {
  percentage: number;
  label: string;
  color: string;
  size?: number;
}

export default function Gauge({ percentage, label, color, size = 160 }: GaugeProps) {
  const clampedPct = Math.max(0, Math.min(100, percentage));

  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1 rounded-full bg-muted/50 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${clampedPct}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-xs font-mono text-muted-foreground tabular-nums w-8 text-right">
          {Math.round(clampedPct)}%
        </span>
      </div>
      {label && (
        <p className="text-[10px] font-medium text-muted-foreground mt-1">{label}</p>
      )}
    </div>
  );
}
