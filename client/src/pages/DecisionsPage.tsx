import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, ChevronDown, Clock, Check, X, Minus, Trash2, Sparkles } from "lucide-react";
import DecisionEngine from "@/components/DecisionEngine";
import InfoTooltip from "@/components/InfoTooltip";
import ProGate from "@/components/ProGate";
import { ARCHETYPE_MAP, DIMENSIONS, type DimensionVec } from "@shared/archetypes";
import { defaultVec, applyNudges } from "@shared/archetype-math";
import type { Checkin, Decision } from "@shared/schema";

function DecisionHistory() {
  const { data: decisions = [], isLoading } = useQuery<Decision[]>({
    queryKey: ["/api/decisions"],
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/decisions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/decisions"] });
    },
  });

  const handleDelete = (id: number) => {
    if (window.confirm("Delete this decision?")) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-bold flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          Decision History
        </h2>
        <div className="animate-pulse space-y-2">
          <div className="h-12 bg-muted rounded-[10px]" />
          <div className="h-12 bg-muted rounded-[10px]" />
        </div>
      </div>
    );
  }

  if (decisions.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-bold flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          Decision History
        </h2>
        <div className="p-4 rounded-[10px] border border-dashed border-border bg-card/50 text-center">
          <p className="text-xs text-muted-foreground">
            No decisions evaluated yet. Use the engine above to analyze your first decision.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        Decision History
        <span className="text-xs text-muted-foreground font-normal">({decisions.length})</span>
      </h2>
      <div className="space-y-2">
        {decisions.map((d) => {
          const arch = d.target_archetype ? ARCHETYPE_MAP[d.target_archetype] : null;
          const ts = new Date(d.timestamp);
          const dateStr = ts.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const timeStr = ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          const isExpanded = expandedId === d.id;

          return (
            <div
              key={d.id}
              data-testid={`card-decision-${d.id}`}
              className="rounded-[10px] border border-border bg-card overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : d.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/30 transition-colors"
              >
                <div className="flex-shrink-0">
                  {d.verdict === "do" && <Check className="w-4 h-4 text-green-600" />}
                  {d.verdict === "skip" && <X className="w-4 h-4 text-red-500" />}
                  {d.verdict === "neutral" && <Minus className="w-4 h-4 text-muted-foreground" />}
                  {!d.verdict && <Minus className="w-4 h-4 text-muted-foreground/40" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.decision_text}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {arch && (
                      <span className="text-[10px] font-medium" style={{ color: arch.color }}>
                        <span className="font-display">{arch.emoji}</span> {arch.name}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">{dateStr} {timeStr}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}
                    className="p-1 rounded text-muted-foreground/20 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete"
                    data-testid={`button-delete-decision-${d.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </div>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-border/50 space-y-2 pt-2">
                  {d.verdict && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Verdict:</span>
                      <span className={`text-xs font-medium ${
                        d.verdict === "do" ? "text-green-600" :
                        d.verdict === "skip" ? "text-red-500" :
                        "text-muted-foreground"
                      }`}>
                        {d.verdict === "do" ? "Do it" : d.verdict === "skip" ? "Skip it" : "Neutral"}
                      </span>
                    </div>
                  )}
                  {d.target_archetype && arch && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Target archetype:</span>
                      <span className="text-xs font-medium" style={{ color: arch.color }}>
                        <span className="font-display">{arch.emoji}</span> {arch.name}
                      </span>
                    </div>
                  )}
                  {d.alignment_before != null && d.alignment_after != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Alignment shift:</span>
                      <span className="text-xs tabular-nums">{d.alignment_before}% → {d.alignment_after}%</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Decision Suggestions ──────────────────────────────────────

function DecisionSuggestions({ onSelect }: { onSelect: (text: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/decision-suggestions", {});
      const data = await res.json();
      if (data.suggestions?.length) setSuggestions(data.suggestions);
      setGenerated(true);
    } catch {}
    setLoading(false);
  };

  if (!generated) {
    return (
      <button
        onClick={generate}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] border border-dashed border-border/40 text-xs text-muted-foreground/50 hover:text-muted-foreground/70 hover:border-border/60 transition-colors disabled:opacity-40"
        data-testid="button-generate-suggestions"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {loading ? "Generating suggestions..." : "You should consider..."}
      </button>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-1.5" data-testid="section-suggestions">
      <p className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest">
        You should consider...
      </p>
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          className="w-full text-left px-3 py-2 rounded-lg border border-border/30 bg-card/20 text-xs text-muted-foreground/60 hover:bg-card/50 hover:text-foreground/70 transition-colors"
          data-testid={`button-suggestion-${i}`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export default function DecisionsPage() {
  const [selfVec, setSelfVec] = useState<DimensionVec>(defaultVec());
  const [dataVec, setDataVec] = useState<DimensionVec | null>(null);
  const [prefillDecision, setPrefillDecision] = useState("");

  // Fetch latest check-in to derive selfVec and dataVec
  const { data: checkins = [] } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins"],
  });

  useEffect(() => {
    if (checkins.length > 0) {
      const latest = checkins[0];
      try {
        const parsedSelf = JSON.parse(latest.self_vec);
        setSelfVec(parsedSelf);
      } catch { /* keep defaults */ }
      if (latest.data_vec) {
        try {
          const parsedData = JSON.parse(latest.data_vec);
          setDataVec(parsedData);
        } catch { /* keep null */ }
      }
    }
  }, [checkins]);

  return (
    <div className="min-h-screen bg-background pb-20 noise-overlay">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <Link
            href="/snapshot"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back-home"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Snapshot
          </Link>
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-bold" data-testid="text-page-title">Decision Lab</h1>
            <InfoTooltip text="Evaluate decisions against your archetype profile. The LLM analyzes how a choice might shift your identity dimensions, and each archetype weighs in with its own verdict." />
          </div>
          <div />
        </header>

        {/* Decision Suggestions (Pro) */}
        <ProGate feature="Decision Suggestions">
          <DecisionSuggestions onSelect={(text) => setPrefillDecision(text)} />
        </ProGate>

        {/* Decision Engine */}
        <DecisionEngine selfVec={selfVec} dataVec={dataVec} prefill={prefillDecision} />

        {/* Decision History */}
        <DecisionHistory />
      </div>
    </div>
  );
}
