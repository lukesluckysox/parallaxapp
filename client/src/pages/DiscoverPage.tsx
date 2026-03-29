import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Eye, AlertTriangle, Sparkles, TrendingUp, RefreshCw,
  Fingerprint, Zap, Activity, ArrowRightLeft, Clock, Music, PenLine,
  Repeat, ChevronRight
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ARCHETYPE_MAP } from "@shared/archetypes";

// ── Types ────────────────────────────────────────────────────

type InsightType =
  | "observation"
  | "blind_spot"
  | "creative_signal"
  | "trajectory"
  | "emotional_anomaly"
  | "creative_surge"
  | "state_transition";

interface Insight {
  type: InsightType;
  title: string;
  body: string;
}

interface DiscoverResponse {
  insights: Insight[];
  hasData?: boolean;
  error?: string;
}

interface VariantData {
  variant_name: string;
  primary_archetype: string;
  secondary_archetype?: string | null;
  exploration_channels: string[];
  emergent_traits: string[];
  description: string;
}

interface ProfileResponse {
  variant: VariantData | null;
  hasData?: boolean;
  error?: string;
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

// ── Config ───────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  InsightType,
  { label: string; borderColor: string; labelColor: string; bgColor: string; Icon: typeof Eye }
> = {
  observation: {
    label: "PARALLAX OBSERVATION",
    borderColor: "border-l-primary",
    labelColor: "text-primary",
    bgColor: "bg-primary/5",
    Icon: Eye,
  },
  blind_spot: {
    label: "BLIND SPOT",
    borderColor: "border-l-amber-500",
    labelColor: "text-amber-500",
    bgColor: "bg-amber-500/5",
    Icon: AlertTriangle,
  },
  creative_signal: {
    label: "CREATIVE SIGNAL",
    borderColor: "border-l-purple-500",
    labelColor: "text-purple-500",
    bgColor: "bg-purple-500/5",
    Icon: Sparkles,
  },
  trajectory: {
    label: "TRAJECTORY",
    borderColor: "border-l-emerald-500",
    labelColor: "text-emerald-500",
    bgColor: "bg-emerald-500/5",
    Icon: TrendingUp,
  },
  emotional_anomaly: {
    label: "SIGNAL DEVIATION",
    borderColor: "border-l-rose-500",
    labelColor: "text-rose-500",
    bgColor: "bg-rose-500/5",
    Icon: Activity,
  },
  creative_surge: {
    label: "CREATIVE SURGE",
    borderColor: "border-l-cyan-500",
    labelColor: "text-cyan-500",
    bgColor: "bg-cyan-500/5",
    Icon: Zap,
  },
  state_transition: {
    label: "MODE SHIFT",
    borderColor: "border-l-orange-500",
    labelColor: "text-orange-500",
    bgColor: "bg-orange-500/5",
    Icon: ArrowRightLeft,
  },
};

// ── Skeleton ─────────────────────────────────────────────────

function InsightSkeleton() {
  return (
    <div className="space-y-5">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="p-5 rounded-[10px] border-l-4 border-l-muted bg-card animate-pulse"
        >
          <div className="h-3 w-28 bg-muted rounded mb-3" />
          <div className="h-4 w-48 bg-muted rounded mb-3" />
          <div className="space-y-2">
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-4/5 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function VariantSkeleton() {
  return (
    <div className="p-5 rounded-[10px] border border-border bg-card animate-pulse">
      <div className="h-3 w-32 bg-muted rounded mb-3" />
      <div className="h-6 w-56 bg-muted rounded mb-3" />
      <div className="flex gap-2 mb-3">
        <div className="h-5 w-20 bg-muted rounded-full" />
        <div className="h-5 w-24 bg-muted rounded-full" />
        <div className="h-5 w-16 bg-muted rounded-full" />
      </div>
      <div className="h-3 w-full bg-muted rounded mb-2" />
      <div className="h-3 w-4/5 bg-muted rounded" />
    </div>
  );
}

// ── Insight Card ─────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  const config = TYPE_CONFIG[insight.type] || TYPE_CONFIG.observation;
  const { Icon, label, borderColor, labelColor, bgColor } = config;

  // For anomaly/surge/transition types, render body with bullet formatting
  const isStructured = ["emotional_anomaly", "creative_surge", "state_transition"].includes(insight.type);

  return (
    <div
      data-testid={`card-insight-${insight.type}`}
      className={`p-5 rounded-[10px] border border-border/60 ${bgColor}`}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className={`w-3.5 h-3.5 ${labelColor}`} />
        <span
          className={`text-[10px] font-semibold tracking-wider uppercase ${labelColor}`}
        >
          {label}
        </span>
      </div>
      <h3
        className="text-sm font-bold text-foreground mb-2 leading-snug"
        data-testid={`text-insight-title-${insight.type}`}
      >
        {insight.title}
      </h3>
      {isStructured ? (
        <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
          {insight.body.split("\n").map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            if (trimmed.startsWith("•")) {
              return (
                <p key={i} className="pl-3 text-foreground/80">
                  {trimmed}
                </p>
              );
            }
            if (trimmed.startsWith("However:") || trimmed.startsWith("Common conditions") || trimmed.startsWith("Possible interpretation:")) {
              return (
                <p key={i} className="font-medium text-foreground/90 mt-1">
                  {trimmed}
                </p>
              );
            }
            return <p key={i}>{trimmed}</p>;
          })}
        </div>
      ) : (
        <p
          className="text-xs text-muted-foreground leading-relaxed"
          data-testid={`text-insight-body-${insight.type}`}
        >
          {insight.body}
        </p>
      )}
    </div>
  );
}

