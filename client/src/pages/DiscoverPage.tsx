import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Radio, ArrowRight, Sparkles, Repeat, Eye } from "lucide-react";
import { ARCHETYPE_MAP } from "@shared/archetypes";
import InfoTooltip from "@/components/InfoTooltip";

interface DiscoverResponse {
  insights: { type: string; title: string; body: string }[];
  hasData?: boolean;
}

interface ConstellationData {
  modes: { id: number; name: string; dominantArchetype: string; occurrenceCount: number }[];
  ready: boolean;
  reason?: string;
  totalCheckins?: number;
}

interface EchoData {
  active: { modeName: string; dominantArchetype: string; similarityScore: number } | null;
  history: { modeName: string; dominantArchetype: string; similarityScore: number; detectedAt: string }[];
}

export default function DiscoverPage() {
  const { data: insightData } = useQuery<DiscoverResponse>({
    queryKey: ["/api/discover"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: constellationData } = useQuery<ConstellationData>({
    queryKey: ["/api/constellations"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: echoData } = useQuery<EchoData>({
    queryKey: ["/api/echo"],
    staleTime: 2 * 60 * 1000,
  });

  const featuredInsight = insightData?.insights?.[0] || null;
  const constellationReady = constellationData?.ready;
  const modeCount = constellationData?.modes?.length || 0;
  const latestEcho = echoData?.active || (echoData?.history?.[0] || null);

  return (
    <div className="min-h-screen bg-background noise-overlay pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
            <Radio className="w-3.5 h-3.5" /> Home
          </Link>
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-display font-semibold">Signals</h1>
            <InfoTooltip text="Pattern recognition engine. Signals surface hidden insights, identity constellations, and behavioral anomalies by cross-referencing all your data sources." />
          </div>
          <div />
        </header>

        <p className="text-xs text-muted-foreground/50 text-center -mt-2 font-mono">
          patterns you haven't noticed yet
        </p>

        {/* Featured Insight */}
        {featuredInsight && (
          <div className="p-4 rounded-[10px] border border-border/40 bg-card/30">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-3 h-3 text-primary/60" />
              <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest">Latest Insight</span>
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">{featuredInsight.title}</p>
            <p className="text-xs text-muted-foreground/60 leading-relaxed">{featuredInsight.body}</p>
          </div>
        )}

        {/* Constellation Status */}
        <div className="p-4 rounded-[10px] border border-border/40 bg-card/20">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3 h-3 text-indigo-400/60" />
            <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest">Identity Constellation</span>
          </div>
          {constellationReady ? (
            <p className="text-xs text-foreground/60">
              <span className="font-mono text-foreground/80">{modeCount}</span> identity modes discovered
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/40">
              {constellationData?.reason || "Collecting behavioral data..."}
            </p>
          )}
        </div>

        {/* Latest Echo */}
        {latestEcho && (
          <div className="p-4 rounded-[10px] border border-indigo-500/20 bg-indigo-500/5">
            <div className="flex items-center gap-2 mb-2">
              <Repeat className="w-3 h-3 text-indigo-400/60" />
              <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest">Identity Echo</span>
            </div>
            <p className="text-xs text-foreground/60">
              Signals resemble <span className="font-display font-semibold" style={{ color: ARCHETYPE_MAP[latestEcho.dominantArchetype]?.color }}>"{latestEcho.modeName}"</span>
              <span className="font-mono text-muted-foreground/40 ml-1">{latestEcho.similarityScore}%</span>
            </p>
          </div>
        )}

        {/* Navigation cards */}
        <div className="space-y-2">
          <Link href="/signals/insights">
            <div className="flex items-center justify-between p-4 rounded-[10px] border border-border/30 bg-card/20 hover:bg-card/40 transition-colors cursor-pointer group">
              <div>
                <p className="text-sm font-medium text-foreground">All Insights</p>
                <p className="text-[10px] text-muted-foreground/40">Cross-source observations, blind spots, creative signals</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
            </div>
          </Link>
          <Link href="/signals/patterns">
            <div className="flex items-center justify-between p-4 rounded-[10px] border border-border/30 bg-card/20 hover:bg-card/40 transition-colors cursor-pointer group">
              <div>
                <p className="text-sm font-medium text-foreground">Timeline & Patterns</p>
                <p className="text-[10px] text-muted-foreground/40">Constellation, echoes, identity timeline</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
