import { useRef, useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { ARCHETYPES, ARCHETYPE_MAP, DIMENSIONS } from "@shared/archetypes";
import { computeMixture } from "@shared/archetype-math";
import type { DimensionVec } from "@shared/archetypes";

// ── Types ────────────────────────────────────────────────────

interface HolisticData {
  hasData: boolean;
  selfVec: Record<string, number>;
  dataVec: Record<string, number> | null;
  archetypeDistribution: Record<string, number>;
  writingArchetypes: Record<string, number>;
  topThemes: string[];
  sources: { checkins: number; writings: number; tracks: number };
  spotifyStats: {
    avgEnergy: number;
    avgValence: number;
    avgDanceability: number;
    topArtists: { name: string; count: number }[];
  };
  latestArchetype: string | null;
  latestDataArchetype: string | null;
}

interface ProfileData {
  variant: {
    variant_name: string;
    primary_archetype: string;
    secondary_archetype?: string | null;
    emergent_traits: string[];
    exploration_channels: string[];
    description: string;
  } | null;
}

interface ForecastData {
  forecast: {
    archetype_signals: Record<string, string>;
    dominant_mode: string;
    good_conditions: string[];
    forecast_narrative: string;
    operating_rules: string[];
    rare_pattern: string | null;
  } | null;
}

// ── 3D Radar Chart (SVG with CSS perspective) ────────────────

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

function RadarChart({
  selfVec,
  dataVec,
  size = 320,
}: {
  selfVec: Record<string, number>;
  dataVec: Record<string, number> | null;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;
  const dims = DIMENSIONS;
  const angleStep = (2 * Math.PI) / dims.length;

  // Build polygon points for a vec
  const vecToPoints = (vec: Record<string, number>) =>
    dims
      .map((dim, i) => {
        const val = (vec[dim] || 50) / 100;
        const angle = -Math.PI / 2 + i * angleStep;
        return `${cx + maxR * val * Math.cos(angle)},${cy + maxR * val * Math.sin(angle)}`;
      })
      .join(" ");

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1.0];

  return (
    <div
      className="relative"
      style={{
        perspective: "800px",
        perspectiveOrigin: "50% 40%",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transition-transform duration-700"
        style={{
          transform: "rotateX(15deg) rotateZ(-2deg)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Grid rings */}
        {rings.map((r) => (
          <polygon
            key={r}
            points={dims
              .map((_, i) => {
                const angle = -Math.PI / 2 + i * angleStep;
                return `${cx + maxR * r * Math.cos(angle)},${cy + maxR * r * Math.sin(angle)}`;
              })
              .join(" ")}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={r === 1 ? 0.8 : 0.4}
            opacity={r === 1 ? 0.5 : 0.2}
          />
        ))}

        {/* Axis lines */}
        {dims.map((_, i) => {
          const angle = -Math.PI / 2 + i * angleStep;
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={cx + maxR * Math.cos(angle)}
              y2={cy + maxR * Math.sin(angle)}
              stroke="hsl(var(--border))"
              strokeWidth={0.4}
              opacity={0.3}
            />
          );
        })}

        {/* Data shape (ghost) */}
        {dataVec && (
          <polygon
            points={vecToPoints(dataVec)}
            fill="hsl(var(--primary))"
            fillOpacity={0.06}
            stroke="hsl(var(--primary))"
            strokeWidth={1}
            strokeOpacity={0.25}
            strokeDasharray="4 3"
          />
        )}

        {/* Self shape */}
        <polygon
          points={vecToPoints(selfVec)}
          fill="hsl(var(--primary))"
          fillOpacity={0.12}
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          strokeOpacity={0.7}
          strokeLinejoin="round"
        />

        {/* Data points */}
        {dims.map((dim, i) => {
          const val = (selfVec[dim] || 50) / 100;
          const angle = -Math.PI / 2 + i * angleStep;
          const px = cx + maxR * val * Math.cos(angle);
          const py = cy + maxR * val * Math.sin(angle);
          return (
            <circle
              key={dim}
              cx={px}
              cy={py}
              r={2.5}
              fill="hsl(var(--primary))"
              opacity={0.8}
            />
          );
        })}

        {/* Dimension labels */}
        {dims.map((dim, i) => {
          const angle = -Math.PI / 2 + i * angleStep;
          const labelR = maxR + 18;
          const lx = cx + labelR * Math.cos(angle);
          const ly = cy + labelR * Math.sin(angle);
          const val = selfVec[dim] || 50;
          return (
            <g key={dim}>
              <text
                x={lx}
                y={ly - 5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={9}
                fill="hsl(var(--muted-foreground))"
                fontFamily="var(--font-sans)"
                fontWeight={500}
                opacity={0.7}
              >
                {DIMENSION_LABELS[dim]}
              </text>
              <text
                x={lx}
                y={ly + 7}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill="hsl(var(--foreground))"
                fontFamily="var(--font-mono)"
                fontWeight={500}
                opacity={0.5}
              >
                {val}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Archetype Ring ───────────────────────────────────────────

function ArchetypeRing({
  distribution,
  latest,
}: {
  distribution: Record<string, number>;
  latest: string | null;
}) {
  const total = Object.values(distribution).reduce((s, v) => s + v, 0) || 1;

  return (
    <div className="flex items-center justify-center gap-1">
      {ARCHETYPES.map((arch) => {
        const count = distribution[arch.key] || 0;
        const pct = Math.round((count / total) * 100);
        const isActive = arch.key === latest;
        return (
          <div
            key={arch.key}
            className={`flex flex-col items-center px-2 py-2 rounded-lg transition-all ${
              isActive ? "bg-card/80" : ""
            }`}
          >
            <span
              className="text-lg font-display"
              style={{ color: arch.color, opacity: pct > 0 ? 1 : 0.3 }}
            >
              {arch.emoji}
            </span>
            <span className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Stat Row ─────────────────────────────────────────────────

function StatRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
        {label}
      </span>
      <div className="text-right">
        <span className="text-sm font-mono text-foreground/80">{value}</span>
        {sub && (
          <span className="text-[10px] text-muted-foreground/40 ml-1.5">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function HolisticPage() {
  const { data, isLoading } = useQuery<HolisticData>({
    queryKey: ["/api/holistic"],
    staleTime: 2 * 60 * 1000,
  });

  const { data: profileData } = useQuery<ProfileData>({
    queryKey: ["/api/profile"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: forecastData } = useQuery<ForecastData>({
    queryKey: ["/api/forecast"],
    staleTime: 10 * 60 * 1000,
  });

  const selfVec = data?.selfVec || {};
  const dataVec = data?.dataVec || null;
  const variant = profileData?.variant || null;
  const forecast = forecastData?.forecast || null;
  const hasData = data?.hasData ?? false;
  const latestArch = data?.latestArchetype
    ? ARCHETYPE_MAP[data.latestArchetype]
    : null;

  // Compute archetype mix from selfVec
  const selfMix = useMemo(() => {
    if (!data?.selfVec) return null;
    const vec = data.selfVec as DimensionVec;
    return computeMixture(vec);
  }, [data?.selfVec]);

  // Scroll-based parallax
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => setScrollY(el.scrollTop);
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background noise-overlay pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <header className="flex items-center justify-between mb-8">
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Parallax
            </Link>
            <span className="text-base font-display font-semibold">Identity Parallax</span>
            <ThemeToggle />
          </header>
          <div className="flex items-center justify-center h-64">
            <div className="animate-pulse text-muted-foreground/30 font-display text-lg">
              Assembling your signal...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-background noise-overlay pb-24 overflow-y-auto"
      style={{ perspective: "1200px" }}
    >
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
            data-testid="link-back-home"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Parallax
          </Link>
          <h1
            className="text-base font-display font-semibold"
            data-testid="text-page-title"
          >
            Identity Parallax
          </h1>
          <ThemeToggle />
        </header>

        {!hasData ? (
          <div className="text-center py-20">
            <p className="text-sm text-muted-foreground">
              Start logging check-ins, writing, and music to see your identity
              parallax.
            </p>
          </div>
        ) : (
          <>
            {/* ── Layer 1: Variant Identity (front) ── */}
            <section
              className="text-center transition-transform duration-300"
              style={{
                transform: `translateZ(${40 - scrollY * 0.05}px) translateY(${scrollY * -0.02}px)`,
                transformStyle: "preserve-3d",
              }}
            >
              {variant ? (
                <>
                  <h2
                    className="text-3xl font-display font-semibold tracking-tight text-foreground mb-1"
                    style={{
                      color: latestArch?.color || undefined,
                    }}
                  >
                    {variant.variant_name}
                  </h2>
                  <p className="text-xs text-muted-foreground/50 font-mono mb-3">
                    {variant.primary_archetype}
                    {variant.secondary_archetype
                      ? ` + ${variant.secondary_archetype}`
                      : ""}{" "}
                    variant
                  </p>
                  <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-sm mx-auto">
                    {variant.description}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-3xl font-display font-semibold tracking-tight text-foreground mb-1">
                    {latestArch?.emoji}{" "}
                    <span style={{ color: latestArch?.color }}>
                      {latestArch?.name || "Observing"}
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground/50">
                    {latestArch?.coreDrive}
                  </p>
                </>
              )}
            </section>

            {/* ── Layer 2: Radar Chart (mid) ── */}
            <section
              className="flex justify-center transition-transform duration-300"
              style={{
                transform: `translateZ(${10 - scrollY * 0.02}px)`,
                transformStyle: "preserve-3d",
              }}
            >
              <RadarChart selfVec={selfVec} dataVec={dataVec} size={320} />
            </section>

            {/* Legend */}
            <div className="flex items-center justify-center gap-5 -mt-4">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 rounded-full bg-primary opacity-70" />
                <span className="text-[10px] text-muted-foreground/50">
                  self-report
                </span>
              </div>
              {dataVec && (
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-4 h-0.5 rounded-full bg-primary opacity-25"
                    style={{ borderBottom: "1px dashed hsl(var(--primary))" }}
                  />
                  <span className="text-[10px] text-muted-foreground/50">
                    data-driven
                  </span>
                </div>
              )}
            </div>

            {/* ── Layer 3: Archetype Distribution (back) ── */}
            <section
              className="transition-transform duration-300"
              style={{
                transform: `translateZ(${-10 - scrollY * 0.01}px)`,
                transformStyle: "preserve-3d",
              }}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium text-center mb-2">
                Archetype Distribution
              </p>
              <ArchetypeRing
                distribution={data?.archetypeDistribution || {}}
                latest={data?.latestArchetype || null}
              />
            </section>

            {/* ── Layer 4: Signal & Conditions ── */}
            {forecast && (
              <section
                className="space-y-3 transition-transform duration-300"
                style={{
                  transform: `translateZ(${-20 - scrollY * 0.008}px)`,
                  transformStyle: "preserve-3d",
                }}
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium text-center">
                  Current Signal
                </p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  {ARCHETYPES.map((arch) => {
                    const level =
                      forecast.archetype_signals[arch.key] || "stable";
                    return (
                      <div key={arch.key} className="flex items-center gap-1">
                        <span
                          className="text-sm font-display"
                          style={{ color: arch.color }}
                        >
                          {arch.emoji}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/50 capitalize">
                          {level}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground/40 text-center italic leading-relaxed max-w-sm mx-auto">
                  {forecast.forecast_narrative}
                </p>
                {forecast.good_conditions.length > 0 && (
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    {forecast.good_conditions.map((c, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-border/40 text-muted-foreground/50"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── Layer 5: Data Sources Panel ── */}
            <section
              className="transition-transform duration-300"
              style={{
                transform: `translateZ(${-30 - scrollY * 0.005}px)`,
                transformStyle: "preserve-3d",
              }}
            >
              <div className="p-4 rounded-[10px] bg-card/30 border border-border/30">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium mb-3">
                  Signal Sources
                </p>
                <StatRow
                  label="Check-ins"
                  value={data?.sources.checkins || 0}
                  sub="entries"
                />
                <StatRow
                  label="Writings"
                  value={data?.sources.writings || 0}
                  sub="analyzed"
                />
                <StatRow
                  label="Tracks"
                  value={data?.sources.tracks || 0}
                  sub="logged"
                />
                {data?.spotifyStats && (
                  <>
                    <StatRow
                      label="Avg Energy"
                      value={`${data.spotifyStats.avgEnergy}%`}
                    />
                    <StatRow
                      label="Avg Valence"
                      value={`${data.spotifyStats.avgValence}%`}
                    />
                  </>
                )}
              </div>
            </section>

            {/* ── Layer 6: Themes & Traits ── */}
            <section
              className="space-y-4 transition-transform duration-300"
              style={{
                transform: `translateZ(${-40 - scrollY * 0.003}px)`,
                transformStyle: "preserve-3d",
              }}
            >
              {/* Top themes */}
              {data?.topThemes && data.topThemes.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium text-center mb-2">
                    Recurring Themes
                  </p>
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    {data.topThemes.map((theme, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-card/50 border border-border/30 text-muted-foreground/60 font-mono"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Emergent traits */}
              {variant?.emergent_traits && variant.emergent_traits.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium text-center mb-2">
                    Emergent Traits
                  </p>
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    {variant.emergent_traits.map((trait, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-primary/5 border border-primary/15 text-foreground/60"
                      >
                        {trait}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Top artists */}
              {data?.spotifyStats?.topArtists &&
                data.spotifyStats.topArtists.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium text-center mb-2">
                      Top Artists
                    </p>
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {data.spotifyStats.topArtists.map((a, i) => (
                        <span
                          key={i}
                          className="text-[11px] px-2.5 py-1 rounded-full bg-card/50 border border-border/30 text-muted-foreground/60"
                        >
                          {a.name}
                          <span className="text-muted-foreground/30 ml-1 font-mono text-[9px]">
                            {a.count}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {/* Operating rules */}
              {forecast?.operating_rules &&
                forecast.operating_rules.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium text-center mb-2">
                      Operating Patterns
                    </p>
                    <div className="space-y-1.5 max-w-sm mx-auto">
                      {forecast.operating_rules.map((rule, i) => (
                        <p
                          key={i}
                          className="text-[11px] text-muted-foreground/50 text-center leading-relaxed"
                        >
                          {rule}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
            </section>

            {/* ── Footer ── */}
            <div className="text-center pt-4 pb-8">
              <p className="text-[10px] text-muted-foreground/20 font-mono">
                identity parallax — all signals, one view
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