// ── Variant Card ─────────────────────────────────────────────

function VariantCard({ variant }: { variant: VariantData }) {
  const primary = ARCHETYPE_MAP[variant.primary_archetype];
  const secondary = variant.secondary_archetype ? ARCHETYPE_MAP[variant.secondary_archetype] : null;

  return (
    <div
      data-testid="card-variant"
      className="relative overflow-hidden p-5 rounded-[10px] border bg-card"
      style={{
        borderColor: primary?.color || "hsl(var(--border))",
        background: `linear-gradient(135deg, ${primary?.color || "#8b5cf6"}08 0%, transparent 60%)`,
      }}
    >
      {/* Top label */}
      <div className="flex items-center gap-2 mb-3">
        <Fingerprint className="w-3.5 h-3.5" style={{ color: primary?.color || "#8b5cf6" }} />
        <span
          className="text-[10px] font-semibold tracking-wider uppercase"
          style={{ color: primary?.color || "#8b5cf6" }}
        >
          IDENTITY VARIANT DETECTED
        </span>
      </div>

      {/* Variant name */}
      <h2 className="text-2xl font-display font-semibold text-foreground mb-1 tracking-tight">
        {variant.variant_name}
      </h2>

      {/* Archetype derivation */}
      <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
        <span>
          <span className="font-display">{primary?.emoji}</span>{" "}{primary?.name || variant.primary_archetype}
        </span>
        {secondary && (
          <>
            <span className="text-muted-foreground/40">+</span>
            <span>
              <span className="font-display">{secondary.emoji}</span>{" "}{secondary.name}
            </span>
          </>
        )}
        <span className="text-muted-foreground/40 ml-1">variant</span>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        {variant.description}
      </p>

      {/* Exploration channels */}
      <div className="mb-4">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          You explore through
        </p>
        <div className="flex flex-wrap gap-1.5">
          {variant.exploration_channels.map((ch, i) => (
            <span
              key={i}
              className="text-[11px] px-2.5 py-1 rounded-full border"
              style={{
                borderColor: `${primary?.color || "#8b5cf6"}40`,
                color: primary?.color || "#8b5cf6",
                backgroundColor: `${primary?.color || "#8b5cf6"}10`,
              }}
            >
              {ch}
            </span>
          ))}
        </div>
      </div>

      {/* Emergent traits */}
      <div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Emergent traits
        </p>
        <div className="flex flex-wrap gap-1.5">
          {variant.emergent_traits.map((trait, i) => (
            <span
              key={i}
              className="text-[11px] px-2.5 py-1 rounded-full bg-accent text-foreground border border-border"
            >
              {trait}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────

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
        <div className="animate-pulse space-y-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-muted mt-1.5" />
              <div className="flex-1">
                <div className="h-3 w-20 bg-muted rounded mb-1" />
                <div className="h-4 w-40 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (events.length === 0) return null;

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

// ── Main Page ────────────────────────────────────────────────

// ── Constellation Section ──────────────────────────────────────

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

  if (data.modes.length === 0) return null;

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

// ── Echo Archive ────────────────────────────────────────────────

function EchoArchive({ data }: { data: EchoData | undefined }) {
  const [open, setOpen] = useState(false);

  if (!data?.history || data.history.length === 0) return null;

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


export default function DiscoverPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading: insightsLoading, isFetching } = useQuery<DiscoverResponse>({
    queryKey: [`/api/discover${refreshKey > 0 ? "?force=true" : ""}`],
    staleTime: 0,
  });

  const { data: profileData, isLoading: profileLoading, refetch: refetchProfile } = useQuery<ProfileResponse>({
    queryKey: ["/api/profile"],
    staleTime: 5 * 60 * 1000, // cache 5 min
  });

  const { data: constellationData } = useQuery<ConstellationData>({
    queryKey: ["/api/constellations"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: echoData } = useQuery<EchoData>({
    queryKey: ["/api/echo"],
    staleTime: 2 * 60 * 1000,
  });

  const handleRefresh = () => {
    queryClient.removeQueries({ queryKey: [`/api/discover${refreshKey > 0 ? "?force=true" : ""}`] });
    setRefreshKey((k) => k + 1);
    refetchProfile();
  };

  const insights = data?.insights || [];
  const hasData = data?.hasData ?? true;
  const variant = profileData?.variant || null;
  const loading = insightsLoading || profileLoading;

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
          <h1 className="text-base font-bold" data-testid="text-page-title">
            Signals
          </h1>
          <ThemeToggle />
        </header>

        {/* Subtitle */}
        <p
          className="text-xs text-muted-foreground text-center -mt-2"
          data-testid="text-discover-subtitle"
        >
          Pattern detection — insights you haven't noticed yet
        </p>

        {/* Variant Card */}
        {profileLoading ? (
          <VariantSkeleton />
        ) : variant ? (
          <VariantCard variant={variant} />
        ) : null}

        {/* Identity Constellation */}
        <ConstellationSection data={constellationData} />

        {/* Identity Timeline */}
        <IdentityTimeline />

        {/* Identity Echoes archive */}
        <EchoArchive data={echoData} />

        {/* Insights */}
        {insightsLoading ? (
          <InsightSkeleton />
        ) : !hasData ? (
          <div
            data-testid="card-discover-empty"
            className="p-6 rounded-[10px] border border-dashed border-border bg-card/50 text-center"
          >
            <Eye className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Start logging check-ins, writing, and music to unlock pattern
              detection.
            </p>
          </div>
        ) : insights.length > 0 ? (
          <div className="space-y-5">
            {insights.map((insight, i) => (
              <InsightCard key={`${insight.type}-${i}`} insight={insight} />
            ))}
          </div>
        ) : (
          <div
            data-testid="card-discover-error"
            className="p-6 rounded-[10px] border border-dashed border-border bg-card/50 text-center"
          >
            <p className="text-sm text-muted-foreground">
              {data?.error || "Could not generate insights. Try refreshing."}
            </p>
          </div>
        )}

        {/* Refresh button */}
        {hasData && (
          <div className="flex justify-center pt-2">
            <button
              data-testid="button-refresh-insights"
              onClick={handleRefresh}
              disabled={isFetching || profileLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${(isFetching || profileLoading) ? "animate-spin" : ""}`}
              />
              {(isFetching || profileLoading) ? "Generating..." : "Refresh insights"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
