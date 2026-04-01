import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ARCHETYPES, ARCHETYPE_MAP, DIMENSIONS, type DimensionVec } from "@shared/archetypes";
import { topArchetype, computeMixture, applyNudges, defaultVec } from "@shared/archetype-math";
import FeelingInput from "@/components/FeelingInput";
import GaugeSection from "@/components/GaugeSection";
import { ArrowLeft, Scale, ChevronRight, Clock, Trash2 } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import ProGate, { useIsPro } from "@/components/ProGate";
import { Link } from "wouter";
import type { Writing, Checkin } from "@shared/schema";

// ── Parallax Mirror (one-liner under username) ───────────────
function ParallaxMirror() {
  const { data } = useQuery<{ line: string | null }>({
    queryKey: ["/api/mirror-line"],
    staleTime: 15 * 60 * 1000,
  });

  if (!data?.line) return null;

  return (
    <div className="text-center -mt-2 mb-1" data-testid="text-parallax-mirror">
      <p className="text-xs font-display italic text-foreground/50 leading-relaxed">
        "{data.line}"
      </p>
      <p className="text-[9px] text-muted-foreground/30 font-mono mt-0.5 uppercase tracking-widest">
        parallax mirror
      </p>
    </div>
  );
}

// ── Daily Reading (merged forecast + mythology) ──────────────
interface DailyReadingData {
  arc_name: string;
  narrative: string;
  archetype_signals: Record<string, string>;
  dominant_mode: string;
  good_conditions: string[];
  operating_rules: string[];
  observation: string;
}

