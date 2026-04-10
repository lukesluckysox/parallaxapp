import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Sparkles, Zap, Activity, ArrowRightLeft, Clock,
  Music, PenLine, Repeat, TrendingUp, Eye, ChevronRight
} from "lucide-react";
import { ARCHETYPE_MAP } from "@shared/archetypes";
import { SkeletonCard } from "@/components/Skeleton";

// ── Types ────────────────────────────────────────────────────

interface TimelineEvent {
  date: string;
  type: string;
  title: string;
  detail: string;
  archetype?: string | null;
}

interface TimelineResponse {
  events: TimelineEvent[];
  hasData?: boolean;
}

interface ConstellationData {
  modes: {
    id: number;
    name: string;
    dominantArchetype: string;
    archetypeDistribution: Record<string, number>;
    centroidVec: Record<string, number>;
    occurrenceCount: number;
    firstSeen: string;
    lastSeen: string;
  }[];
  ready: boolean;
  reason?: string;
  totalCheckins?: number;
  daySpan?: number;
}

interface EchoData {
  active: {
    modeName: string;
    dominantArchetype: string;
    similarityScore: number;
    detectedAt: string;
  } | null;
  history: {
    id: number;
    modeName: string;
    dominantArchetype: string;
    similarityScore: number;
    detectedAt: string;
  }[];
}

// ── Constants ────────────────────────────────────────────────

const TIMELINE_TYPE_STYLE: Record<string, { dotColor: string; Icon: typeof Zap }> = {
  creative_surge: { dotColor: "bg-cyan-500", Icon: Zap },
  state_transition: { dotColor: "bg-orange-500", Icon: ArrowRightLeft },
  archetype_shift: { dotColor: "bg-purple-500", Icon: Activity },
  milestone: { dotColor: "bg-emerald-500", Icon: TrendingUp },
  consolidation: { dotColor: "bg-blue-500", Icon: Eye },
  emergence: { dotColor: "bg-amber-500", Icon: Sparkles },
  writing: { dotColor: "bg-violet-500", Icon: PenLine },
  music_milestone: { dotColor: "bg-green-500", Icon: Music },
  echo: { dotColor: "bg-indigo-500", Icon: Repeat },
};

// ── Identity Timeline ─────────────────────────────────────────

