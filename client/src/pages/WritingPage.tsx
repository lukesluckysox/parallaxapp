import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { ArrowLeft, Sparkles, ChevronDown, ChevronRight, Trash2, Lock } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import { useIsPro } from "@/components/ProGate";
import PoliticalCompass from "@/components/PoliticalCompass";
import MbtiRadar from "@/components/MbtiRadar";
import MoralFoundations from "@/components/MoralFoundations";
import SignalStrength from "@/components/SignalStrength";
import { ARCHETYPE_MAP, DIMENSIONS } from "@shared/archetypes";
import type { Writing } from "@shared/schema";

// ── Liminal Provenance ─────────────────────────────────
const LIMINAL_TOOL_NAMES_WRITING: Record<string, string> = {
  "fool": "The Fool",
  "genealogist": "The Genealogist",
  "interlocutor": "The Interlocutor",
  "interpreter": "The Interpreter",
  "stoics-ledger": "The Stoic's Ledger",
  "small-council": "Small Council",
};

function getLiminalSlugFromWriting(w: Writing): string | null {
  // Title format: "Liminal Session — {toolSlug} ({sessionId})"
  if (!w.title) return null;
  const match = w.title.match(/^Liminal Session \u2014 ([^\s(]+)/);
  return match ? match[1].trim() : null;
}

function WritingLiminalBadge({ slug }: { slug: string }) {
  const toolName = LIMINAL_TOOL_NAMES_WRITING[slug] || slug;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium"
      style={{ background: "#9c865422", color: "#9c8654", border: "1px solid #9c865440" }}
    >
      <span style={{ opacity: 0.7 }}>◈</span> From Liminal · {toolName}
    </span>
  );
}

const DIMENSION_LABELS: Record<string, string> = {
  focus: "Focus",
  calm: "Calm",
  agency: "Agency",
  vitality: "Vitality",
  social: "Social",
  creativity: "Creativity",
  exploration: "Exploration",
  drive: "Drive",
};

interface MirrorMoment {
  line: string;
  interpretation: string;
}

interface PoliticalCompassData {
  economic: number;
  social: number;
  explanation: string;
}

interface MbtiData {
  extraversion: number;
  intuition: number;
  feeling: number;
  perceiving: number;
  type: string;
  explanation: string;
}

interface MoralFoundationsData {
  care: number;
  fairness: number;
  loyalty: number;
  authority: number;
  sanctity: number;
  liberty: number;
  explanation: string;
}

interface QuoteData {
  text: string;
  author: string;
}

interface BookData {
  title: string;
  author: string;
  reason: string;
}

interface WritingAnalysis {
  emotions: Record<string, number>;
  dimensions: Record<string, number>;
  archetype_lean: string;
  narrative: string;
  nudges: Record<string, number>;
  word_themes: string[];
  mirror_moment?: MirrorMoment;
  political_compass?: PoliticalCompassData;
  mbti?: MbtiData;
  moral_foundations?: MoralFoundationsData;
  quotes?: QuoteData[];
  recommended_reading?: BookData[];
}

/* ─── Shared display sections for both current result and history ─── */