function DailyReading() {
  const { data } = useQuery<{ reading: DailyReadingData | null }>({
    queryKey: ["/api/daily-reading"],
    staleTime: 10 * 60 * 1000,
  });

  const reading = data?.reading;
  if (!reading) return null;

  const dominant = ARCHETYPE_MAP[reading.dominant_mode];

  return (
    <div
      data-testid="card-daily-reading"
      className="p-4 rounded-[10px] border border-border/40 bg-card/30 space-y-3"
    >
      {/* Arc name */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest">
          Daily Reading
        </p>
        <p className="text-xs font-display font-semibold" style={{ color: dominant?.color }}>
          {reading.arc_name}
        </p>
      </div>

      {/* Narrative */}
      <p className="text-xs text-foreground/70 leading-relaxed">
        {reading.narrative}
      </p>

      {/* Signal levels — compact row */}
      <div className="flex items-center justify-between">
        {ARCHETYPES.map(arch => {
          const level = reading.archetype_signals[arch.key] || "stable";
          const isRising = level === "rising" || level === "elevated";
          const isLow = level === "low" || level === "dormant";
          return (
            <div key={arch.key} className="text-center">
              <span
                className="text-sm font-display"
                style={{ color: arch.color, opacity: isLow ? 0.3 : 1 }}
              >
                {arch.emoji}
              </span>
              <p className={`text-[8px] font-mono mt-0.5 ${isRising ? "text-foreground/60" : "text-muted-foreground/30"}`}>
                {level}
              </p>
            </div>
          );
        })}
      </div>

      {/* Good conditions */}
      <div className="flex flex-wrap gap-1.5">
        {reading.good_conditions.map((c, i) => (
          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border border-primary/20 text-primary/70 bg-primary/5">
            {c}
          </span>
        ))}
      </div>

      {/* Observation */}
      {reading.observation && (
        <p className="text-[11px] text-muted-foreground/50 italic leading-relaxed">
          {reading.observation}
        </p>
      )}
    </div>
  );
}

// ── Insight Feed ──────────────────────────────────────────────
interface MythologyData {
  empty?: boolean;
  arc_name?: string;
  narrative?: string;
  baseline_archetype?: string;
  current_archetype?: string;
  emerging_archetype?: string;
  observation?: string;
}

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

// ── Reflection History ──────────────────────────────────────

function ReflectionHistory() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: checkins = [] } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/checkins/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/checkins"] });
    },
  });

  const handleDelete = (id: number) => {
    if (window.confirm("Delete this reflection?")) {
      deleteMutation.mutate(id);
    }
  };

  if (checkins.length === 0) return null;

  return (
    <div className="rounded-[10px] border border-border/40 bg-card/20 overflow-hidden" data-testid="section-reflections">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-card/40 transition-colors"
        data-testid="button-toggle-reflections"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground/40" />
          <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">
            Past Reflections
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-mono font-semibold">
            {checkins.length}
          </span>
        </div>
        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground/40 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2 max-h-[400px] overflow-y-auto">
          {checkins.map((c) => {
            const arch = c.self_archetype ? ARCHETYPE_MAP[c.self_archetype] : null;
            const ts = new Date(c.timestamp);
            const dateStr = ts.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const timeStr = ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
            let selfVecParsed: Record<string, number> = {};
            try { selfVecParsed = JSON.parse(c.self_vec); } catch {}
            const topDim = Object.entries(selfVecParsed).sort((a, b) => b[1] - a[1])[0];

            return (
              <div
                key={c.id}
                className="p-3 rounded-lg bg-card/30 border border-border/20"
                data-testid={`reflection-${c.id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {arch && (
                      <span className="text-sm font-display" style={{ color: arch.color }}>
                        {arch.emoji}
                      </span>
                    )}
                    <span className="text-xs font-medium" style={{ color: arch?.color }}>
                      {arch?.name || "Reflection"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-muted-foreground/30">
                      {dateStr} {timeStr}
                    </span>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-0.5 rounded text-muted-foreground/20 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Delete"
                      data-testid={`button-delete-reflection-${c.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {c.feeling_text && (
                  <p className="text-[11px] text-muted-foreground/60 leading-relaxed mb-1.5 italic">
                    "{c.feeling_text}"
                  </p>
                )}
                {c.llm_narrative && (
                  <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                    {c.llm_narrative}
                  </p>
                )}
                {topDim && (
                  <p className="text-[9px] font-mono text-muted-foreground/30 mt-1">
                    top signal: {topDim[0]} ({topDim[1]})
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Streak Counter ───────────────────────────────────────────
function StreakCounter() {
  const { data: checkins = [] } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins"],
  });

  if (checkins.length === 0) return null;

  // Calculate streak: consecutive days with check-ins
  const today = new Date().toISOString().slice(0, 10);
  const checkinDates = new Set(checkins.map(c => c.timestamp.slice(0, 10)));
  
  let streak = 0;
  let checkDate = new Date();
  
  // Check today or yesterday as starting point
  if (checkinDates.has(today)) {
    streak = 1;
    checkDate = new Date(Date.now() - 86400000);
  } else {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (checkinDates.has(yesterday)) {
      streak = 1;
      checkDate = new Date(Date.now() - 2 * 86400000);
    } else {
      // Show last check-in date instead
      const lastDate = checkins[0]?.timestamp.slice(0, 10);
      const daysAgo = Math.floor((Date.now() - new Date(lastDate + "T12:00:00").getTime()) / 86400000);
      return (
        <p className="text-center text-[10px] font-mono text-muted-foreground/30">
          last check-in: {daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`}
        </p>
      );
    }
  }

  // Count consecutive previous days
  while (true) {
    const dateStr = checkDate.toISOString().slice(0, 10);
    if (checkinDates.has(dateStr)) {
      streak++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    } else {
      break;
    }
  }

  if (streak <= 1) return null;

  return (
    <p className="text-center text-[10px] font-mono text-muted-foreground/30">
      {streak} day streak
    </p>
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
          
          // Latest summaries for display — but don't restore stale narrative
          const latest = checkins[checkins.length - 1];
          if (latest.spotify_summary) setSpotifySummary(latest.spotify_summary);
          // Don't restore old llm_narrative — it's from a past session and confusing
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
      queryClient.invalidateQueries({ queryKey: ["/api/daily-reading"] });
      // Micro-animation: pulse the button
      const btn = document.querySelector('[data-testid="button-save-checkin"]') as HTMLElement;
      if (btn) {
        btn.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';
        btn.style.transform = 'scale(1.03)';
        btn.style.boxShadow = '0 0 20px hsl(var(--primary) / 0.3)';
        setTimeout(() => {
          btn.style.transform = 'scale(1)';
          btn.style.boxShadow = 'none';
        }, 300);
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save check-in", variant: "destructive" });
    }
  });

  return (
    <div className="min-h-screen bg-background pb-20 noise-overlay">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <header className="pt-2 pb-2">
          <div className="flex items-center justify-between mb-2">
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Home
            </Link>
            <div />
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-xl font-display font-semibold tracking-tight text-foreground">Instant Reflection</h1>
              <InfoTooltip text="Check in with how you're feeling. The LLM interprets your words into 8 identity dimensions, building your archetype profile over time. Save check-ins to track your patterns." />
            </div>
            <p className="text-[10px] text-muted-foreground/40 font-mono mt-0.5">how are you feeling right now?</p>
          </div>
        </header>

        {/* Streak Counter */}
        <StreakCounter />

        {/* Parallax Mirror — one-liner identity synopsis */}
        <ParallaxMirror />

        {/* Daily Reading — merged forecast + mythology (Pro) */}
        <ProGate feature="Daily Reading">
          <DailyReading />
        </ProGate>

        {/* Feeling Input */}
        <FeelingInput
          value={feelingText}
          onChange={setFeelingText}
          onInterpret={() => interpretMutation.mutate(feelingText)}
          isLoading={interpretMutation.isPending}
          narrative={llmNarrative}
        />

        {/* Gauge Section */}
        <GaugeSection
          selfVec={selfVec}
          dataVec={dataVec}
          selfArchetype={selfArchetypeKey}
          dataArchetype={dataArchetypeKey}
        />

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
            {saveCheckinMutation.isPending ? "Saving..." : saveCheckinMutation.isSuccess ? "✓ Saved" : "Save check-in"}
          </button>
        </div>

        {/* Reflection History */}
        <ReflectionHistory />

        {/* Decision Lab */}
        <Link href="/decisions">
          <div className="flex items-center justify-between p-3 rounded-[10px] border border-border/30 bg-card/20 hover:bg-card/40 transition-colors cursor-pointer group">
            <div className="flex items-center gap-2.5">
              <Scale className="w-4 h-4 text-muted-foreground/40" />
              <div>
                <p className="text-xs font-medium text-foreground/70">Decision Lab</p>
                <p className="text-[10px] text-muted-foreground/40">Evaluate choices against your archetype profile</p>
              </div>
            </div>
            <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/40 rotate-180 transition-colors" />
          </div>
        </Link>

      </div>
    </div>
  );
}