function IdentityTimeline() {
  const { data, isLoading } = useQuery<TimelineResponse>({
    queryKey: ["/api/timeline"],
    staleTime: 5 * 60 * 1000,
  });

  const events = data?.events || [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">Identity Timeline</span>
        </div>
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="p-4 rounded-[10px] border border-dashed border-border/30 bg-card/10 text-center">
        <Clock className="w-4 h-4 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground/40">
          Your identity timeline will take shape as reflections accumulate over time.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="card-identity-timeline">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">Identity Timeline</span>
      </div>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-4">
          {events.map((event, i) => {
            const style = TIMELINE_TYPE_STYLE[event.type] || TIMELINE_TYPE_STYLE.milestone;
            const arch = event.archetype ? ARCHETYPE_MAP[event.archetype] : null;
            const EventIcon = style.Icon;

            const d = new Date(event.date + "T12:00:00");
            const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

            return (
              <div key={`${event.date}-${i}`} className="flex gap-3 relative">
                <div className={`w-[11px] h-[11px] rounded-full ${style.dotColor} mt-0.5 shrink-0 z-10 ring-2 ring-background`} />
                <div className="flex-1 -mt-0.5">
                  <p className="text-[10px] font-mono text-muted-foreground mb-0.5">{dateStr}</p>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <EventIcon className="w-3 h-3" style={{ color: arch?.color || undefined }} />
                    <p className="text-xs font-bold text-foreground">{event.title}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{event.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Constellation Section ─────────────────────────────────────

function ConstellationSection({ data }: { data: ConstellationData | undefined }) {
  if (!data) return null;

  if (!data.ready) {
    return (
      <div
        data-testid="card-constellation-pending"
        className="p-4 rounded-[10px] border border-dashed border-border/30 bg-card/10 text-center"
      >
        <p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-1">
          Identity Constellations
        </p>
        <p className="text-xs text-muted-foreground/50">
          {data.reason || "More check-ins needed to discover your identity modes."}
        </p>
      </div>
    );
  }

  if (data.modes.length === 0) {
    return (
      <div className="p-4 rounded-[10px] border border-dashed border-border/30 bg-card/10 text-center">
        <Sparkles className="w-4 h-4 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground/40">
          Your identity constellations will emerge once enough modes are discovered.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="card-constellation">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
          Identity Constellations
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/40 ml-auto">
          {data.totalCheckins} check-ins &middot; {data.daySpan}d span
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {data.modes.map((mode) => {
          const arch = ARCHETYPE_MAP[mode.dominantArchetype];
          const firstDate = new Date(mode.firstSeen + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const lastDate = new Date(mode.lastSeen + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const archEntries = Object.entries(mode.archetypeDistribution).sort((a, b) => b[1] - a[1]);

          return (
            <div
              key={mode.id}
              data-testid={`card-mode-${mode.id}`}
              className="p-4 rounded-[10px] border border-border/40 bg-card/30"
              style={{
                borderColor: `${arch?.color || "#6366f1"}30`,
                background: `linear-gradient(135deg, ${arch?.color || "#6366f1"}08 0%, transparent 70%)`,
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-display font-semibold text-foreground leading-tight">
                    {mode.name}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                    {firstDate} &mdash; {lastDate}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-base" style={{ lineHeight: 1 }}>{arch?.emoji}</span>
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                    style={{ color: arch?.color, backgroundColor: `${arch?.color}18` }}
                  >
                    {mode.occurrenceCount}x
                  </span>
                </div>
              </div>

              {/* Archetype distribution bar */}
              <div className="mt-2">
                <p className="text-[9px] font-mono text-muted-foreground/30 uppercase tracking-widest mb-1">
                  archetype mix
                </p>
                <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                  {archEntries.map(([archKey, pct]) => {
                    const archInfo = ARCHETYPE_MAP[archKey];
                    return (
                      <div
                        key={archKey}
                        style={{
                          width: `${pct}%`,
                          backgroundColor: archInfo?.color || "#6366f1",
                          opacity: 0.7,
                        }}
                        title={`${archKey}: ${pct}%`}
                      />
                    );
                  })}
                </div>
                <div className="flex gap-3 mt-1.5 flex-wrap">
                  {archEntries.slice(0, 3).map(([archKey, pct]) => {
                    const archInfo = ARCHETYPE_MAP[archKey];
                    return (
                      <span key={archKey} className="text-[9px] font-mono" style={{ color: archInfo?.color }}>
                        {archKey} {pct}%
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Echo Archive ─────────────────────────────────────────────

function EchoArchive({ data }: { data: EchoData | undefined }) {
  const [open, setOpen] = useState(false);

  if (!data?.history || data.history.length === 0) {
    return (
      <div className="p-4 rounded-[10px] border border-dashed border-border/30 bg-card/10 text-center">
        <Repeat className="w-4 h-4 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground/40">
          Identity echoes will appear here when your current patterns match previous modes.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="card-echo-archive">
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setOpen(o => !o)}
        data-testid="button-echo-archive-toggle"
      >
        <Repeat className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
          Identity Echoes
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/40 ml-1">
          {data.history.length}
        </span>
        <ChevronRight
          className={`w-3.5 h-3.5 text-muted-foreground/40 ml-auto transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {data.history.map((echo) => {
            const arch = ARCHETYPE_MAP[echo.dominantArchetype];
            const dateStr = new Date(echo.detectedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            return (
              <div
                key={echo.id}
                data-testid={`card-echo-${echo.id}`}
                className="flex items-center gap-3 p-3 rounded-[8px] border border-border/30 bg-card/20"
              >
                <span className="text-sm" style={{ lineHeight: 1 }}>{arch?.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{echo.modeName}</p>
                  <p className="text-[10px] font-mono text-muted-foreground/50">{dateStr}</p>
                </div>
                <div
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
                  style={{ color: arch?.color || "#6366f1", backgroundColor: `${arch?.color || "#6366f1"}18` }}
                >
                  {echo.similarityScore}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function SignalsPatternsPage() {
  const { data: constellationData } = useQuery<ConstellationData>({
    queryKey: ["/api/constellations"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: echoData } = useQuery<EchoData>({
    queryKey: ["/api/echo"],
    staleTime: 2 * 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-background noise-overlay pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-center justify-between">
          <Link href="/signals" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Signals
          </Link>
          <h1 className="text-base font-display font-semibold">Timeline & Patterns</h1>
          <div />
        </header>

        {/* Identity Constellation */}
        <ConstellationSection data={constellationData} />

        {/* Identity Timeline */}
        <IdentityTimeline />

        {/* Identity Echoes archive */}
        <EchoArchive data={echoData} />

        {/* Inter-App Navigation */}
        <div className="space-y-2 pt-2">
          <a
            href="https://praxis-app.up.railway.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-[10px] border border-border/20 bg-card/10 hover:bg-card/20 transition-colors group"
          >
            <span className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors">
              Test a pattern with an experiment
            </span>
            <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground/30 rotate-180" />
          </a>
          <a
            href="https://liminal-app.up.railway.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-[10px] border border-border/20 bg-card/10 hover:bg-card/20 transition-colors group"
          >
            <span className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors">
              Continue reflecting on these patterns
            </span>
            <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground/30 rotate-180" />
          </a>
          <a
            href="https://axiomtool-production.up.railway.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-[10px] border border-border/20 bg-card/10 hover:bg-card/20 transition-colors group"
          >
            <span className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors">
              Examine this as a principle
            </span>
            <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground/30 rotate-180" />
          </a>
        </div>
      </div>
    </div>
  );
}