function AnalysisCharts({ analysis }: { analysis: Partial<WritingAnalysis> }) {
  const hasPolitical = analysis.political_compass && typeof analysis.political_compass.economic === "number";
  const hasMbti = analysis.mbti && analysis.mbti.type;
  const hasMoral = analysis.moral_foundations && typeof analysis.moral_foundations.care === "number";

  if (!hasPolitical && !hasMbti && !hasMoral) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="section-analysis-charts">
      {hasPolitical && (
        <div className="rounded-[10px] border border-border bg-card p-3 space-y-2">
          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">
            Political Compass
          </h4>
          <PoliticalCompass
            economic={analysis.political_compass!.economic}
            social={analysis.political_compass!.social}
          />
          <p className="text-[10px] text-muted-foreground leading-relaxed text-center">
            {analysis.political_compass!.explanation}
          </p>
          <p className="text-[9px] text-muted-foreground/50 text-center italic">
            Maps your writing's themes onto a political spectrum
          </p>
        </div>
      )}

      {hasMbti && (
        <div className="rounded-[10px] border border-border bg-card p-3 space-y-2">
          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">
            MBTI Profile
          </h4>
          <MbtiRadar
            extraversion={analysis.mbti!.extraversion}
            intuition={analysis.mbti!.intuition}
            feeling={analysis.mbti!.feeling}
            perceiving={analysis.mbti!.perceiving}
            type={analysis.mbti!.type}
          />
          <p className="text-[10px] text-muted-foreground leading-relaxed text-center">
            {analysis.mbti!.explanation}
          </p>
          <p className="text-[9px] text-muted-foreground/50 text-center italic">
            Infers your cognitive style from how you write
          </p>
        </div>
      )}

      {hasMoral && (
        <div className="rounded-[10px] border border-border bg-card p-3 space-y-2">
          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">
            Moral Foundations
          </h4>
          <MoralFoundations
            care={analysis.moral_foundations!.care}
            fairness={analysis.moral_foundations!.fairness}
            loyalty={analysis.moral_foundations!.loyalty}
            authority={analysis.moral_foundations!.authority}
            sanctity={analysis.moral_foundations!.sanctity}
            liberty={analysis.moral_foundations!.liberty}
          />
          <p className="text-[10px] text-muted-foreground leading-relaxed text-center">
            {analysis.moral_foundations!.explanation}
          </p>
          <p className="text-[9px] text-muted-foreground/50 text-center italic">
            Shows which moral values your writing emphasizes
          </p>
        </div>
      )}
    </div>
  );
}

