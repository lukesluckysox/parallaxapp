import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ARCHETYPE_MAP } from "@shared/archetypes";

const DIMENSIONS = ["focus", "calm", "agency", "vitality", "social", "creativity", "exploration", "drive"] as const;

interface GhostProfileData {
  current: {
    vec: Record<string, number>;
    archetype: string;
    terrain: string;
  };
  ghost: {
    vec: Record<string, number>;
    archetype: string;
    archetypePct: number;
    secondaryArchetype: string | null;
    secondaryPct: number | null;
    terrain: string;
    ranked: Array<{ key: string; pct: number }>;
  };
  ghostPortrait: {
    id: number;
    imageUrl: string;
    generatedAt: string;
    styleName: string;
    symbolicDescription: string;
  } | null;
}

function DimensionBar({ label, current, ghost }: { label: string; current: number; ghost: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 w-20">{label}</span>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-foreground/70 w-8 text-right">{current}</span>
          <span className="text-muted-foreground/30">/</span>
          <span className="text-purple-400/80 w-8">{ghost}</span>
        </div>
      </div>
      <div className="relative h-1.5 rounded-full bg-muted/30 overflow-hidden">
        {/* Current — muted foreground */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-foreground/25 transition-all duration-700"
          style={{ width: `${current}%` }}
        />
        {/* Ghost — purple overlay */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-purple-500/40 transition-all duration-700"
          style={{ width: `${ghost}%` }}
        />
      </div>
    </div>
  );
}

function ArchetypeTag({ archKey, pct, isGhost }: { archKey: string; pct?: number; isGhost?: boolean }) {
  const arch = ARCHETYPE_MAP[archKey];
  if (!arch) return null;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${
      isGhost
        ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
        : "bg-card text-foreground/70 border-border"
    }`}>
      <span className="text-sm">{arch.emoji}</span>
      <span>{arch.name}</span>
      {pct !== undefined && <span className="text-[10px] opacity-60">{pct}%</span>}
    </div>
  );
}

export default function GhostProfilePage() {
  const [revealed, setRevealed] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<GhostProfileData>({
    queryKey: ["/api/ghost-profile"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ghost-profile");
      return res.json();
    },
    enabled: revealed,
  });

  const generatePortrait = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ghost-profile/portrait");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ghost-profile"] });
    },
  });

  return (
    <div className="min-h-screen bg-background noise-overlay">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <header className="pt-2 pb-1">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Home
            </Link>
            <h1 className="text-lg font-bold tracking-tight">Ghost Profile</h1>
            <div />
          </div>
        </header>

        {/* Reveal CTA */}
        {!revealed ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-6">
            {/* Ghost glyph */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full border border-purple-500/20 bg-purple-500/5 flex items-center justify-center">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-purple-400/60">
                  <path d="M12 2C7.58 2 4 5.58 4 10v7c0 .55.23 1.08.62 1.45.18.17.42.3.68.38.08.02.16.04.25.05.13.01.26 0 .38-.04.16-.06.3-.15.42-.27L8 17l1.65 1.57c.39.37.99.37 1.38 0L12 17.5l.97.93c.2.19.45.28.69.28s.5-.09.69-.28L16 17l1.65 1.57c.12.12.26.21.42.27.12.04.25.05.38.04.09-.01.17-.03.25-.05.26-.08.5-.21.68-.38.39-.37.62-.9.62-1.45v-7c0-4.42-3.58-8-8-8z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4"/>
                  <circle cx="9" cy="10" r="1.5" fill="currentColor" fillOpacity="0.5"/>
                  <circle cx="15" cy="10" r="1.5" fill="currentColor" fillOpacity="0.5"/>
                </svg>
              </div>
              <div className="absolute inset-0 rounded-full animate-pulse bg-purple-500/5" />
            </div>

            <div className="text-center space-y-2 max-w-xs">
              <p className="text-sm text-foreground/80">
                Every configuration casts a shadow.
              </p>
              <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                Your ghost profile inverts your dimension vector — surfacing the archetype that would emerge if your suppressed dimensions took the lead.
              </p>
            </div>

            <button
              onClick={() => setRevealed(true)}
              className="px-5 py-2.5 rounded-full text-sm font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-500/30 transition-all duration-300"
            >
              Reveal Ghost Profile
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <Loader2 className="w-6 h-6 text-purple-400/50 animate-spin" />
            <p className="text-xs text-muted-foreground/40">Inverting your signal...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-sm text-rose-400/70">Could not derive ghost profile.</p>
            <p className="text-[10px] text-muted-foreground/40 mt-1">Complete a check-in first.</p>
          </div>
        ) : data ? (
          <div className="space-y-5 animate-in fade-in duration-700">
            {/* Explanation */}
            <div className="px-1">
              <p className="text-[10px] text-purple-400/40 leading-relaxed italic">
                This is not your true hidden self. It is the self that emerges if your suppressed dimensions lead.
              </p>
            </div>

            {/* Side-by-side archetype cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Current */}
              <div className="p-4 rounded-[10px] bg-card border border-border">
                <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-3">Current</p>
                <ArchetypeTag archKey={data.current.archetype} />
                <p className="text-[11px] text-muted-foreground/60 leading-relaxed mt-3">
                  {data.current.terrain}
                </p>
              </div>

              {/* Ghost */}
              <div className="p-4 rounded-[10px] bg-purple-500/[0.03] border border-purple-500/15">
                <p className="text-[9px] font-mono uppercase tracking-widest text-purple-400/40 mb-3">Ghost</p>
                <div className="flex flex-wrap gap-1.5">
                  <ArchetypeTag archKey={data.ghost.archetype} pct={data.ghost.archetypePct} isGhost />
                  {data.ghost.secondaryArchetype && (
                    <ArchetypeTag archKey={data.ghost.secondaryArchetype} pct={data.ghost.secondaryPct ?? undefined} isGhost />
                  )}
                </div>
                <p className="text-[11px] text-purple-300/40 leading-relaxed mt-3">
                  {data.ghost.terrain}
                </p>
              </div>
            </div>

            {/* Dimension Comparison */}
            <div className="p-4 rounded-[10px] border border-border/40 bg-card/20 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40">Dimension Comparison</p>
                <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground/30">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-1 rounded-full bg-foreground/25 inline-block" />
                    current
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-1 rounded-full bg-purple-500/40 inline-block" />
                    ghost
                  </span>
                </div>
              </div>
              {DIMENSIONS.map(dim => (
                <DimensionBar
                  key={dim}
                  label={dim}
                  current={data.current.vec[dim] ?? 50}
                  ghost={data.ghost.vec[dim] ?? 50}
                />
              ))}
            </div>

            {/* Ghost Portrait Section */}
            <div className="p-4 rounded-[10px] border border-purple-500/15 bg-purple-500/[0.03] space-y-4">
              <p className="text-[9px] font-mono uppercase tracking-widest text-purple-400/40">Ghost Portrait</p>

              {data.ghostPortrait?.imageUrl ? (
                <div className="space-y-3">
                  <div className="rounded-lg overflow-hidden border border-purple-500/10">
                    <img
                      src={data.ghostPortrait.imageUrl}
                      alt="Ghost portrait"
                      className="w-full aspect-video object-cover"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-purple-300/40 italic leading-relaxed">
                      {data.ghostPortrait.symbolicDescription}
                    </p>
                    <p className="text-[9px] text-muted-foreground/20 font-mono">
                      {data.ghostPortrait.styleName} — {new Date(data.ghostPortrait.generatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => generatePortrait.mutate()}
                    disabled={generatePortrait.isPending}
                    className="text-[10px] text-purple-400/40 hover:text-purple-400/60 transition-colors"
                  >
                    {generatePortrait.isPending ? "Regenerating..." : "Regenerate"}
                  </button>
                </div>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <p className="text-[11px] text-muted-foreground/40">
                    No ghost portrait yet. Generate the landscape your inverted dimensions would inhabit.
                  </p>
                  <button
                    onClick={() => generatePortrait.mutate()}
                    disabled={generatePortrait.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20 transition-all"
                  >
                    {generatePortrait.isPending ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate Ghost Portrait"
                    )}
                  </button>
                  {generatePortrait.isError && (
                    <p className="text-[10px] text-rose-400/60">Generation failed. Try again.</p>
                  )}
                </div>
              )}
            </div>

            {/* Archetype Mixture */}
            {data.ghost.ranked.length > 0 && (
              <div className="p-3 rounded-[10px] border border-border/30 bg-card/10 space-y-2">
                <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/30">Ghost Archetype Mixture</p>
                {data.ghost.ranked.map(r => {
                  const arch = ARCHETYPE_MAP[r.key];
                  return (
                    <div key={r.key} className="flex items-center gap-2">
                      <span className="text-sm w-5 text-center">{arch?.emoji || "?"}</span>
                      <span className="text-[10px] text-muted-foreground/50 w-16">{arch?.name || r.key}</span>
                      <div className="flex-1 h-1 rounded-full bg-muted/20 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-purple-500/30 transition-all duration-500"
                          style={{ width: `${r.pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-purple-400/40 w-8 text-right">{r.pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Shadow note */}
            <div className="px-1 pb-4">
              <p className="text-[10px] text-muted-foreground/25 leading-relaxed">
                The ghost archetype — {ARCHETYPE_MAP[data.ghost.archetype]?.name || data.ghost.archetype} — represents the orientation your current configuration actively suppresses. Its shadow text: "{ARCHETYPE_MAP[data.ghost.archetype]?.shadow || "unknown"}". This isn't a diagnosis. It's a mirror held at a different angle.
              </p>
            </div>
          </div>
        ) : null}

        <div className="pb-6" />
      </div>
    </div>
  );
}
