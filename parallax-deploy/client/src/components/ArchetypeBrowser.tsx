import { useState } from "react";
import { ARCHETYPES, type DimensionVec } from "@shared/archetypes";
import { computeMixture } from "@shared/archetype-math";
import Gauge from "./Gauge";

interface ArchetypeBrowserProps {
  selfVec: DimensionVec;
}

export default function ArchetypeBrowser({ selfVec }: ArchetypeBrowserProps) {
  const mixture = computeMixture(selfVec);
  const sorted = ARCHETYPES.map(a => ({ ...a, pct: mixture[a.key] || 0 })).sort((a, b) => b.pct - a.pct);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = sorted.find(a => a.key === selectedKey) || null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold">Archetype browser</h2>

      <div className="relative">
        <select
          data-testid="select-archetype-browser"
          value={selectedKey || ""}
          onChange={(e) => setSelectedKey(e.target.value || null)}
          className="w-full px-3 py-2 rounded-[10px] border border-border bg-card text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Select an archetype...</option>
          {sorted.map(a => (
            <option key={a.key} value={a.key}>
              {a.emoji} {a.name} — {a.pct}%
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {selected && (
        <div
          data-testid={`card-archetype-${selected.key}`}
          className="p-4 rounded-[10px] border bg-card space-y-3"
          style={{ borderColor: `${selected.color}30` }}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <Gauge percentage={selected.pct} label="" color={selected.color} size={80} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{selected.emoji}</span>
                <h3 className="text-sm font-bold" style={{ color: selected.color }}>{selected.name}</h3>
                <span className="text-xs text-muted-foreground">{selected.pct}%</span>
              </div>
              <p className="text-xs font-medium text-foreground/70 mb-1">{selected.coreDrive}</p>
              <p className="text-xs italic text-muted-foreground">{selected.philosophy}</p>
            </div>
          </div>

          {/* Subtypes */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground/80">Subtypes</p>
            <div className="flex flex-wrap gap-1.5">
              {selected.subtypes.map(sub => (
                <div
                  key={sub.key}
                  data-testid={`pill-subtype-${sub.key}`}
                  className="px-2.5 py-1.5 rounded-lg border text-xs bg-accent/50"
                  style={{ borderColor: `${selected.color}25` }}
                >
                  <span className="font-medium" style={{ color: selected.color }}>{sub.name}</span>
                  <span className="text-muted-foreground ml-1">— {sub.description}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-medium mb-0.5 text-foreground/80">Behavioral tells</p>
              <p className="text-muted-foreground leading-relaxed">{selected.tells}</p>
            </div>
            <div>
              <p className="font-medium mb-0.5 text-foreground/80">Decision lens</p>
              <p className="text-muted-foreground leading-relaxed">{selected.decision_lens}</p>
            </div>
            <div className="col-span-2">
              <p className="font-medium mb-0.5 text-foreground/80">Shadow</p>
              <p className="text-muted-foreground leading-relaxed">{selected.shadow}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
