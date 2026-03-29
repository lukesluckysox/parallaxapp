import { useQuery } from "@tanstack/react-query";
import { ARCHETYPE_MAP } from "@shared/archetypes";
import { ArrowRight, Compass } from "lucide-react";

interface MythologyData {
  empty?: boolean;
  arc_name?: string;
  narrative?: string;
  baseline_archetype?: string;
  current_archetype?: string;
  emerging_archetype?: string;
  observation?: string;
}

export default function MythologyCard() {
  const { data, isLoading, isError } = useQuery<MythologyData>({
    queryKey: ["/api/mythology"],
  });

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="card-mythology-loading">
        <h2 className="text-sm font-bold">Current Arc</h2>
        <div className="p-4 rounded-[10px] border border-border bg-card animate-pulse">
          <div className="h-4 bg-muted rounded w-1/3 mb-3" />
          <div className="h-3 bg-muted rounded w-full mb-2" />
          <div className="h-3 bg-muted rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (isError || !data || data.empty) {
    return (
      <div className="space-y-2" data-testid="card-mythology-empty">
        <h2 className="text-sm font-bold">Current Arc</h2>
        <div className="p-4 rounded-[10px] border border-dashed border-border bg-card/50 text-center">
          <Compass className="w-5 h-5 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            Save a few check-ins to unlock your personal mythology.
          </p>
        </div>
      </div>
    );
  }

  const baseline = data.baseline_archetype ? ARCHETYPE_MAP[data.baseline_archetype] : null;
  const current = data.current_archetype ? ARCHETYPE_MAP[data.current_archetype] : null;
  const emerging = data.emerging_archetype ? ARCHETYPE_MAP[data.emerging_archetype] : null;

  return (
    <div className="space-y-3" data-testid="card-mythology">
      <h2 className="text-sm font-bold">Current Arc</h2>

      {/* Arc Name & Narrative */}
      <div className="p-4 rounded-[10px] border border-border bg-card">
        {data.arc_name && (
          <h3
            className="text-base font-bold tracking-tight mb-2"
            data-testid="text-arc-name"
          >
            {data.arc_name}
          </h3>
        )}
        {data.narrative && (
          <p className="text-sm text-muted-foreground leading-relaxed font-serif italic">
            {data.narrative}
          </p>
        )}
      </div>

      {/* Archetype Flow: Baseline → Current → Emerging */}
      {(baseline || current || emerging) && (
        <div className="flex items-center justify-center gap-2 flex-wrap py-2">
          {baseline && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-base font-display" style={{ color: baseline.color }}>{baseline.emoji}</span>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Baseline</p>
                <p className="font-medium" style={{ color: baseline.color }}>{baseline.name}</p>
              </div>
            </div>
          )}
          {baseline && current && (
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
          )}
          {current && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-base font-display" style={{ color: current.color }}>{current.emoji}</span>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Current</p>
                <p className="font-medium" style={{ color: current.color }}>{current.name}</p>
              </div>
            </div>
          )}
          {current && emerging && (
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
          )}
          {emerging && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-base font-display" style={{ color: emerging.color }}>{emerging.emoji}</span>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Emerging</p>
                <p className="font-medium" style={{ color: emerging.color }}>{emerging.name}</p>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
