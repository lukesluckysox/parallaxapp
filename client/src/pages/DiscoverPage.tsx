import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Eye, AlertTriangle, Sparkles, TrendingUp, RefreshCw } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Insight {
  type: "observation" | "blind_spot" | "creative_signal" | "trajectory";
  title: string;
  body: string;
  icon: string;
}

interface DiscoverResponse {
  insights: Insight[];
  hasData?: boolean;
  error?: string;
}

const TYPE_CONFIG: Record<
  Insight["type"],
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
};

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

function InsightCard({ insight }: { insight: Insight }) {
  const config = TYPE_CONFIG[insight.type] || TYPE_CONFIG.observation;
  const { Icon, label, borderColor, labelColor, bgColor } = config;

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
      <p
        className="text-xs text-muted-foreground leading-relaxed"
        data-testid={`text-insight-body-${insight.type}`}
      >
        {insight.body}
      </p>
    </div>
  );
}

export default function DiscoverPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, isFetching } = useQuery<DiscoverResponse>({
    queryKey: ["/api/discover", refreshKey],
    staleTime: 0,
  });

  const handleRefresh = () => {
    queryClient.removeQueries({ queryKey: ["/api/discover", refreshKey] });
    setRefreshKey((k) => k + 1);
  };

  const insights = data?.insights || [];
  const hasData = data?.hasData ?? true;

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

        {/* Content */}
        {isLoading ? (
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
              disabled={isFetching}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              {isFetching ? "Generating..." : "Refresh insights"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
