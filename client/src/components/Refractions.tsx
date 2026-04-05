import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, FlaskConical, Cloudy, Activity } from "lucide-react";
import { ARCHETYPE_MAP } from "@shared/archetypes";

// ── Experiment templates by archetype ───────────────────────
// Suggested experiments that nudge toward underexpressed archetypes.
// No DB needed — derived from the user's current archetype mix.

interface Experiment {
  title: string;
  duration: string;
  watching: string;
  target: string; // archetype key
}

const EXPERIMENT_POOL: Record<string, Experiment[]> = {
  observer: [
    { title: "Silent morning — no input for the first hour", duration: "5 days", watching: "focus stability, calm baseline shift", target: "observer" },
    { title: "Log one pattern you notice daily that nobody asked about", duration: "7 days", watching: "observer signal strength, writing depth", target: "observer" },
  ],
  builder: [
    { title: "Ship one small thing every day before noon", duration: "5 days", watching: "drive trend, agency signal", target: "builder" },
    { title: "Time-block 2 hours of deep work with no context switching", duration: "3 days", watching: "focus consistency, builder emergence", target: "builder" },
  ],
  explorer: [
    { title: "Take a route you've never taken — physically or mentally", duration: "3 days", watching: "exploration score, creativity uptick", target: "explorer" },
    { title: "Listen to a genre you'd normally skip for a full day", duration: "1 day", watching: "sonic mirror shift, openness signal", target: "explorer" },
  ],
  dissenter: [
    { title: "Disagree with one consensus opinion you usually go along with", duration: "3 days", watching: "autonomy signal, dissenter emergence", target: "dissenter" },
    { title: "Remove one default from your routine — something you do because everyone does", duration: "5 days", watching: "independence trend, pattern break", target: "dissenter" },
  ],
  seeker: [
    { title: "Write about what you're moving toward, not away from", duration: "3 days", watching: "meaning signal, seeker trajectory", target: "seeker" },
    { title: "Sit with discomfort for 10 minutes without fixing it", duration: "5 days", watching: "calm under uncertainty, transformation readiness", target: "seeker" },
  ],
};

function getSuggestedExperiments(checkins: any[]): Experiment[] {
  if (checkins.length === 0) return [];

  // Find the least-expressed archetype from recent check-ins
  const dimTotals: Record<string, number> = {};
  let count = 0;
  for (const c of checkins.slice(0, 5)) {
    try {
      const vec = JSON.parse(c.self_vec);
      for (const [k, v] of Object.entries(vec)) {
        dimTotals[k] = (dimTotals[k] || 0) + (v as number);
      }
      count++;
    } catch { /* skip */ }
  }

  if (count === 0) return [];

  // Simple archetype scoring from dimensions
  const scores: Record<string, number> = {
    observer: ((dimTotals["focus"] || 0) + (dimTotals["calm"] || 0)) / count,
    builder: ((dimTotals["agency"] || 0) + (dimTotals["drive"] || 0)) / count,
    explorer: ((dimTotals["creativity"] || 0) + (dimTotals["exploration"] || 0)) / count,
    dissenter: ((dimTotals["agency"] || 0) + (dimTotals["exploration"] || 0) - (dimTotals["calm"] || 0) / 2) / count,
    seeker: ((dimTotals["exploration"] || 0) + (dimTotals["calm"] || 0)) / count,
  };

  // Sort by lowest score — suggest experiments for least-expressed
  const sorted = Object.entries(scores).sort((a, b) => a[1] - b[1]);
  const weakest = sorted[0][0];
  const secondWeakest = sorted[1][0];

  const experiments: Experiment[] = [];
  if (EXPERIMENT_POOL[weakest]?.[0]) experiments.push(EXPERIMENT_POOL[weakest][0]);
  if (EXPERIMENT_POOL[secondWeakest]?.[0]) experiments.push(EXPERIMENT_POOL[secondWeakest][0]);
  // Add one from a random archetype for variety
  const third = sorted[Math.floor(Math.random() * sorted.length)][0];
  if (EXPERIMENT_POOL[third]?.[1]) experiments.push(EXPERIMENT_POOL[third][1]);

  return experiments.slice(0, 3);
}

