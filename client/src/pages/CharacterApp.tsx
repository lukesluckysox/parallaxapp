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
import { Sparkles, ArrowRight, Music, PenLine, Heart } from "lucide-react";
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
        <Sparkles className="w-3 h-3 text-amber-500" />
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
          <span className="text-sm">{baseline.emoji}</span>
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
          <span className="text-sm">{current.emoji}</span>
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
          <span className="text-sm">{emerging.emoji}</span>
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
            <Sparkles className="w-3 h-3 text-amber-500" />
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
        {trackCount > 0 ? `🎵 ${trackCount} tracks logged` : "🎵 Not connected"}
      </Link>
      <Link href="/writing" className="hover:text-foreground transition-colors">
        {writingCount > 0 ? `✍️ ${writingCount} writings analyzed` : "✍️ No writing yet"}
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
    // Restore state from last saved check-in so gauges persist
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/checkins");
        const checkins = await res.json();
        if (Array.isArray(checkins) && checkins.length > 0) {
          const latest = checkins[checkins.length - 1];
          if (latest.self_vec) {
            try {
              const sv = JSON.parse(latest.self_vec);
              setSelfVec(sv);
            } catch {}
          }
          if (latest.data_vec) {
            try {
              const dv = JSON.parse(latest.data_vec);
              // Convert absolute vec back to nudges (diff from baseline)
              const nudges: Partial<DimensionVec> = {};
              for (const dim of DIMENSIONS) {
                const diff = (dv[dim] || 50) - 50;
                if (diff !== 0) nudges[dim as keyof DimensionVec] = diff;
              }
              setDataNudges(nudges);
              setHasDataSources(true);
            } catch {}
          }
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
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <Header />

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
      </div>
    </div>
  );
}
