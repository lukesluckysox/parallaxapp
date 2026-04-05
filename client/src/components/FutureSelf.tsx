import { useState } from "react";
import { ARCHETYPES, DIMENSIONS, type DimensionVec } from "@shared/archetypes";
import Gauge from "./Gauge";

// Alignment = how close your current vec is to the archetype's target
// Uses normalized distance: 100% = perfect match, 0% = maximally distant
function computeAlignment(selfVec: DimensionVec, target: DimensionVec): number {
  let sumSqDiff = 0;
  for (const dim of DIMENSIONS) {
    const diff = (selfVec[dim] || 50) - (target[dim] || 50);
    sumSqDiff += diff * diff;
  }
  // Max possible distance: all dims differ by 100 = sqrt(8 * 10000) ≈ 283
  const maxDist = Math.sqrt(DIMENSIONS.length * 10000);
  const dist = Math.sqrt(sumSqDiff);
  // Convert to 0-100 percentage (100 = identical)
  return Math.round(Math.max(0, (1 - dist / maxDist) * 100));
}

interface FutureSelfProps {
  selfVec: DimensionVec;
}

export default function FutureSelf({ selfVec }: FutureSelfProps) {
  const [targetKey, setTargetKey] = useState<string>("");
  const target = ARCHETYPES.find(a => a.key === targetKey);
  const alignmentPct = target ? computeAlignment(selfVec, target.target) : 0;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold">Future self</h2>

      <div className="relative">
        <select
          data-testid="select-future-self"
          value={targetKey}
          onChange={(e) => setTargetKey(e.target.value)}
          className="w-full px-3 py-2 rounded-[10px] border border-border bg-card text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Pick a target archetype...</option>
          {ARCHETYPES.map(a => (
            <option key={a.key} value={a.key}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {target && (
        <div
          data-testid={`card-future-${target.key}`}
          className="p-4 rounded-[10px] border bg-card flex items-center gap-4"
          style={{ borderColor: `${target.color}30` }}
        >
          <Gauge percentage={alignmentPct} label="alignment" color={target.color} size={100} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-display" style={{ color: target.color }}>{target.emoji}</span>
              <span className="text-sm font-bold" style={{ color: target.color }}>{target.name}</span>
            </div>
            <p className="text-xs text-muted-foreground italic mb-2">{target.philosophy}</p>
            <p className="text-xs text-muted-foreground">
              You're <span className="font-medium text-foreground">{alignmentPct}%</span> aligned with the {target.name} archetype.
              {alignmentPct >= 80 && " You're living it."}
              {alignmentPct >= 60 && alignmentPct < 80 && " Strong alignment — keep going."}
              {alignmentPct >= 40 && alignmentPct < 60 && " Moderate alignment. Room to grow."}
              {alignmentPct < 40 && " Significant distance to close."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
