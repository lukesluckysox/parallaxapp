import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, ArrowUp, ArrowDown, Minus, Compass, ChevronRight, ChevronDown, Dna } from "lucide-react";
import FutureSelf from "@/components/FutureSelf";
import InfoTooltip from "@/components/InfoTooltip";
import ArchetypeBrowser from "@/components/ArchetypeBrowser";
import TimeCapsule from "@/components/TimeCapsule";
import { GatedSection } from "@/components/SignalStrength";
import { ARCHETYPE_MAP, DIMENSIONS, type DimensionVec } from "@shared/archetypes";
import { defaultVec } from "@shared/archetype-math";
import type { Checkin } from "@shared/schema";

// ── Collapsible wrapper ─────────────────────────────────────
function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full group"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
        )}
        <span className="text-sm font-bold text-foreground/80 group-hover:text-foreground transition-colors">
          {title}
        </span>
      </button>
      {open && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Signal Stats Hook ────────────────────────────────────────
// Computes signal strength (0-5) from running cumulative data.
// Factors: total check-ins, unique active days, spread of archetypes.

interface SignalStats {
  checkinCount: number;
  uniqueDays: number;
  trajectoryStrength: number;   // gate: 2 = needs 5 checkins, 3 days
  driversStrength: number;      // gate: 2 = needs 7 checkins, 2+ days
  narrativeStrength: number;    // gate: 2 = needs 5 checkins
  capsuleStrength: number;      // gate: 2 = needs 5 checkins, 3 days
}

function useSignalStats(checkins: Checkin[]): SignalStats {
  return useMemo(() => {
    const count = checkins.length;

    // Unique calendar days
    const daySet = new Set<string>();
    for (const c of checkins) {
      try {
        daySet.add(new Date(c.timestamp).toISOString().slice(0, 10));
      } catch { /* skip */ }
    }
    const uniqueDays = daySet.size;

    // ── Strength formulas (0-5 each) ────
    // Each section weights factors differently.

    // Trajectory Path: needs breadth of data over time
    // 0 = <2 checkins, 1 = 2-3, 2 = 4 (unlock), 3 = 5-7+2days, 4 = 10+3days, 5 = 15+5days
    const trajectoryStrength = count < 2 ? 0
      : count < 4 ? 1
      : (count < 5 || uniqueDays < 2) ? 2
      : (count < 10 || uniqueDays < 3) ? 3
      : (count < 15 || uniqueDays < 5) ? 4
      : 5;

    // Behavioral Drivers: needs more volume to detect real trends
    // Unlock at strength 2 (7 checkins, 2 days)
    const driversStrength = count < 3 ? 0
      : count < 5 ? 1
      : (count < 7 || uniqueDays < 2) ? 2
      : (count < 12 || uniqueDays < 4) ? 3
      : (count < 20 || uniqueDays < 7) ? 4
      : 5;

    // Narrative Projection: moderate data need
    const narrativeStrength = count < 2 ? 0
      : count < 4 ? 1
      : count < 5 ? 2
      : (count < 8 || uniqueDays < 3) ? 3
      : (count < 15 || uniqueDays < 5) ? 4
      : 5;

    // Time Capsule: needs rich data to generate meaningful echoes
    const capsuleStrength = count < 2 ? 0
      : count < 4 ? 1
      : (count < 5 || uniqueDays < 2) ? 2
      : (count < 10 || uniqueDays < 3) ? 3
      : (count < 15 || uniqueDays < 5) ? 4
      : 5;

    return {
      checkinCount: count,
      uniqueDays,
      trajectoryStrength,
      driversStrength,
      narrativeStrength,
      capsuleStrength,
    };
  }, [checkins]);
}

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

// ── Trajectory Path (inner content) ──────────────────────────
function TrajectoryPathContent() {
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

  if (!data || data.empty) return null;

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

// ── Behavioral Drivers (inner content) ────────────────────────
function BehavioralDriversContent({ checkins }: { checkins: Checkin[] }) {
  const trends = useMemo(() => {
    if (checkins.length < 2) return null;

    const recent = checkins.slice(0, Math.min(5, checkins.length));
    const older = checkins.slice(Math.min(5, checkins.length), Math.min(10, checkins.length));

    if (older.length === 0) return null;

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

  if (!trends) return null;

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

// ── Narrative Projection (inner content) ──────────────────────
function NarrativeProjectionContent({ checkinCount }: { checkinCount: number }) {
  const { data: mythology } = useQuery<MythologyData>({
    queryKey: ["/api/mythology"],
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
        {checkinCount >= 5 && emerging && (
          <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
            If current patterns continue, your dominant archetype in 2-4 weeks is likely to shift toward{" "}
            <span className="font-medium" style={{ color: emerging.color }}>
              <span className="font-display">{emerging.emoji}</span> {emerging.name}
            </span>.
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

// ── Unlock threshold constants ────────────────────────────────
const TRAJECTORY_THRESHOLD = 2;   // strength >= 2 to unlock (4+ checkins)
const DRIVERS_THRESHOLD = 2;      // strength >= 2 to unlock (5+ checkins, 2+ days)
const NARRATIVE_THRESHOLD = 2;    // strength >= 2 to unlock (4+ checkins)
const CAPSULE_THRESHOLD = 2;      // strength >= 2 to unlock (5+ checkins, 2+ days)

// ── Main Trajectory Page ──────────────────────────────────────
export default function TrajectoryPage() {
  const selfVec = useLatestSelfVec();
  const { data: checkins = [] } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins"],
  });
  const stats = useSignalStats(checkins);

  // Hint helpers
  const trajectoryHint = stats.checkinCount < 4
    ? `${4 - stats.checkinCount} more check-in${4 - stats.checkinCount === 1 ? "" : "s"} to unlock`
    : `check in across ${2 - stats.uniqueDays} more day${2 - stats.uniqueDays === 1 ? "" : "s"} to unlock`;
  const driversHint = stats.checkinCount < 5
    ? `${5 - stats.checkinCount} more check-in${5 - stats.checkinCount === 1 ? "" : "s"} to unlock`
    : `check in across ${2 - stats.uniqueDays} more day${2 - stats.uniqueDays === 1 ? "" : "s"} to unlock`;
  const narrativeHint = stats.checkinCount < 4
    ? `${4 - stats.checkinCount} more check-in${4 - stats.checkinCount === 1 ? "" : "s"} to unlock`
    : "building narrative...";
  const capsuleHint = stats.checkinCount < 5
    ? `${5 - stats.checkinCount} more check-in${5 - stats.checkinCount === 1 ? "" : "s"} to unlock`
    : `check in across ${2 - stats.uniqueDays} more day${2 - stats.uniqueDays === 1 ? "" : "s"} to unlock`;

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
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-bold" data-testid="text-page-title">Motion</h1>
            <InfoTooltip text="Your identity trajectory over time. Shows how your archetype dimensions have shifted, what's driving changes, and where you might be heading next." />
          </div>
          <Link
            href="/motion/helix"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Variant DNA helix"
          >
            <Dna className="w-4 h-4" />
          </Link>
        </header>

        {/* Trajectory Path — gated */}
        <GatedSection
          title="Trajectory Path"
          strength={stats.trajectoryStrength}
          threshold={TRAJECTORY_THRESHOLD}
          hint={trajectoryHint}
        >
          <TrajectoryPathContent />
        </GatedSection>

        {/* Behavioral Drivers — gated + collapsed */}
        <GatedSection
          title="Behavioral Drivers"
          strength={stats.driversStrength}
          threshold={DRIVERS_THRESHOLD}
          hint={driversHint}
        >
          <CollapsibleSection title="Behavioral Drivers">
            <BehavioralDriversContent checkins={checkins} />
          </CollapsibleSection>
        </GatedSection>

        {/* Future Self Selector — collapsed */}
        <CollapsibleSection title="Future Self">
          <FutureSelf selfVec={selfVec} />
        </CollapsibleSection>

        {/* Archetype Browser — collapsed */}
        <CollapsibleSection title="Archetype Browser">
          <ArchetypeBrowser selfVec={selfVec} />
        </CollapsibleSection>

        {/* Narrative Projection — gated */}
        <GatedSection
          title="Narrative Projection"
          strength={stats.narrativeStrength}
          threshold={NARRATIVE_THRESHOLD}
          hint={narrativeHint}
        >
          <NarrativeProjectionContent checkinCount={stats.checkinCount} />
        </GatedSection>

        {/* Time Capsule — gated */}
        <GatedSection
          title="Time Capsule"
          strength={stats.capsuleStrength}
          threshold={CAPSULE_THRESHOLD}
          hint={capsuleHint}
        >
          <TimeCapsule />
        </GatedSection>
      </div>
    </div>
  );
}
