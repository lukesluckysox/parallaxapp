import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, ArrowUp, ArrowDown, Minus, Compass } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import FutureSelf from "@/components/FutureSelf";
import ArchetypeBrowser from "@/components/ArchetypeBrowser";
import { ARCHETYPE_MAP, DIMENSIONS, type DimensionVec } from "@shared/archetypes";
import { defaultVec } from "@shared/archetype-math";
import type { Checkin } from "@shared/schema";

// ── Mythology Data ────────────────────────────────────────────
interface MythologyData {
  empty?: boolean;
  arc_name?: string;
  narrative?: string;
  baseline_archetype?: string;
  current_archetype?: string;
  emerging_archetype?: string;
  observation?: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  focus: "Focus", calm: "Calm", discipline: "Discipline", health: "Health",
  social: "Social", creativity: "Creativity", exploration: "Exploration", ambition: "Ambition",
};

// ── Trajectory Path ───────────────────────────────────────────
function TrajectoryPath() {
  const { data, isLoading } = useQuery<MythologyData>({
    queryKey: ["/api/mythology"],
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-bold">Trajectory Path</h2>
        <div className="animate-pulse space-y-3 p-4 rounded-[10px] border border-border bg-card">
          <div className="h-10 bg-muted rounded w-2/3" />
          <div className="h-10 bg-muted rounded w-2/3" />
          <div className="h-10 bg-muted rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (!data || data.empty) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-bold">Trajectory Path</h2>
        <div className="p-4 rounded-[10px] border border-dashed border-border bg-card/50 text-center">
          <Compass className="w-5 h-5 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            Save a few check-ins to unlock your trajectory path.
          </p>
        </div>
      </div>
    );
  }

  const baseline = data.baseline_archetype ? ARCHETYPE_MAP[data.baseline_archetype] : null;
  const current = data.current_archetype ? ARCHETYPE_MAP[data.current_archetype] : null;
  const emerging = data.emerging_archetype ? ARCHETYPE_MAP[data.emerging_archetype] : null;

  const nodes = [
    { arch: baseline, label: "Baseline", sublabel: "Where you started", symbol: "○" },
    { arch: current, label: "Current", sublabel: "Where you are now", symbol: "●" },
    { arch: emerging, label: "Emerging", sublabel: "Where you're heading", symbol: "◎" },
  ].filter(n => n.arch);

  return (
    <div className="space-y-2" data-testid="card-trajectory-path">
      <h2 className="text-sm font-bold">Trajectory Path</h2>
      <div className="p-4 rounded-[10px] border border-border bg-card">
        <div className="space-y-0">
          {nodes.map((node, i) => (
            <div key={node.label} className="flex items-start gap-3">
              {/* Vertical timeline line + node */}
              <div className="flex flex-col items-center flex-shrink-0" style={{ width: "20px" }}>
                <div
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold"
                  style={{
                    borderColor: node.arch!.color,
                    backgroundColor: node.label === "Current" ? node.arch!.color : "transparent",
                    color: node.label === "Current" ? "white" : node.arch!.color,
                  }}
                >
                  {node.symbol === "●" ? "" : ""}
                </div>
                {i < nodes.length - 1 && (
                  <div className="w-0.5 h-8 bg-border" />
                )}
              </div>
              {/* Content */}
              <div className="pb-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-display" style={{ color: node.arch!.color }}>{node.arch!.emoji}</span>
                  <span className="text-sm font-medium" style={{ color: node.arch!.color }}>
                    {node.arch!.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{node.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{node.sublabel}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Behavioral Drivers ────────────────────────────────────────
function BehavioralDrivers() {
  const { data: checkins = [] } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins"],
  });

  const trends = useMemo(() => {
    if (checkins.length < 2) return null;

    const recent = checkins.slice(0, Math.min(5, checkins.length));
    const older = checkins.slice(Math.min(5, checkins.length), Math.min(10, checkins.length));

    if (older.length === 0) return null;

    // Compute average self_vec for recent and older
    const avgVec = (items: Checkin[]): DimensionVec => {
      const sum = defaultVec();
      let count = 0;
      for (const c of items) {
        try {
          const vec = JSON.parse(c.self_vec);
          for (const dim of DIMENSIONS) {
            sum[dim] = (sum[dim] || 0) + (vec[dim] || 50);
          }
          count++;
        } catch { /* skip */ }
      }
      if (count === 0) return defaultVec();
      const result = {} as DimensionVec;
      for (const dim of DIMENSIONS) {
        result[dim] = Math.round(sum[dim] / count);
      }
      return result;
    };

    const recentAvg = avgVec(recent);
    const olderAvg = avgVec(older);

    return DIMENSIONS.map(dim => {
      const diff = recentAvg[dim] - olderAvg[dim];
      const direction = diff > 5 ? "up" : diff < -5 ? "down" : "stable";
      return { dim, diff, direction, recent: recentAvg[dim], older: olderAvg[dim] };
    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [checkins]);

  if (!trends) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-bold">Behavioral Drivers</h2>
        <div className="p-4 rounded-[10px] border border-dashed border-border bg-card/50 text-center">
          <p className="text-xs text-muted-foreground">
            Need at least 2 check-ins to detect behavioral trends.
          </p>
        </div>
      </div>
    );
  }

  const movers = trends.filter(t => t.direction !== "stable");
  const stable = trends.filter(t => t.direction === "stable");

  return (
    <div className="space-y-2" data-testid="card-behavioral-drivers">
      <h2 className="text-sm font-bold">Behavioral Drivers</h2>
      <div className="grid grid-cols-2 gap-2">
        {movers.map(t => (
          <div
            key={t.dim}
            data-testid={`card-trend-${t.dim}`}
            className={`p-2.5 rounded-[10px] border text-xs ${
              t.direction === "up"
                ? "border-green-500/20 bg-green-500/5"
                : "border-red-500/20 bg-red-500/5"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {t.direction === "up" ? (
                <ArrowUp className="w-3 h-3 text-green-600" />
              ) : (
                <ArrowDown className="w-3 h-3 text-red-500" />
              )}
              <span className="font-medium">{DIMENSION_LABELS[t.dim]}</span>
            </div>
            <span className={`text-[10px] tabular-nums ${t.direction === "up" ? "text-green-600" : "text-red-500"}`}>
              {t.diff > 0 ? "+" : ""}{t.diff} pts
            </span>
          </div>
        ))}
        {stable.map(t => (
          <div
            key={t.dim}
            data-testid={`card-trend-${t.dim}`}
            className="p-2.5 rounded-[10px] border border-border bg-card text-xs"
          >
            <div className="flex items-center gap-1.5">
              <Minus className="w-3 h-3 text-muted-foreground" />
              <span className="font-medium text-muted-foreground">{DIMENSION_LABELS[t.dim]}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Stable</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Narrative Projection ──────────────────────────────────────
function NarrativeProjection() {
  const { data: mythology } = useQuery<MythologyData>({
    queryKey: ["/api/mythology"],
  });
  const { data: checkins = [] } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins"],
  });

  if (!mythology || mythology.empty) return null;

  const emerging = mythology.emerging_archetype ? ARCHETYPE_MAP[mythology.emerging_archetype] : null;

  return (
    <div className="space-y-2" data-testid="card-narrative-projection">
      <h2 className="text-sm font-bold">Narrative Projection</h2>
      <div className="p-4 rounded-[10px] border border-border bg-card space-y-2">
        {mythology.arc_name && (
          <h3 className="text-base font-bold tracking-tight">{mythology.arc_name}</h3>
        )}
        {mythology.narrative && (
          <p className="text-sm text-muted-foreground leading-relaxed font-serif italic">
            {mythology.narrative}
          </p>
        )}
        {checkins.length >= 5 && emerging && (
          <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
            If current patterns continue, your dominant archetype in 2-4 weeks is likely to shift toward{" "}
            <span className="font-medium" style={{ color: emerging.color }}>
              <span className="font-display">{emerging.emoji}</span> {emerging.name}
            </span>.
          </p>
        )}
        {checkins.length < 5 && (
          <p className="text-xs text-muted-foreground/60 pt-1 border-t border-border/50">
            Save more check-ins to unlock trajectory projections. The system needs at least 3-5 data points to detect trends.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Current Self Vec (derived from latest checkin) ────────────
function useLatestSelfVec(): DimensionVec {
  const { data: checkins = [] } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins"],
  });

  return useMemo(() => {
    if (checkins.length > 0) {
      try {
        return JSON.parse(checkins[0].self_vec);
      } catch { /* fallback */ }
    }
    return defaultVec();
  }, [checkins]);
}

// ── Main Trajectory Page ──────────────────────────────────────
export default function TrajectoryPage() {
  const selfVec = useLatestSelfVec();

  return (
    <div className="min-h-screen bg-background pb-20 noise-overlay">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back-home"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Home
          </Link>
          <h1 className="text-base font-bold" data-testid="text-page-title">Motion</h1>
          <ThemeToggle />
        </header>

        {/* Trajectory Path */}
        <TrajectoryPath />

        {/* Behavioral Drivers */}
        <BehavioralDrivers />

        {/* Future Self Selector */}
        <FutureSelf selfVec={selfVec} />

        {/* Archetype Browser */}
        <ArchetypeBrowser selfVec={selfVec} />

        {/* Narrative Projection */}
        <NarrativeProjection />
      </div>
    </div>
  );
}
