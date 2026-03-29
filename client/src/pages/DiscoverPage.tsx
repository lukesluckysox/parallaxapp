import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Eye, AlertTriangle, Sparkles, TrendingUp, RefreshCw,
  Fingerprint, Zap, Activity, ArrowRightLeft, Clock, Music, PenLine
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
      className={`p-5 rounded-[10px] border-l-4 ${borderColor} ${bgColor}`}
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
      <h2 className="text-xl font-bold text-foreground mb-1 tracking-tight">
        {variant.variant_name}
      </h2>

      {/* Archetype derivation */}
      <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
        <span>
          {primary?.emoji} {primary?.name || variant.primary_archetype}
        </span>
        {secondary && (
          <>
            <span className="text-muted-foreground/40">+</span>
            <span>
              {secondary.emoji} {secondary.name}
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
                  <p className="text-[10px] text-muted-foreground mb-0.5">{dateStr}</p>
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

export default function DiscoverPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading: insightsLoading, isFetching } = useQuery<DiscoverResponse>({
    queryKey: ["/api/discover", refreshKey],
    staleTime: 0,
  });

  const { data: profileData, isLoading: profileLoading, refetch: refetchProfile } = useQuery<ProfileResponse>({
    queryKey: ["/api/profile"],
    staleTime: 5 * 60 * 1000, // cache 5 min
  });

  const handleRefresh = () => {
    queryClient.removeQueries({ queryKey: ["/api/discover", refreshKey] });
    setRefreshKey((k) => k + 1);
    refetchProfile();
  };

  const insights = data?.insights || [];
  const hasData = data?.hasData ?? true;
  const variant = profileData?.variant || null;
  const loading = insightsLoading || profileLoading;

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back-home"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Parallax
          </Link>
          <h1 className="text-base font-bold" data-testid="text-page-title">
            Discover
          </h1>
          <ThemeToggle />
        </header>

        {/* Subtitle */}
        <p
          className="text-xs text-muted-foreground text-center -mt-2"
          data-testid="text-discover-subtitle"
        >
          Patterns you haven't noticed yet
        </p>

        {/* Variant Card */}
        {profileLoading ? (
          <VariantSkeleton />
        ) : variant ? (
          <VariantCard variant={variant} />
        ) : null}

        {/* Identity Timeline */}
        <IdentityTimeline />

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