// ── Sub-section wrapper ─────────────────────────────────────
function SubSection({
  icon: Icon,
  title,
  descriptor,
  color,
  children,
}: {
  icon: React.ElementType;
  title: string;
  descriptor: string;
  color: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-[10px] border border-border/30 bg-card/20 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 w-full p-3.5 group"
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}12` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div className="flex-1 text-left">
          <p className="text-xs font-semibold text-foreground/80">{title}</p>
          <p className="text-[10px] text-muted-foreground/40">{descriptor}</p>
        </div>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/30" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30" />
        )}
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Experiments section ──────────────────────────────────────
function ExperimentsContent() {
  const { data: checkins = [] } = useQuery<any[]>({
    queryKey: ["/api/checkins"],
  });

  const experiments = getSuggestedExperiments(checkins);

  if (experiments.length === 0) {
    return (
      <div className="text-center py-3">
        <p className="text-[10px] text-muted-foreground/30 font-mono">
          check in a few times to surface experiment suggestions
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {experiments.map((exp, i) => {
        const arch = ARCHETYPE_MAP[exp.target];
        return (
          <div
            key={i}
            className="p-3 rounded-lg border border-border/20 bg-background/30 space-y-1.5"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-foreground/80 leading-snug">
                {exp.title}
              </p>
              <span className="text-[9px] font-mono text-muted-foreground/30 whitespace-nowrap">
                {exp.duration}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {arch && (
                <span className="text-[10px] font-display" style={{ color: arch.color }}>
                  {arch.emoji}
                </span>
              )}
              <p className="text-[10px] text-muted-foreground/40 italic">
                watching: {exp.watching}
              </p>
            </div>
          </div>
        );
      })}
      <p className="text-[9px] text-muted-foreground/20 text-center pt-1">
        experiments target your least-expressed archetypes
      </p>
    </div>
  );
}

// ── Conditions section ───────────────────────────────────────
interface Condition {
  condition: string;
  amplifies: string;
  observation: string;
}

function ConditionsContent() {
  const { data: checkins = [] } = useQuery<any[]>({
    queryKey: ["/api/checkins"],
  });

  const hasEnough = checkins.length >= 5;

  const { data, isLoading } = useQuery<{ conditions: Condition[] }>({
    queryKey: ["/api/refractions/conditions"],
    staleTime: 10 * 60_000,
    enabled: hasEnough,
  });

  if (!hasEnough) {
    return (
      <div className="text-center py-3">
        <p className="text-[10px] text-muted-foreground/30 font-mono">
          conditions sharpen as your signal accumulates — {5 - checkins.length} more check-in{5 - checkins.length === 1 ? "" : "s"} to populate
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="animate-pulse space-y-2">
          <div className="h-12 bg-muted/30 rounded-lg" />
          <div className="h-12 bg-muted/30 rounded-lg" />
          <div className="h-12 bg-muted/30 rounded-lg" />
        </div>
      </div>
    );
  }

  const conditions = data?.conditions || [];
  if (conditions.length === 0) return null;

  return (
    <div className="space-y-2">
      {conditions.map((c, i) => {
        const arch = ARCHETYPE_MAP[c.amplifies];
        return (
          <div
            key={i}
            className="p-3 rounded-lg border border-border/20 bg-background/30 space-y-1"
          >
            <div className="flex items-center gap-1.5">
              {arch && (
                <span className="text-xs font-display" style={{ color: arch.color }}>
                  {arch.emoji}
                </span>
              )}
              <p className="text-xs font-medium text-foreground/70">{c.condition}</p>
            </div>
            <p className="text-[10px] text-muted-foreground/40 leading-relaxed font-serif italic">
              {c.observation}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Recovery section ─────────────────────────────────────────
interface RecoveryData {
  stability: number;
  trend: "stabilizing" | "drifting" | "stable" | "volatile";
  recent_volatility: number;
  historical_volatility: number;
  data_points: number;
}

const TREND_COPY: Record<string, { label: string; description: string }> = {
  stabilizing: {
    label: "Stabilizing",
    description: "Your pattern appears to be settling. Recent signals show less drift than your historical average — a return toward baseline.",
  },
  drifting: {
    label: "Drifting",
    description: "Your recent signals show more movement than usual. This isn't inherently negative — drift often precedes a meaningful shift.",
  },
  stable: {
    label: "Stable",
    description: "Your pattern is holding steady. Dimension scores are consistent with your historical range — no significant drift detected.",
  },
  volatile: {
    label: "Volatile",
    description: "Your signals are fluctuating more than usual across multiple dimensions. This often coincides with periods of change, stress, or growth.",
  },
};

function RecoveryContent() {
  const { data: checkins = [] } = useQuery<any[]>({
    queryKey: ["/api/checkins"],
  });

  const hasEnough = checkins.length >= 8;

  const { data, isLoading } = useQuery<{ recovery: RecoveryData | null }>({
    queryKey: ["/api/refractions/recovery"],
    staleTime: 5 * 60_000,
    enabled: hasEnough,
  });

  if (!hasEnough) {
    const needed = 8 - checkins.length;
    return (
      <div className="text-center py-3">
        <p className="text-[10px] text-muted-foreground/30 font-mono">
          recovery patterns emerge after enough data to detect drift — {needed} more check-in{needed === 1 ? "" : "s"} across a few days
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-16 bg-muted/30 rounded-lg" />
      </div>
    );
  }

  const recovery = data?.recovery;
  if (!recovery) return null;

  const trend = TREND_COPY[recovery.trend] || TREND_COPY.stable;
  const stabilityPct = Math.round(recovery.stability * 100);

  return (
    <div className="space-y-3">
      {/* Stability bar */}
      <div className="p-3 rounded-lg border border-border/20 bg-background/30 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground/70">{trend.label}</p>
          <span className="text-[10px] font-mono text-muted-foreground/30">
            {stabilityPct}% stability
          </span>
        </div>
        {/* Visual bar */}
        <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${stabilityPct}%`,
              backgroundColor: stabilityPct > 70 ? "#6b9080" : stabilityPct > 40 ? "#b8976a" : "#c17b6e",
            }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground/40 leading-relaxed font-serif italic">
          {trend.description}
        </p>
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[9px] font-mono text-muted-foreground/20">
          recent volatility: {recovery.recent_volatility}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground/20">
          historical: {recovery.historical_volatility}
        </span>
      </div>
    </div>
  );
}

// ── Main Refractions component ──────────────────────────────
export default function Refractions() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full group py-1"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40 transition-transform" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 transition-transform" />
        )}
        <div className="text-left">
          <p className="text-sm font-semibold text-foreground/70 group-hover:text-foreground/90 transition-colors">
            Refractions
          </p>
          <p className="text-[10px] text-muted-foreground/30">
            how your pattern changes under different conditions
          </p>
        </div>
      </button>

      {open && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <SubSection
            icon={FlaskConical}
            title="Experiments"
            descriptor="short tests to observe what shifts your signal"
            color="#7c8ba0"
          >
            <ExperimentsContent />
          </SubSection>

          <SubSection
            icon={Cloudy}
            title="Conditions"
            descriptor="what environments tend to amplify each archetype"
            color="#6b9080"
          >
            <ConditionsContent />
          </SubSection>

          <SubSection
            icon={Activity}
            title="Recovery"
            descriptor="drift, stabilization, and return to baseline"
            color="#b8976a"
          >
            <RecoveryContent />
          </SubSection>
        </div>
      )}
    </div>
  );
}
