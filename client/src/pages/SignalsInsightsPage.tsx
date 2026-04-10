import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Eye, AlertTriangle, Sparkles, TrendingUp, Zap, Activity, ArrowRightLeft, RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import InfoTooltip from "@/components/InfoTooltip";

type InsightType = "observation" | "blind_spot" | "creative_signal" | "trajectory" | "emotional_anomaly" | "creative_surge" | "state_transition";

interface Insight { type: InsightType; title: string; body: string; }
interface DiscoverResponse { insights: Insight[]; hasData?: boolean; error?: string; }

const TYPE_CONFIG: Record<string, { label: string; color: string; Icon: typeof Eye }> = {
  observation: { label: "OBSERVATION", color: "text-primary", Icon: Eye },
  blind_spot: { label: "BLIND SPOT", color: "text-amber-500", Icon: AlertTriangle },
  creative_signal: { label: "CREATIVE SIGNAL", color: "text-purple-500", Icon: Sparkles },
  trajectory: { label: "TRAJECTORY", color: "text-emerald-500", Icon: TrendingUp },
  emotional_anomaly: { label: "SIGNAL DEVIATION", color: "text-rose-500", Icon: Activity },
  creative_surge: { label: "CREATIVE SURGE", color: "text-cyan-500", Icon: Zap },
  state_transition: { label: "MODE SHIFT", color: "text-orange-500", Icon: ArrowRightLeft },
};

export default function SignalsInsightsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, isFetching } = useQuery<DiscoverResponse>({
    queryKey: [`/api/discover${refreshKey > 0 ? "?force=true" : ""}`],
    staleTime: 0,
  });

  const handleRefresh = () => {
    queryClient.removeQueries({ queryKey: [`/api/discover${refreshKey > 0 ? "?force=true" : ""}`] });
    setRefreshKey(k => k + 1);
    setShowAll(false);
  };

  const insights = data?.insights || [];
  const visible = showAll ? insights : insights.slice(0, 3);

  return (
    <div className="min-h-screen bg-background noise-overlay pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-center justify-between">
          <Link href="/signals" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Signals
          </Link>
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-display font-semibold">Insights</h1>
            <InfoTooltip text="Observations drawn from your recent check-ins, writing, and listening patterns. Surfaces blind spots, anomalies, and emerging signals you might not notice on your own." />
          </div>
          <div />
        </header>

        {isLoading ? (
          <div className="space-y-5">
            {[0, 1, 2].map(i => (
              <div key={i} className="p-5 rounded-[10px] bg-card/30 animate-pulse">
                <div className="h-3 w-28 bg-muted rounded mb-3" />
                <div className="h-4 w-48 bg-muted rounded mb-3" />
                <div className="h-3 w-full bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : insights.length > 0 ? (
          <div className="space-y-4">
            {visible.map((insight, i) => {
              const config = TYPE_CONFIG[insight.type] || TYPE_CONFIG.observation;
              const { Icon, label, color } = config;
              const isStructured = ["emotional_anomaly", "creative_surge", "state_transition"].includes(insight.type);

              return (
                <div key={`${insight.type}-${i}`} className="p-4 rounded-[10px] border border-border/30 bg-card/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-3 h-3 ${color}`} />
                    <span className={`text-[9px] font-mono uppercase tracking-widest ${color}`}>{label}</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-1.5">{insight.title}</p>
                  {isStructured ? (
                    <div className="text-xs text-muted-foreground/60 leading-relaxed space-y-1.5">
                      {insight.body.split("\n").map((line, li) => {
                        const trimmed = line.trim();
                        if (!trimmed) return null;
                        if (trimmed.startsWith("•")) return <p key={li} className="pl-3 text-foreground/50">{trimmed}</p>;
                        if (trimmed.startsWith("Possible interpretation:") || trimmed.startsWith("However:") || trimmed.startsWith("Common conditions")) return <p key={li} className="font-medium text-foreground/60 mt-1">{trimmed}</p>;
                        return <p key={li}>{trimmed}</p>;
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 leading-relaxed">{insight.body}</p>
                  )}
                </div>
              );
            })}

            {!showAll && insights.length > 3 && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full py-2.5 text-xs font-mono text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
              >
                Show {insights.length - 3} more insights
              </button>
            )}
          </div>
        ) : (
          <div className="p-6 rounded-[10px] border border-dashed border-border/30 text-center">
            <p className="text-sm text-muted-foreground/40">
              {data?.error || "Not enough data for insights yet. Check in a few times and connect data sources — patterns emerge once there’s enough signal."}
            </p>
          </div>
        )}

        <div className="flex justify-center">
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border/30 text-xs font-mono text-muted-foreground/40 hover:text-muted-foreground/60 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "generating..." : "refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}