function QuotesSection({ quotes }: { quotes: QuoteData[] }) {
  if (!quotes || quotes.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="section-quotes">
      <h3 className="text-xs font-medium text-muted-foreground">Words for Reflection</h3>
      <div className="space-y-2">
        {quotes.map((q, i) => (
          <div
            key={i}
            data-testid={`card-quote-${i}`}
            className="pl-3 border-l-2 border-primary/40 py-1.5"
          >
            <p className="text-sm italic font-serif leading-relaxed text-foreground">
              "{q.text}"
            </p>
            <p className="text-[11px] text-muted-foreground text-right mt-1">
              — {q.author}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadingSection({ books }: { books: BookData[] }) {
  if (!books || books.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="section-recommended-reading">
      <h3 className="text-xs font-medium text-muted-foreground">Recommended Reading</h3>
      <div className="space-y-2">
        {books.map((b, i) => (
          <div
            key={i}
            data-testid={`card-book-${i}`}
            className="p-3 rounded-[10px] border border-border bg-card space-y-1"
          >
            <p className="text-sm font-semibold text-foreground">{b.title}</p>
            <p className="text-xs text-muted-foreground">{b.author}</p>
            <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{b.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Extended analysis sections (charts + quotes + reading) ─── */
function ExtendedAnalysis({ analysis, compact }: { analysis: Partial<WritingAnalysis>; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      <AnalysisCharts analysis={analysis} />
      {analysis.quotes && <QuotesSection quotes={analysis.quotes} />}
      {analysis.recommended_reading && <ReadingSection books={analysis.recommended_reading} />}
    </div>
  );
}

/* ─── Collapsible Section ─── */
function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2.5 px-1 group transition-colors"
      >
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest group-hover:text-foreground/60 transition-colors">
          {title}
        </span>
        <ChevronRight
          className={`w-3.5 h-3.5 text-muted-foreground/40 transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

/* ─── Inner Mirror signal strength ─── */
// Strength is computed from total deep-analyzed entries (those with MBTI/compass/moral data).
// 0 = 0 entries, 1 = 1 entry, 2 = 2 (unlock), 3 = 3-4, 4 = 5-7, 5 = 8+
function mirrorStrength(deepCount: number): number {
  if (deepCount === 0) return 0;
  if (deepCount === 1) return 1;
  if (deepCount === 2) return 2;
  if (deepCount <= 4) return 3;
  if (deepCount <= 7) return 4;
  return 5;
}

const MIRROR_THRESHOLD = 2; // strength >= 2 to unlock (2+ deep-analyzed entries)

/* ─── Cumulative Portrait ─── */
function CumulativeAnalysis({ writings }: { writings: Writing[] }) {
  const cumulative = useMemo(() => {
    const parsed = writings
      .map((w) => {
        try {
          return w.analysis ? (JSON.parse(w.analysis) as Partial<WritingAnalysis>) : null;
        } catch {
          return null;
        }
      })
      .filter((a): a is Partial<WritingAnalysis> => a !== null);

    // Count entries with deep analysis data
    const deepCount = parsed.filter(
      (a) => (a.mbti && a.mbti.type) || (a.political_compass && typeof a.political_compass.economic === "number") || (a.moral_foundations && typeof a.moral_foundations.care === "number")
    ).length;

    const strength = mirrorStrength(deepCount);

    if (parsed.length < 2) return { strength, deepCount, data: null };

    // Political compass averages
    const compassEntries = parsed.filter(
      (a) => a.political_compass && typeof a.political_compass.economic === "number"
    );
    const avgCompass =
      compassEntries.length > 0
        ? {
            economic:
              compassEntries.reduce((s, a) => s + a.political_compass!.economic, 0) /
              compassEntries.length,
            social:
              compassEntries.reduce((s, a) => s + a.political_compass!.social, 0) /
              compassEntries.length,
          }
        : null;

    // MBTI averages
    const mbtiEntries = parsed.filter((a) => a.mbti && a.mbti.type);
    let avgMbti: { extraversion: number; intuition: number; feeling: number; perceiving: number; type: string } | null =
      null;
    if (mbtiEntries.length > 0) {
      const avgE =
        mbtiEntries.reduce((s, a) => s + (a.mbti!.extraversion ?? 50), 0) / mbtiEntries.length;
      const avgN =
        mbtiEntries.reduce((s, a) => s + (a.mbti!.intuition ?? 50), 0) / mbtiEntries.length;
      const avgF =
        mbtiEntries.reduce((s, a) => s + (a.mbti!.feeling ?? 50), 0) / mbtiEntries.length;
      const avgP =
        mbtiEntries.reduce((s, a) => s + (a.mbti!.perceiving ?? 50), 0) / mbtiEntries.length;
      // Majority letter at each position
      const letters = mbtiEntries.map((a) => a.mbti!.type);
      const letter = (idx: number, a: string, b: string) => {
        let countA = 0;
        for (const l of letters) if (l[idx] === a) countA++;
        return countA >= letters.length - countA ? a : b;
      };
      const type = `${letter(0, "E", "I")}${letter(1, "N", "S")}${letter(2, "F", "T")}${letter(3, "P", "J")}`;
      avgMbti = { extraversion: avgE, intuition: avgN, feeling: avgF, perceiving: avgP, type };
    }

    // Moral foundations averages
    const moralEntries = parsed.filter(
      (a) => a.moral_foundations && typeof a.moral_foundations.care === "number"
    );
    const avgMoral =
      moralEntries.length > 0
        ? {
            care: moralEntries.reduce((s, a) => s + a.moral_foundations!.care, 0) / moralEntries.length,
            fairness:
              moralEntries.reduce((s, a) => s + a.moral_foundations!.fairness, 0) / moralEntries.length,
            loyalty:
              moralEntries.reduce((s, a) => s + a.moral_foundations!.loyalty, 0) / moralEntries.length,
            authority:
              moralEntries.reduce((s, a) => s + a.moral_foundations!.authority, 0) / moralEntries.length,
            sanctity:
              moralEntries.reduce((s, a) => s + a.moral_foundations!.sanctity, 0) / moralEntries.length,
            liberty:
              moralEntries.reduce((s, a) => s + a.moral_foundations!.liberty, 0) / moralEntries.length,
          }
        : null;

    // Emotions averages → top 6
    const emotionEntries = parsed.filter(
      (a) => a.emotions && Object.keys(a.emotions).length > 0
    );
    let topEmotions: { emotion: string; value: number }[] = [];
    if (emotionEntries.length > 0) {
      const emotionTotals: Record<string, { sum: number; count: number }> = {};
      for (const a of emotionEntries) {
        for (const [k, v] of Object.entries(a.emotions!)) {
          if (!emotionTotals[k]) emotionTotals[k] = { sum: 0, count: 0 };
          emotionTotals[k].sum += v as number;
          emotionTotals[k].count++;
        }
      }
      topEmotions = Object.entries(emotionTotals)
        .map(([emotion, { sum, count }]) => ({ emotion, value: sum / count }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
    }

    // Recurring themes
    const themeCounts: Record<string, number> = {};
    for (const a of parsed) {
      if (a.word_themes) {
        for (const t of a.word_themes) {
          themeCounts[t] = (themeCounts[t] || 0) + 1;
        }
      }
    }
    const topThemes = Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([theme, count]) => ({ theme, count }));

    return { strength, deepCount, data: { avgCompass, avgMbti, avgMoral, topEmotions, topThemes, entryCount: parsed.length } };
  }, [writings]);

  if (!cumulative) return null;

  const { strength, deepCount } = cumulative;

  // Show locked state if below threshold
  if (strength < MIRROR_THRESHOLD) {
    const hint = deepCount === 0
      ? "submit 2 writings with deep analysis to unlock"
      : `${2 - deepCount} more deep-analyzed writing${2 - deepCount === 1 ? "" : "s"} to unlock`;
    return (
      <div
        className="space-y-3 p-4 rounded-[12px] bg-accent/10 border border-dashed border-border/40"
        data-testid="section-cumulative-analysis-locked"
      >
        <div className="text-center space-y-2">
          <h2 className="text-sm font-bold tracking-tight text-muted-foreground/40">Cumulative Portrait</h2>
          <div className="flex justify-center">
            <SignalStrength strength={strength} label="inner mirror" />
          </div>
          <p className="text-[10px] font-mono text-muted-foreground/30">{hint}</p>
          <p className="text-[9px] text-muted-foreground/20">
            Enable "Deep Layer" when analyzing to build your portrait
          </p>
        </div>
      </div>
    );
  }

  // Unlocked but no aggregable data yet (e.g. 2 deep entries but < 2 total parsed)
  if (!cumulative.data) return null;

  const { avgCompass, avgMbti, avgMoral, topEmotions, topThemes, entryCount } = cumulative.data;

  return (
    <div
      className="space-y-4 p-4 rounded-[12px] bg-accent/30 border border-border/50"
      data-testid="section-cumulative-analysis"
    >
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-3">
          <h2 className="text-sm font-bold tracking-tight">Cumulative Portrait</h2>
          <SignalStrength strength={strength} compact />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Aggregated from {entryCount} writing entries
        </p>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {avgCompass && (
          <div className="rounded-[10px] border border-border bg-card p-3 space-y-2">
            <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">
              Political Compass
            </h4>
            <PoliticalCompass economic={avgCompass.economic} social={avgCompass.social} />
            <p className="text-[9px] text-muted-foreground/50 text-center italic">
              Average position across all entries
            </p>
          </div>
        )}

        {avgMbti && (
          <div className="rounded-[10px] border border-border bg-card p-3 space-y-2">
            <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">
              MBTI Profile
            </h4>
            <MbtiRadar
              extraversion={avgMbti.extraversion}
              intuition={avgMbti.intuition}
              feeling={avgMbti.feeling}
              perceiving={avgMbti.perceiving}
              type={avgMbti.type}
            />
            <p className="text-[9px] text-muted-foreground/50 text-center italic">
              Consensus type across entries
            </p>
          </div>
        )}

        {avgMoral && (
          <div className="rounded-[10px] border border-border bg-card p-3 space-y-2">
            <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">
              Moral Foundations
            </h4>
            <MoralFoundations
              care={avgMoral.care}
              fairness={avgMoral.fairness}
              loyalty={avgMoral.loyalty}
              authority={avgMoral.authority}
              sanctity={avgMoral.sanctity}
              liberty={avgMoral.liberty}
            />
            <p className="text-[9px] text-muted-foreground/50 text-center italic">
              Averaged moral emphasis
            </p>
          </div>
        )}
      </div>

      {/* Top emotions */}
      {topEmotions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">Dominant Emotions</h3>
          <div className="space-y-1.5">
            {topEmotions.map(({ emotion, value }) => (
              <div key={emotion} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-24 capitalize">{emotion}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all"
                    style={{ width: `${Math.round(value * 100)}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
                  {Math.round(value * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recurring themes */}
      {topThemes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">Recurring Themes</h3>
          <div className="flex flex-wrap gap-1.5">
            {topThemes.map(({ theme, count }) => (
              <span
                key={theme}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent text-accent-foreground border border-border"
              >
                {theme}
                {count > 1 && (
                  <span className="ml-1 text-[9px] text-muted-foreground/70">×{count}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WritingPage() {
  const { toast } = useToast();
  const isPro = useIsPro();
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [dateWritten, setDateWritten] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<WritingAnalysis | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Analysis depth checkboxes
  const [depthPrimary, setDepthPrimary] = useState(true);
  const [depthSecondary, setDepthSecondary] = useState(false);
  const [depthDeep, setDepthDeep] = useState(false);

  const { data: writings = [], refetch } = useQuery<Writing[]>({
    queryKey: ["/api/writings"],
  });

  const handleAnalyze = async () => {
    if (!content.trim()) return;
    setAnalyzing(true);
    setResult(null);
    try {
      const tiers: string[] = [];
      if (depthPrimary) tiers.push("primary");
      if (depthSecondary) tiers.push("secondary");
      if (depthDeep) tiers.push("deep");
      if (tiers.length === 0) tiers.push("primary");

      // Submit writing — returns immediately with pending status
      const submitRes = await apiRequest("POST", "/api/writing/analyze", {
        content,
        title: title || undefined,
        dateWritten: dateWritten || undefined,
        tiers,
      });
      const submitData = await submitRes.json();

      if (submitData.status === "pending" && submitData.id) {
        // Poll for completion
        const writingId = submitData.id;
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds max

        const poll = async (): Promise<void> => {
          attempts++;
          if (attempts > maxAttempts) {
            toast({ title: "Timeout", description: "Analysis is taking longer than expected. Check back in the writing history.", variant: "destructive" });
            setAnalyzing(false);
            refetch();
            return;
          }

          try {
            const statusRes = await apiRequest("GET", `/api/writing/${writingId}/status`);
            const statusData = await statusRes.json();

            if (statusData.status === "complete") {
              setResult(statusData);
              setAnalyzing(false);
              refetch();
              return;
            } else if (statusData.status === "failed") {
              toast({ title: "Error", description: "Analysis failed. Try again.", variant: "destructive" });
              setAnalyzing(false);
              refetch();
              return;
            }

            // Still pending — wait and poll again
            await new Promise(resolve => setTimeout(resolve, 1000));
            return poll();
          } catch {
            toast({ title: "Error", description: "Could not check analysis status.", variant: "destructive" });
            setAnalyzing(false);
            refetch();
          }
        };

        await poll();
      } else if (submitData.narrative || submitData.emotions) {
        // Synchronous response (backward compat)
        setResult(submitData);
        setAnalyzing(false);
        refetch();
      } else {
        toast({ title: "Error", description: submitData.error || "Could not analyze writing.", variant: "destructive" });
        setAnalyzing(false);
      }
    } catch (err: any) {
      let msg = "Could not analyze writing. Try again.";
      try {
        const errText = err?.message || "";
        if (errText.includes(":")) {
          const body = errText.substring(errText.indexOf(":") + 1).trim();
          const parsed = JSON.parse(body);
          if (parsed.error) msg = parsed.error;
        }
      } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
      setAnalyzing(false);
    }
  };

  const parseAnalysis = (analysisStr: string | null): Partial<WritingAnalysis> | null => {
    if (!analysisStr) return null;
    try {
      return JSON.parse(analysisStr);
    } catch {
      return null;
    }
  };

  const parseNudges = (nudgesStr: string | null): Record<string, number> | null => {
    if (!nudgesStr) return null;
    try {
      return JSON.parse(nudgesStr);
    } catch {
      return null;
    }
  };

  return (
    <div className="min-h-screen bg-background noise-overlay">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between pt-2 pb-1">
          <Link
            href="/mirrors"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Mirrors
          </Link>
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-bold tracking-tight" data-testid="text-writing-title">
              Inner Mirror
            </h1>
            <InfoTooltip text="Submit writing for multi-layered identity analysis. Primary tier extracts emotions, mirror moments, and narrative. Secondary and Deep tiers unlock dimensions, MBTI, and philosophical patterns." />
          </div>
          <div />
        </header>

        <p className="text-xs text-muted-foreground text-center -mt-3">
          Your writing reveals who you are right now
        </p>

        {/* Input Form */}
        <div className="space-y-3">
          <input
            data-testid="input-writing-page-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full px-3 py-2 rounded-[10px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
          />
          <input
            data-testid="input-writing-page-date"
            type="text"
            value={dateWritten}
            onChange={(e) => setDateWritten(e.target.value)}
            placeholder="Date written (optional, e.g. March 2024)"
            className="w-full px-3 py-2 rounded-[10px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
          />
          <textarea
            data-testid="input-writing-page-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your writing here — poems, journal entries, fragments, prose..."
            rows={10}
            className="w-full px-3 py-3 rounded-[10px] border border-border bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50 font-serif leading-relaxed"
          />

          {/* Analysis Depth Selection */}
          <div className="flex items-center gap-4 px-1">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-mono">Depth</p>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={depthPrimary}
                onChange={(e) => setDepthPrimary(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border accent-primary"
                data-testid="checkbox-depth-primary"
              />
              <span className="text-[11px] text-muted-foreground">Primary</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={depthSecondary}
                onChange={(e) => setDepthSecondary(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border accent-primary"
                data-testid="checkbox-depth-secondary"
              />
              <span className="text-[11px] text-muted-foreground">Secondary</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={depthDeep}
                onChange={(e) => setDepthDeep(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border accent-primary"
                data-testid="checkbox-depth-deep"
              />
              <span className="text-[11px] text-muted-foreground">Deep Layer</span>
            </label>
          </div>

          {isPro ? (
            <button
              data-testid="button-analyze-writing-page"
              onClick={handleAnalyze}
              disabled={analyzing || !content.trim()}
              className="w-full py-3 rounded-[10px] bg-primary text-primary-foreground text-sm font-medium transition-all hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {analyzing ? (
                <><Sparkles className="w-3.5 h-3.5 animate-pulse" /> Analyzing...</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /> Analyze</>
              )}
            </button>
          ) : (
            <div className="w-full py-3 rounded-[10px] border border-border/30 bg-card/50 text-sm text-muted-foreground/30 inline-flex items-center justify-center gap-2">
              <Lock className="w-3.5 h-3.5" /> Writing Analysis (Fellow)
            </div>
          )}
        </div>

        {/* Current Analysis Result */}
        {result && (
          <div className="space-y-3">

            {/* ═══ PRIMARY INSIGHTS (open by default) ═══ */}
            <CollapsibleSection title="Primary Insights" defaultOpen>
              <div className="space-y-4">
                {/* Mirror Moment */}
                {result.mirror_moment && (
                  <div
                    data-testid="card-mirror-moment"
                    className="p-4 rounded-[10px] bg-card/50 border border-border/40"
                  >
                    <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-2">
                      Mirror Moment
                    </p>
                    <p className="text-base italic font-display leading-relaxed text-foreground mb-2">
                      "{result.mirror_moment.line}"
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {result.mirror_moment.interpretation}
                    </p>
                  </div>
                )}

                {/* Narrative Reading */}
                <div
                  data-testid="card-writing-page-narrative"
                  className="p-4 rounded-[10px] bg-card/50 border border-border/40"
                >
                  <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-2">
                    Narrative Reading
                  </p>
                  <p className="text-sm leading-relaxed text-foreground/80">
                    {result.narrative}
                  </p>
                </div>

                {/* Emotional Tone */}
                {result.emotions && Object.keys(result.emotions).length > 0 && (
                  <div className="p-4 rounded-[10px] bg-card/50 border border-border/40">
                    <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-3">
                      Emotional Tone
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(result.emotions)
                        .sort(([, a], [, b]) => b - a)
                        .map(([emotion, intensity]) => (
                          <div key={emotion} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-24 capitalize">{emotion}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary/50 transition-all"
                                style={{ width: `${Math.round(intensity * 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60 w-8 text-right">
                              {Math.round(intensity * 100)}%
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            {/* ═══ SECONDARY ═══ */}
            <CollapsibleSection title="Secondary">
              <div className="space-y-4">
                {/* Dimension Scores */}
                {result.nudges && Object.keys(result.nudges).length > 0 && (
                  <div className="p-4 rounded-[10px] bg-card/30 border border-border/30">
                    <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-3">
                      Dimension Scores
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {DIMENSIONS.map((dim) => {
                        const val = result.nudges[dim] || 0;
                        if (val === 0) return null;
                        return (
                          <div
                            key={dim}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs"
                          >
                            <span className="text-muted-foreground/60">{DIMENSION_LABELS[dim]}</span>
                            <span
                              className={`font-mono font-medium tabular-nums ${
                                val > 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
                              }`}
                            >
                              {val > 0 ? "+" : ""}{val}
                            </span>
                          </div>
                        );
                      }).filter(Boolean)}
                    </div>
                  </div>
                )}

                {/* Archetype Lean */}
                {result.archetype_lean && ARCHETYPE_MAP[result.archetype_lean] && (
                  <div className="p-4 rounded-[10px] bg-card/30 border border-border/30">
                    <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-2">
                      Archetype Lean
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-display" style={{ color: ARCHETYPE_MAP[result.archetype_lean]?.color }}>{ARCHETYPE_MAP[result.archetype_lean]?.emoji}</span>
                      <div>
                        <p
                          className="text-sm font-medium"
                          style={{ color: ARCHETYPE_MAP[result.archetype_lean]?.color }}
                        >
                          {ARCHETYPE_MAP[result.archetype_lean]?.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground/50">
                          {ARCHETYPE_MAP[result.archetype_lean]?.coreDrive}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Word themes */}
                {result.word_themes && result.word_themes.length > 0 && (
                  <div className="p-4 rounded-[10px] bg-card/30 border border-border/30">
                    <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-2">
                      Themes
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.word_themes.map((theme) => (
                        <span
                          key={theme}
                          className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-accent/50 text-foreground/60 border border-border/40"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quotes + Reading */}
                {result.quotes && <QuotesSection quotes={result.quotes} />}
                {result.recommended_reading && <ReadingSection books={result.recommended_reading} />}
              </div>
            </CollapsibleSection>

            {/* ═══ HIDDEN DEEPER LAYER ═══ */}
            {(result.mbti || result.political_compass || result.moral_foundations) && (
              <CollapsibleSection title="Hidden Deeper Layer">
                <AnalysisCharts analysis={result} />
              </CollapsibleSection>
            )}
          </div>
        )}

        {/* Cumulative Portrait */}
        <CumulativeAnalysis writings={writings} />

        {/* Writing History */}
        {writings.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold">Writing history</h2>
            <div className="space-y-2">
              {writings.map((w) => {
                const analysis = parseAnalysis(w.analysis);
                const nudges = parseNudges(w.nudges);
                const isExpanded = expandedId === w.id;
                const ts = new Date(w.timestamp);
                const dateStr = ts.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const archKey = analysis?.archetype_lean;
                const arch = archKey ? ARCHETYPE_MAP[archKey] : null;
                const liminalSlug = getLiminalSlugFromWriting(w);

                return (
                  <div
                    key={w.id}
                    data-testid={`card-writing-${w.id}`}
                    className="rounded-[10px] border border-border bg-card overflow-hidden"
                  >
                    <button
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : w.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        {arch && <span className="text-sm font-display" style={{ color: arch.color }}>{arch.emoji}</span>}
                        <span className="text-sm font-medium truncate">
                          {w.title || "Untitled"}
                        </span>
                        {arch && (
                          <span className="text-xs" style={{ color: arch.color }}>
                            {arch.name}
                          </span>
                        )}
                        {liminalSlug && <WritingLiminalBadge slug={liminalSlug} />}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">{dateStr}</span>
                        <button
                          data-testid={`button-delete-writing-${w.id}`}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!window.confirm("Delete this entry?")) return;
                            apiRequest("DELETE", `/api/writings/${w.id}`).then(() => {
                              queryClient.invalidateQueries({ queryKey: ["/api/writings"] });
                            });
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-3 border-t border-border/50">
                        {/* Narrative */}
                        {analysis?.narrative && (
                          <div className="p-2.5 rounded-lg border border-primary/20 bg-primary/5 text-xs leading-relaxed mt-2">
                            {analysis.narrative}
                          </div>
                        )}

                        {/* Emotions */}
                        {analysis?.emotions && Object.keys(analysis.emotions).length > 0 && (
                          <div className="space-y-1">
                            {Object.entries(analysis.emotions)
                              .sort(([, a], [, b]) => (b as number) - (a as number))
                              .slice(0, 4)
                              .map(([emotion, intensity]) => (
                                <div key={emotion} className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground w-16 capitalize">{emotion}</span>
                                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-primary/50"
                                      style={{ width: `${Math.round((intensity as number) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}

                        {/* Nudges */}
                        {nudges && Object.keys(nudges).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(nudges)
                              .filter(([, v]) => v !== 0)
                              .map(([dim, val]) => (
                                <span
                                  key={dim}
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    val > 0
                                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                      : "bg-red-500/10 text-red-500 dark:text-red-400"
                                  }`}
                                >
                                  {DIMENSION_LABELS[dim]} {val > 0 ? "+" : ""}{val}
                                </span>
                              ))}
                          </div>
                        )}

                        {/* Word themes */}
                        {analysis?.word_themes && (analysis.word_themes as string[]).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(analysis.word_themes as string[]).map((theme) => (
                              <span
                                key={theme}
                                className="px-2 py-0.5 rounded-full text-[10px] bg-accent text-accent-foreground border border-border"
                              >
                                {theme}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Extended analysis (charts, quotes, reading) for history entries */}
                        {analysis && <ExtendedAnalysis analysis={analysis} compact />}

                        {/* Preview of content */}
                        <p className="text-xs text-muted-foreground/60 italic line-clamp-3 font-serif">
                          {w.content}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
