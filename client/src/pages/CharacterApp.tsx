import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ARCHETYPES, ARCHETYPE_MAP, DIMENSIONS, type DimensionVec } from "@shared/archetypes";
import { topArchetype, computeMixture, applyNudges, defaultVec } from "@shared/archetype-math";
import Header from "@/components/Header";
import SourcePills from "@/components/SourcePills";
import FeelingInput from "@/components/FeelingInput";
import GaugeSection from "@/components/GaugeSection";
import MythologyCard from "@/components/MythologyCard";
import { Sparkles, ArrowRight, Music, PenLine, Heart, Fingerprint, Radio, TrendingUp, TrendingDown, Minus, Zap, BookOpen } from "lucide-react";
import { Link } from "wouter";
import type { Writing, Checkin } from "@shared/schema";

// ── Mirror Moment Card ────────────────────────────────────────
function MirrorMomentCard() {
  const { data: writings = [] } = useQuery<Writing[]>({
    queryKey: ["/api/writings"],
  });

  const latestMirror = writings.reduce<{ line: string; interpretation: string; archetype: string } | null>((found, w) => {
    if (found) return found;
    if (!w.analysis) return null;
    try {
      const analysis = JSON.parse(w.analysis);
      if (analysis.mirror_moment && analysis.mirror_moment.line) {
        return {
          line: analysis.mirror_moment.line,
          interpretation: analysis.mirror_moment.interpretation,
          archetype: analysis.archetype_lean || "observer",
        };
      }
    } catch { /* skip */ }
    return null;
  }, null);

  if (!latestMirror) return null;

  const arch = ARCHETYPE_MAP[latestMirror.archetype];

  return (
    <div
      data-testid="card-mirror-moment-main"
      className="p-3 rounded-[10px] border-l-4 bg-card/80"
      style={{
        borderLeftColor: arch?.color || "hsl(var(--primary))",
        backgroundColor: arch ? `${arch.color}08` : undefined,
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="font-display text-sm" style={{ color: arch?.color }}>✧</span>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Mirror Moment</span>
      </div>
      <p className="text-sm italic font-serif leading-relaxed text-foreground mb-1">
        "{latestMirror.line}"
      </p>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {latestMirror.interpretation}
      </p>
    </div>
  );
}

// ── Archetype Phase Indicator ─────────────────────────────────
interface MythologyData {
  empty?: boolean;
  arc_name?: string;
  narrative?: string;
  baseline_archetype?: string;
  current_archetype?: string;
  emerging_archetype?: string;
  observation?: string;
}

function ArchetypePhaseIndicator() {
  const { data } = useQuery<MythologyData>({
    queryKey: ["/api/mythology"],
  });

  if (!data || data.empty) return null;

  const baseline = data.baseline_archetype ? ARCHETYPE_MAP[data.baseline_archetype] : null;
  const current = data.current_archetype ? ARCHETYPE_MAP[data.current_archetype] : null;
  const emerging = data.emerging_archetype ? ARCHETYPE_MAP[data.emerging_archetype] : null;

  if (!baseline && !current && !emerging) return null;

  return (
    <div
      data-testid="card-archetype-phase"
      className="flex items-center justify-center gap-2 flex-wrap py-2 px-3 rounded-[10px] border border-border bg-card/50"
    >
      {baseline && (
        <div className="flex items-center gap-1 text-xs">
          <span className="font-display text-lg" style={{ color: baseline.color }}>{baseline.emoji}</span>
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
          <span className="font-display text-lg" style={{ color: current.color }}>{current.emoji}</span>
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
          <span className="font-display text-lg" style={{ color: emerging.color }}>{emerging.emoji}</span>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Emerging</p>
            <p className="font-medium" style={{ color: emerging.color }}>{emerging.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Insight Feed ──────────────────────────────────────────────
function InsightFeed() {
  const { data: writings = [] } = useQuery<Writing[]>({
    queryKey: ["/api/writings"],
  });
  const { data: mythology } = useQuery<MythologyData>({
    queryKey: ["/api/mythology"],
  });

  const latestMirror = writings.reduce<{ line: string; interpretation: string } | null>((found, w) => {
    if (found) return found;
    if (!w.analysis) return null;
    try {
      const analysis = JSON.parse(w.analysis);
      if (analysis.mirror_moment && analysis.mirror_moment.line) {
        return { line: analysis.mirror_moment.line, interpretation: analysis.mirror_moment.interpretation };
      }
    } catch { /* skip */ }
    return null;
  }, null);

  const hasInsight = latestMirror || (mythology && !mythology.empty && mythology.observation);

  if (!hasInsight) {
    return (
      <div
        data-testid="card-insight-empty"
        className="p-3 rounded-[10px] border border-dashed border-border bg-card/50 text-center"
      >
        <p className="text-xs text-muted-foreground">
          Connect data sources and save check-ins to unlock insights
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="card-insight-feed">
      {latestMirror && (
        <div className="p-3 rounded-[10px] border-l-4 border-l-amber-500/60 bg-amber-500/5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs text-muted-foreground/60">✧</span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Mirror Moment</span>
          </div>
          <p className="text-sm italic font-serif leading-relaxed text-foreground mb-1">
            "{latestMirror.line}"
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {latestMirror.interpretation}
          </p>
        </div>
      )}
      {mythology && !mythology.empty && mythology.observation && !latestMirror && (
        <div className="p-3 rounded-[10px] border-l-4 border-l-primary/60 bg-primary/5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Parallax Observation
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {mythology.observation}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Variant Badge (compact) ──────────────────────────────────
interface VariantData {
  variant_name: string;
  primary_archetype: string;
  secondary_archetype?: string | null;
  emergent_traits: string[];
  exploration_channels: string[];
  description: string;
}

function VariantBadge() {
  const { data } = useQuery<{ variant: VariantData | null }>({
    queryKey: ["/api/profile"],
    staleTime: 5 * 60 * 1000,
  });

  const variant = data?.variant;
  if (!variant) return null;

  const primary = ARCHETYPE_MAP[variant.primary_archetype];

  return (
    <Link href="/discover">
      <div
        data-testid="card-variant-badge"
        className="p-3 rounded-[10px] border bg-card/80 cursor-pointer hover:bg-card transition-colors"
        style={{
          borderColor: `${primary?.color || "#8b5cf6"}30`,
          background: `linear-gradient(135deg, ${primary?.color || "#8b5cf6"}06 0%, transparent 60%)`,
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Fingerprint className="w-3 h-3" style={{ color: primary?.color || "#8b5cf6" }} />
          <span
            className="text-[10px] font-semibold tracking-wider uppercase"
            style={{ color: primary?.color || "#8b5cf6" }}
          >
            Identity Variant
          </span>
          <ArrowRight className="w-3 h-3 ml-auto text-muted-foreground/40" />
        </div>
        <p className="text-sm font-bold text-foreground mb-1">{variant.variant_name}</p>
        <div className="flex flex-wrap gap-1">
          {variant.emergent_traits.slice(0, 4).map((trait, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground border border-border"
            >
              {trait}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

// ── Signal Forecast ────────────────────────────────────────
interface ForecastData {
  archetype_signals: Record<string, string>;
  dominant_mode: string;
  good_conditions: string[];
  forecast_narrative: string;
  operating_rules: string[];
  rare_pattern: string | null;
}

const SIGNAL_ICON: Record<string, { icon: typeof TrendingUp; color: string }> = {
  rising: { icon: TrendingUp, color: "text-emerald-500" },
  elevated: { icon: Zap, color: "text-amber-500" },
  stable: { icon: Minus, color: "text-muted-foreground" },
  low: { icon: TrendingDown, color: "text-blue-400" },
  dormant: { icon: Minus, color: "text-muted-foreground/40" },
};

function SignalForecast() {
  const { data } = useQuery<{ forecast: ForecastData | null }>({
    queryKey: ["/api/forecast"],
    staleTime: 10 * 60 * 1000, // cache 10 min
  });

  const forecast = data?.forecast;
  if (!forecast) return null;

  const dominant = ARCHETYPE_MAP[forecast.dominant_mode];

  return (
    <div
      data-testid="card-signal-forecast"
      className="p-4 rounded-[10px] border border-border bg-card/80 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Radio className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-semibold tracking-wider uppercase text-primary">
          Today's Signal Forecast
        </span>
      </div>

      {/* Archetype signal levels */}
      <div className="grid grid-cols-5 gap-1">
        {ARCHETYPES.map(arch => {
          const level = forecast.archetype_signals[arch.key] || "stable";
          const sig = SIGNAL_ICON[level] || SIGNAL_ICON.stable;
          const SigIcon = sig.icon;
          return (
            <div key={arch.key} className="text-center">
              <div className="text-base font-display mb-0.5" style={{ color: arch.color }}>{arch.emoji}</div>
              <div className={`flex items-center justify-center gap-0.5 ${sig.color}`}>
                <SigIcon className="w-3 h-3" />
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5 capitalize">{level}</p>
            </div>
          );
        })}
      </div>

      {/* Narrative */}
      <p className="text-xs text-muted-foreground leading-relaxed italic">
        {forecast.forecast_narrative}
      </p>

      {/* Good conditions */}
      <div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          Good conditions for
        </p>
        <div className="flex flex-wrap gap-1.5">
          {forecast.good_conditions.map((cond, i) => (
            <span
              key={i}
              className="text-[11px] px-2.5 py-1 rounded-full border border-primary/20 text-primary bg-primary/5"
            >
              {cond}
            </span>
          ))}
        </div>
      </div>

      {/* Operating rules */}
      {forecast.operating_rules.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Your patterns
          </p>
          <div className="space-y-1">
            {forecast.operating_rules.map((rule, i) => (
              <p key={i} className="text-[11px] text-foreground/80 leading-relaxed">
                {rule}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Rare pattern */}
      {forecast.rare_pattern && (
        <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center gap-1.5 mb-1">
            <BookOpen className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] font-medium text-amber-500 uppercase tracking-wider">Rare Pattern</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {forecast.rare_pattern}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Data Source Summary ───────────────────────────────────────
function DataSourceSummary() {
  const { data: writings = [] } = useQuery<Writing[]>({
    queryKey: ["/api/writings"],
  });
  const { data: spotifyHistory } = useQuery<{ stats: { totalTracks: number } }>({
    queryKey: ["/api/spotify/history"],
  });

  const trackCount = spotifyHistory?.stats?.totalTracks || 0;
  const writingCount = writings.length;

  return (
    <div
      data-testid="card-data-sources"
      className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground"
    >
      <Link href="/spotify" className="hover:text-foreground transition-colors">
        {trackCount > 0 ? `${trackCount} tracks logged` : "Not connected"}
      </Link>
      <Link href="/writing" className="hover:text-foreground transition-colors">
        {writingCount > 0 ? `${writingCount} writings analyzed` : "No writing yet"}
      </Link>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────
export default function CharacterApp() {
  const { toast } = useToast();

  // State for dimension vectors — initialized from latest check-in below
  const [selfVec, setSelfVec] = useState<DimensionVec>(defaultVec());
  const [dataNudges, setDataNudges] = useState<Partial<DimensionVec>>({});
  const [hasDataSources, setHasDataSources] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [feelingText, setFeelingText] = useState("");
  const [llmNarrative, setLlmNarrative] = useState("");
  const [spotifySummary, setSpotifySummary] = useState("");
  const [fitnessSummary, setFitnessSummary] = useState("");
  const [writingSummary, setWritingSummary] = useState("");

  // Compute data vec by applying nudges to default
  const dataVec: DimensionVec | null = hasDataSources
    ? applyNudges(defaultVec(), dataNudges)
    : null;

  // Compute archetypes
  const selfTop = topArchetype(selfVec);
  const dataTop = dataVec ? topArchetype(dataVec) : null;
  const selfArchetypeKey = selfTop[0]?.key || "observer";
  const dataArchetypeKey = dataTop?.[0]?.key || null;

  // Spotify
  const fetchSpotify = useCallback(async () => {
    try {
      const res = await apiRequest("GET", "/api/spotify");
      const data = await res.json();
      if (data.nudges && Object.keys(data.nudges).length > 0) {
        setDataNudges(prev => {
          const merged = { ...prev };
          for (const [k, v] of Object.entries(data.nudges)) {
            merged[k as keyof DimensionVec] = ((merged[k as keyof DimensionVec] || 0) + (v as number));
          }
          return merged;
        });
        setHasDataSources(true);
      }
      if (data.summary) setSpotifySummary(data.summary);
      return data;
    } catch {
      toast({ title: "Spotify", description: "Could not fetch Spotify data", variant: "destructive" });
      return null;
    }
  }, [toast]);

  // Fitness
  const fetchFitness = useCallback(async () => {
    try {
      const res = await apiRequest("GET", "/api/fitness");
      const data = await res.json();
      if (data.nudges && Object.keys(data.nudges).length > 0) {
        setDataNudges(prev => {
          const merged = { ...prev };
          for (const [k, v] of Object.entries(data.nudges)) {
            merged[k as keyof DimensionVec] = ((merged[k as keyof DimensionVec] || 0) + (v as number));
          }
          return merged;
        });
        setHasDataSources(true);
      }
      if (data.summary) setFitnessSummary(data.summary);
      return data;
    } catch {
      toast({ title: "Fitness", description: "Could not fetch fitness data", variant: "destructive" });
      return null;
    }
  }, [toast]);

  // Writing
  const fetchWriting = useCallback(async () => {
    try {
      const res = await apiRequest("GET", "/api/writing/nudges");
      const data = await res.json();
      if (data.nudges && Object.keys(data.nudges).length > 0) {
        setDataNudges(prev => {
          const merged = { ...prev };
          for (const [k, v] of Object.entries(data.nudges)) {
            merged[k as keyof DimensionVec] = ((merged[k as keyof DimensionVec] || 0) + (v as number));
          }
          return merged;
        });
        setHasDataSources(true);
      }
      if (data.summary) setWritingSummary(data.summary);
      return data;
    } catch {
      toast({ title: "Writing", description: "Could not fetch writing data", variant: "destructive" });
      return null;
    }
  }, [toast]);

  // Load latest check-in + all data sources on page load
  useEffect(() => {
    // Restore CUMULATIVE state from ALL check-ins (weighted average, recent weighted heavier)
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/checkins");
        const checkins = await res.json();
        if (Array.isArray(checkins) && checkins.length > 0) {
          // Compute weighted average of all self_vecs (recent entries count more)
          const avgSelf: Record<string, number> = {};
          const avgData: Record<string, number> = {};
          let selfCount = 0;
          let dataCount = 0;
          
          for (let i = 0; i < checkins.length; i++) {
            const c = checkins[i];
            // Weight: older entries get weight 1, newest gets weight 3
            const weight = 1 + (2 * i / Math.max(checkins.length - 1, 1));
            
            if (c.self_vec) {
              try {
                const sv = JSON.parse(c.self_vec);
                for (const dim of DIMENSIONS) {
                  avgSelf[dim] = (avgSelf[dim] || 0) + (sv[dim] || 50) * weight;
                }
                selfCount += weight;
              } catch {}
            }
            if (c.data_vec) {
              try {
                const dv = JSON.parse(c.data_vec);
                for (const dim of DIMENSIONS) {
                  avgData[dim] = (avgData[dim] || 0) + (dv[dim] || 50) * weight;
                }
                dataCount += weight;
              } catch {}
            }
          }
          
          // Apply averaged self vec
          if (selfCount > 0) {
            const finalSelf: DimensionVec = {} as DimensionVec;
            for (const dim of DIMENSIONS) {
              finalSelf[dim as keyof DimensionVec] = Math.round((avgSelf[dim] || 0) / selfCount);
            }
            setSelfVec(finalSelf);
          }
          
          // Apply averaged data vec as nudges
          if (dataCount > 0) {
            const nudges: Partial<DimensionVec> = {};
            for (const dim of DIMENSIONS) {
              const avg = Math.round((avgData[dim] || 0) / dataCount);
              const diff = avg - 50;
              if (diff !== 0) nudges[dim as keyof DimensionVec] = diff;
            }
            setDataNudges(nudges);
            setHasDataSources(true);
          }
          
          // Latest summaries for display
          const latest = checkins[checkins.length - 1];
          if (latest.spotify_summary) setSpotifySummary(latest.spotify_summary);
          if (latest.llm_narrative) setLlmNarrative(latest.llm_narrative);
        }
      } catch {}
      setInitialLoaded(true);
    })();
    // Then fetch fresh data from sources
    fetchSpotify();
    fetchWriting();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Interpret feeling
  const interpretMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/interpret", { text, spotifySummary, fitnessSummary });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.dimensions) {
        setSelfVec(data.dimensions as DimensionVec);
      }
      if (data.narrative) {
        setLlmNarrative(data.narrative);
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Could not interpret your feeling", variant: "destructive" });
    }
  });

  // Save checkin
  const saveCheckinMutation = useMutation({
    mutationFn: async () => {
      const body = {
        timestamp: new Date().toISOString(),
        self_vec: JSON.stringify(selfVec),
        data_vec: dataVec ? JSON.stringify(dataVec) : null,
        self_archetype: selfArchetypeKey,
        data_archetype: dataArchetypeKey,
        feeling_text: feelingText || null,
        spotify_summary: spotifySummary || null,
        fitness_summary: fitnessSummary || null,
        llm_narrative: llmNarrative || null,
      };
      const res = await apiRequest("POST", "/api/checkins", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Check-in saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mythology"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save check-in", variant: "destructive" });
    }
  });

  return (
    <div className="min-h-screen bg-background pb-20 noise-overlay">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <Header />

        {/* Signal Forecast — today's conditions */}
        <SignalForecast />

        {/* Data Sources — interactive pills with connect buttons */}
        <SourcePills
          onFetchSpotify={fetchSpotify}
          onFetchFitness={fetchFitness}
          onFetchWriting={fetchWriting}
          spotifySummary={spotifySummary}
          fitnessSummary={fitnessSummary}
          writingSummary={writingSummary}
        />

        {/* Feeling Input */}
        <FeelingInput
          value={feelingText}
          onChange={setFeelingText}
          onInterpret={() => interpretMutation.mutate(feelingText)}
          isLoading={interpretMutation.isPending}
          narrative={llmNarrative}
        />

        {/* Archetype Phase Indicator */}
        <ArchetypePhaseIndicator />

        {/* Gauge Section */}
        <GaugeSection
          selfVec={selfVec}
          dataVec={dataVec}
          selfArchetype={selfArchetypeKey}
          dataArchetype={dataArchetypeKey}
        />

        {/* Mythology Card */}
        <MythologyCard />

        {/* Insight Feed */}
        <InsightFeed />

        {/* Variant Badge — links to Discover */}
        <VariantBadge />

        {/* Save Check-in */}
        <div>
          <button
            data-testid="button-save-checkin"
            onClick={() => saveCheckinMutation.mutate()}
            disabled={saveCheckinMutation.isPending}
            className="w-full py-3 rounded-[10px] bg-primary text-primary-foreground font-medium text-sm transition-all hover:opacity-90 disabled:opacity-50"
          >
            {saveCheckinMutation.isPending ? "Saving..." : "Save check-in"}
          </button>
        </div>

        {/* About link */}
        <div className="text-center pt-4 pb-2">
          <Link
            href="/about"
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            About Parallax
          </Link>
        </div>
      </div>
    </div>
  );
}
