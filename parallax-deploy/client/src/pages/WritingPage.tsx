import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { ArrowLeft, Sparkles, ChevronDown } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import PoliticalCompass from "@/components/PoliticalCompass";
import MbtiRadar from "@/components/MbtiRadar";
import MoralFoundations from "@/components/MoralFoundations";
import { ARCHETYPE_MAP, DIMENSIONS } from "@shared/archetypes";
import type { Writing } from "@shared/schema";

const DIMENSION_LABELS: Record<string, string> = {
  focus: "Focus",
  calm: "Calm",
  discipline: "Discipline",
  health: "Health",
  social: "Social",
  creativity: "Creativity",
  exploration: "Exploration",
  ambition: "Ambition",
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

export default function WritingPage() {
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [dateWritten, setDateWritten] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<WritingAnalysis | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: writings = [], refetch } = useQuery<Writing[]>({
    queryKey: ["/api/writings"],
  });

  const handleAnalyze = async () => {
    if (!content.trim()) return;
    setAnalyzing(true);
    try {
      const res = await apiRequest("POST", "/api/writing/analyze", {
        content,
        title: title || undefined,
        dateWritten: dateWritten || undefined,
      });
      const data = await res.json();
      setResult(data);
      refetch();
    } catch (err) {
      toast({ title: "Error", description: "Could not analyze writing", variant: "destructive" });
    } finally {
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
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between pt-2 pb-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Parallax
          </Link>
          <h1 className="text-base font-bold tracking-tight" data-testid="text-writing-title">
            Inner Mirror
          </h1>
          <ThemeToggle />
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
          <button
            data-testid="button-analyze-writing-page"
            onClick={handleAnalyze}
            disabled={analyzing || !content.trim()}
            className="w-full py-3 rounded-[10px] bg-primary text-primary-foreground text-sm font-medium transition-all hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {analyzing ? (
              <>
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Analyze
              </>
            )}
          </button>
        </div>

        {/* Current Analysis Result */}
        {result && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold">Analysis</h2>

            {/* Mirror Moment */}
            {result.mirror_moment && (
              <div
                data-testid="card-mirror-moment"
                className="p-4 rounded-[10px] border-l-4 bg-card/80"
                style={{
                  borderLeftColor: result.archetype_lean && ARCHETYPE_MAP[result.archetype_lean]
                    ? ARCHETYPE_MAP[result.archetype_lean].color
                    : "hsl(var(--primary))",
                  backgroundColor: result.archetype_lean && ARCHETYPE_MAP[result.archetype_lean]
                    ? `${ARCHETYPE_MAP[result.archetype_lean].color}08`
                    : undefined,
                }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mirror Moment</span>
                </div>
                <p className="text-base italic font-serif leading-relaxed text-foreground mb-2">
                  "{result.mirror_moment.line}"
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {result.mirror_moment.interpretation}
                </p>
              </div>
            )}

            {/* Narrative */}
            <div
              data-testid="card-writing-page-narrative"
              className="p-3 rounded-[10px] border border-primary/20 bg-primary/5 text-sm leading-relaxed"
            >
              {result.narrative}
            </div>

            {/* Archetype lean */}
            {result.archetype_lean && ARCHETYPE_MAP[result.archetype_lean] && (
              <div className="flex items-center gap-3 p-3 rounded-[10px] border border-border bg-card">
                <span className="text-lg">{ARCHETYPE_MAP[result.archetype_lean]?.emoji}</span>
                <div>
                  <p className="text-xs text-muted-foreground">Archetype lean</p>
                  <p
                    className="text-sm font-medium"
                    style={{ color: ARCHETYPE_MAP[result.archetype_lean]?.color }}
                  >
                    {ARCHETYPE_MAP[result.archetype_lean]?.name}
                  </p>
                </div>
              </div>
            )}

            {/* Emotions */}
            {result.emotions && Object.keys(result.emotions).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">Emotions</h3>
                <div className="space-y-1.5">
                  {Object.entries(result.emotions)
                    .sort(([, a], [, b]) => b - a)
                    .map(([emotion, intensity]) => (
                      <div key={emotion} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-24 capitalize">{emotion}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/60 transition-all"
                            style={{ width: `${Math.round(intensity * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
                          {Math.round(intensity * 100)}%
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Dimension Nudges */}
            {result.nudges && Object.keys(result.nudges).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">Dimension impact</h3>
                <div className="grid grid-cols-2 gap-2">
                  {DIMENSIONS.map((dim) => {
                    const val = result.nudges[dim] || 0;
                    if (val === 0) return null;
                    return (
                      <div
                        key={dim}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs"
                      >
                        <span className="text-muted-foreground">{DIMENSION_LABELS[dim]}</span>
                        <span
                          className={`font-medium tabular-nums ${
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

            {/* Word themes */}
            {result.word_themes && result.word_themes.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">Themes</h3>
                <div className="flex flex-wrap gap-1.5">
                  {result.word_themes.map((theme) => (
                    <span
                      key={theme}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent text-accent-foreground border border-border"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Extended analysis: Charts, Quotes, Reading */}
            <ExtendedAnalysis analysis={result} />
          </div>
        )}

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
                      <div className="flex items-center gap-2 min-w-0">
                        {arch && <span className="text-sm">{arch.emoji}</span>}
                        <span className="text-sm font-medium truncate">
                          {w.title || "Untitled"}
                        </span>
                        {arch && (
                          <span className="text-xs" style={{ color: arch.color }}>
                            {arch.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">{dateStr}</span>
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
