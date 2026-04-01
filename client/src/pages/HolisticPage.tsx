import { useEffect, useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ARCHETYPES, ARCHETYPE_MAP, DIMENSIONS } from "@shared/archetypes";
import { computeMixture } from "@shared/archetype-math";
import type { DimensionVec } from "@shared/archetypes";
import { ChevronRight, ChevronDown, Download, Share2, Lock, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import InfoTooltip from "@/components/InfoTooltip";
import ProGate from "@/components/ProGate";

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
  lastCheckinAt: string | null;
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

// ── About Parallax Collapsible ──────────────────────────────

function AboutParallaxSection() {
  const [open, setOpen] = useState(false);

  return (
    <section className="border border-border/30 rounded-[10px] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card/20 hover:bg-card/40 transition-colors"
        data-testid="button-about-parallax"
      >
        <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">About Parallax</span>
        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground/40 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-5 pt-3 space-y-6 bg-card/10">
          {/* Overview */}
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            Parallax synthesizes signals from your writing, music, mood, and self-reports to reveal
            recurring identity patterns. Identity is treated as dynamic, cyclical, and multi-signal.
          </p>

          {/* Archetypes */}
          <div>
            <h3 className="text-xs font-semibold mb-2 text-foreground/70">The five archetypes</h3>
            <div className="space-y-2">
              {ARCHETYPES.map(arch => (
                <div key={arch.key} className="p-2.5 rounded-lg bg-card/50 border border-border/30">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-display" style={{ color: arch.color }}>{arch.emoji}</span>
                    <span className="text-xs font-semibold" style={{ color: arch.color }}>{arch.name}</span>
                    <span className="text-[10px] text-muted-foreground/50 ml-auto font-mono">{arch.coreDrive}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/50 leading-relaxed">{arch.philosophy}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Identity System */}
          <div>
            <h3 className="text-xs font-semibold mb-2 text-foreground/70">Identity system</h3>
            <div className="space-y-1.5 text-[11px] text-muted-foreground/50 leading-relaxed">
              <p><strong className="text-foreground/60">Variants:</strong> LLM-derived identity patterns like "The Night Cartographer" — limitless, synthesized from all your data.</p>
              <p><strong className="text-foreground/60">Constellations:</strong> After 15+ check-ins, k-means clustering discovers recurring identity modes you cycle through.</p>
              <p><strong className="text-foreground/60">Echoes:</strong> Detected when current signals match a previous mode at 85%+ similarity. Reveals cyclical patterns.</p>
              <p><strong className="text-foreground/60">Mirror Line:</strong> A single shareable sentence distilled from your writing's most revealing moment.</p>
            </div>
          </div>

          {/* Data Sources */}
          <div>
            <h3 className="text-xs font-semibold mb-2 text-foreground/70">Data sources</h3>
            <div className="space-y-1.5 text-[11px] text-muted-foreground/50 leading-relaxed">
              <p><strong className="text-foreground/60">Sonic Mirror:</strong> Spotify listening — mood clustering radar, temporal patterns, passive import on app open.</p>
              <p><strong className="text-foreground/60">Inner Mirror:</strong> Writing analysis in 3 tiers — primary (mirror moment, narrative, emotions), secondary (dimensions, quotes, books), deep (MBTI, compass, moral foundations).</p>
              <p><strong className="text-foreground/60">Check-ins:</strong> Self-reported feelings → 8-dimension scores. Cumulative weighted average, recent entries count 3x.</p>
              <p><strong className="text-foreground/60">Body Mirror:</strong> Coming soon — fitness data.</p>
            </div>
          </div>

          {/* Philosophy */}
          <div>
            <blockquote className="border-l-2 border-primary/30 pl-3 italic text-[11px] text-muted-foreground/50 leading-relaxed">
              "Identity is not static. It moves between recurring patterns. The system reveals the modes you cycle through and the conditions that produce them."
            </blockquote>
          </div>

          {/* Full about link */}
          <div className="text-center">
            <a href="/#/about" className="text-[10px] font-mono text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors">
              full documentation →
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Locked Section Placeholder ───────────────────────────────

function LockedSection({ label, requirement }: { label: string; requirement: string }) {
  return (
    <div className="py-4 text-center" data-testid={`locked-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-center gap-2 mb-1">
        <Lock className="w-3 h-3 text-muted-foreground/20" />
        <span className="text-[10px] font-mono text-muted-foreground/25 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-[10px] text-muted-foreground/20">{requirement}</p>
    </div>
  );
}

// ── Unlock Badge ────────────────────────────────────────

function UnlockBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1 mb-2">
      <span className="text-[9px] font-mono text-primary/50 uppercase tracking-widest">
        {label} unlocked
      </span>
    </div>
  );
}

// ── Identity Pulse ──────────────────────────────────────────

function IdentityPulse({ staleDays, color }: { staleDays: number; color: string }) {
  // Faster pulse when fresh, slower when stale
  const duration = Math.min(3, 0.8 + staleDays * 0.3);
  const opacity = Math.max(0.2, 1 - staleDays * 0.12);

  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full"
      style={{
        backgroundColor: color,
        opacity,
        animation: `pulse ${duration}s ease-in-out infinite`,
      }}
    >
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: ${opacity}; }
          50% { transform: scale(1.5); opacity: ${opacity * 0.4}; }
        }
      `}</style>
    </span>
  );
}

// ── Mirror Drop (Shareable Identity Card) ──────────────────

function drawSignature(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, scale: number,
  dims: { dim: string; value: number }[],
  primaryColor: string,
) {
  const DIMS_ORDER = ['focus','calm','discipline','health','social','creativity','exploration','ambition'];
  const dimMap: Record<string, number> = {};
  dims.forEach(d => { dimMap[d.dim] = d.value; });
  const angleStep = (2 * Math.PI) / DIMS_ORDER.length;

  // Orbital rings
  DIMS_ORDER.forEach((dim, i) => {
    const val = (dimMap[dim] || 50) / 100;
    const baseR = (20 + i * 14) * scale;
    const r = baseR * (0.5 + val * 0.5);
    const ry = r * (0.6 + val * 0.4);
    const rotation = ((i * 22.5) + ((dimMap[dim] || 50) * 1.3)) * Math.PI / 180;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = (0.5 + val * 1) * scale;
    ctx.globalAlpha = 0.05 + val * 0.12;
    ctx.stroke();
    ctx.restore();
  });

  // Data polygon + nodes
  const points: { x: number; y: number; val: number }[] = [];
  const maxR = 100 * scale;
  DIMS_ORDER.forEach((dim, i) => {
    const val = (dimMap[dim] || 50) / 100;
    const angle = -Math.PI / 2 + i * angleStep;
    const r = maxR * val;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), val });

    // Spoke
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + maxR * 0.9 * Math.cos(angle), cy + maxR * 0.9 * Math.sin(angle));
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 0.3 * scale;
    ctx.globalAlpha = 0.1;
    ctx.stroke();

    // Node
    ctx.beginPath();
    ctx.arc(cx + r * Math.cos(angle), cy + r * Math.sin(angle), (1.5 + val * 2) * scale, 0, Math.PI * 2);
    ctx.fillStyle = primaryColor;
    ctx.globalAlpha = 0.3 + val * 0.5;
    ctx.fill();
  });

  // Polygon fill
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = primaryColor;
  ctx.globalAlpha = 0.04;
  ctx.fill();
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 1 * scale;
  ctx.globalAlpha = 0.3;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Harmonic curves
  for (let ring = 0; ring < 3; ring++) {
    const baseR = (25 + ring * 22) * scale;
    ctx.beginPath();
    const segments = 120;
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments) * 2 * Math.PI;
      let r = baseR;
      DIMS_ORDER.forEach((dim, i) => {
        const dimAngle = -Math.PI / 2 + i * angleStep;
        const dist = Math.abs(angle - ((dimAngle + Math.PI * 2.5) % (Math.PI * 2)));
        const influence = Math.exp(-dist * 1.5);
        r += ((dimMap[dim] || 50) / 100 - 0.5) * 18 * scale * influence;
      });
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = (ring === 1 ? 0.8 : 0.5) * scale;
    ctx.globalAlpha = 0.15 + ring * 0.05;
    ctx.stroke();
  }

  // Center glow
  ctx.globalAlpha = 0.1;
  ctx.beginPath();
  ctx.arc(cx, cy, 8 * scale, 0, Math.PI * 2);
  ctx.fillStyle = primaryColor;
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(cx, cy, 4 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function MirrorDrop({
  variantName,
  archetype,
  mirrorLine,
  topDimensions,
}: {
  variantName: string;
  archetype: { name: string; emoji: string; color: string } | null;
  mirrorLine: string | null;
  topDimensions: { dim: string; value: number }[];
}) {
  const [generating, setGenerating] = useState(false);

  const generateCard = async () => {
    setGenerating(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d")!;
      const color = archetype?.color || "#5eaaa8";

      // Background
      ctx.fillStyle = "#0a0c10";
      ctx.fillRect(0, 0, 1080, 1920);

      // Subtle ambient glow
      const grad = ctx.createRadialGradient(540, 680, 0, 540, 680, 600);
      grad.addColorStop(0, color + "12");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);

      // Border
      ctx.strokeStyle = color + "20";
      ctx.lineWidth = 1;
      ctx.strokeRect(60, 60, 960, 1800);

      // "PARALLAX" header
      ctx.font = "300 14px 'Courier New', monospace";
      ctx.fillStyle = "#ffffff25";
      ctx.textAlign = "center";
      ctx.fillText("P A R A L L A X", 540, 140);

      // ── Signal Signature (centered, upper portion) ──
      drawSignature(ctx, 540, 500, 2.8, topDimensions, color);

      // Variant name
      ctx.globalAlpha = 1;
      ctx.font = "bold 52px Georgia, serif";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      // Ensure it doesn't overflow
      let fontSize = 52;
      while (ctx.measureText(variantName).width > 860 && fontSize > 28) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px Georgia, serif`;
      }
      ctx.fillText(variantName, 540, 920);

      // Archetype label
      if (archetype) {
        ctx.font = "14px 'Courier New', monospace";
        ctx.fillStyle = "#ffffff40";
        ctx.fillText(archetype.name.toUpperCase() + " VARIANT", 540, 960);
      }

      // Divider
      ctx.strokeStyle = color + "30";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(420, 1010);
      ctx.lineTo(660, 1010);
      ctx.stroke();

      // Top 3 dimensions
      ctx.font = "15px 'Courier New', monospace";
      ctx.fillStyle = "#ffffff35";
      topDimensions.slice(0, 3).forEach((d, i) => {
        const label = d.dim.toUpperCase();
        const val = String(d.value);
        ctx.fillText(`${label}  ${val}`, 540, 1060 + i * 38);
      });

      // Mirror line
      if (mirrorLine) {
        ctx.font = "italic 22px Georgia, serif";
        ctx.fillStyle = "#ffffff50";
        const maxW = 800;
        const words = mirrorLine.split(" ");
        const lines: string[] = [];
        let current = "";
        for (const word of words) {
          const test = current + word + " ";
          if (ctx.measureText(test).width > maxW && current) {
            lines.push(current.trim());
            current = word + " ";
          } else {
            current = test;
          }
        }
        if (current.trim()) lines.push(current.trim());

        const startY = 1240;
        lines.forEach((l, i) => {
          const prefix = i === 0 ? '"' : '';
          const suffix = i === lines.length - 1 ? '"' : '';
          ctx.fillText(prefix + l + suffix, 540, startY + i * 34);
        });
      }

      // Footer
      ctx.font = "11px 'Courier New', monospace";
      ctx.fillStyle = "#ffffff12";
      ctx.fillText("parallaxapp.up.railway.app", 540, 1810);

      // Download
      const link = document.createElement("a");
      link.download = `parallax-${variantName.toLowerCase().replace(/\s+/g, "-")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("Mirror drop failed:", e);
    }
    setGenerating(false);
  };

  return (
    <button
      onClick={generateCard}
      disabled={generating}
      className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors disabled:opacity-40"
      data-testid="button-mirror-drop"
    >
      <Download className="w-3 h-3" />
      {generating ? "generating..." : "mirror drop"}
    </button>
  );
}

// ── Collapsible Signal Details ───────────────────────────────

function SignalDetails({
  data,
  variant,
  forecast,
}: {
  data: HolisticData | undefined;
  variant: ProfileData["variant"] | null;
  forecast: ForecastData | null;
}) {
  const [open, setOpen] = useState(false);

  const hasContent = (data?.sources && (data.sources.checkins > 0 || data.sources.writings > 0 || data.sources.tracks > 0)) ||
    (data?.topThemes && data.topThemes.length > 0) ||
    (variant?.emergent_traits && variant.emergent_traits.length > 0) ||
    (data?.spotifyStats?.topArtists && data.spotifyStats.topArtists.length > 0);

  if (!hasContent) return null;

  return (
    <div className="rounded-[10px] border border-border/30 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card/20 hover:bg-card/40 transition-colors"
        data-testid="button-toggle-details"
      >
        <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-widest">Signal Details</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/40 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-5 pt-3 space-y-5 bg-card/10">
          {/* Signal Sources */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium mb-2">Signal Sources</p>
            <StatRow label="Check-ins" value={data?.sources.checkins || 0} sub="entries" />
            <StatRow label="Writings" value={data?.sources.writings || 0} sub="analyzed" />
            <StatRow label="Tracks" value={data?.sources.tracks || 0} sub="logged" />
            {data?.spotifyStats && (
              <>
                <StatRow label="Avg Energy" value={`${data.spotifyStats.avgEnergy}%`} />
                <StatRow label="Avg Valence" value={`${data.spotifyStats.avgValence}%`} />
              </>
            )}
          </div>

          {/* Themes */}
          {data?.topThemes && data.topThemes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium text-center mb-2">Recurring Themes</p>
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {data.topThemes.map((theme, i) => (
                  <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-card/50 border border-border/30 text-muted-foreground/60 font-mono">{theme}</span>
                ))}
              </div>
            </div>
          )}

          {/* Emergent traits */}
          {variant?.emergent_traits && variant.emergent_traits.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium text-center mb-2">Emergent Traits</p>
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {variant.emergent_traits.map((trait, i) => (
                  <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-primary/5 border border-primary/15 text-foreground/60">{trait}</span>
                ))}
              </div>
            </div>
          )}

          {/* Top artists */}
          {data?.spotifyStats?.topArtists && data.spotifyStats.topArtists.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium text-center mb-2">Top Artists</p>
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {data.spotifyStats.topArtists.map((a, i) => (
                  <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-card/50 border border-border/30 text-muted-foreground/60">
                    {a.name}
                    <span className="text-muted-foreground/30 ml-1 font-mono text-[9px]">{a.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Operating patterns */}
          {forecast?.operating_rules && forecast.operating_rules.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium text-center mb-2">Operating Patterns</p>
              <div className="space-y-1.5 max-w-sm mx-auto">
                {forecast.operating_rules.map((rule, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground/50 text-center leading-relaxed">{rule}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Forecast Types ───────────────────────────────────────────

interface ForecastData {
  archetype_signals: Record<string, string>;
  dominant_mode: string;
  good_conditions: string[];
  forecast_narrative: string;
  operating_rules: string[];
  rare_pattern: string | null;
}

// ── Main Page ────────────────────────────────────────────────

// ── Active Echo Card ──────────────────────────────────────────

function ActiveEchoCard({ echo }: { echo: { modeName: string; dominantArchetype: string; similarityScore: number; detectedAt: string } }) {
  const arch = ARCHETYPE_MAP[echo.dominantArchetype];
  return (
    <div className="p-4 rounded-[10px] border border-border/30 bg-card/20 text-center" data-testid="card-active-echo">
      <p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-2">
        Identity Echo Detected
      </p>
      <p className="text-sm text-foreground/70 leading-relaxed">
        Your current signals resemble{" "}
        <span className="font-display font-semibold" style={{ color: arch?.color }}>
          &ldquo;{echo.modeName}&rdquo;
        </span>
      </p>
      <p className="text-[10px] font-mono text-muted-foreground/30 mt-1">
        {echo.similarityScore}% match
      </p>
    </div>
  );
}


export default function HolisticPage() {
  const { data, isLoading, isError } = useQuery<HolisticData>({
    queryKey: ["/api/holistic"],
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  const { data: profileData } = useQuery<ProfileData>({
    queryKey: ["/api/profile"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: echoData } = useQuery<{ active: { modeName: string; dominantArchetype: string; similarityScore: number; detectedAt: string } | null }>({
    queryKey: ["/api/echo"],
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const { data: forecastData } = useQuery<{ forecast: ForecastData | null }>({
    queryKey: ["/api/forecast"],
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const forecast = forecastData?.forecast || null;

  const { data: mirrorLineData } = useQuery<{ line: string | null }>({
    queryKey: ["/api/mirror-line"],
    staleTime: 15 * 60 * 1000,
    retry: false,
  });

  const selfVec = data?.selfVec || {};
  const dataVec = data?.dataVec || null;
  const variant = profileData?.variant || null;
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

  // Staleness: days since last check-in → visual degradation
  const staleDays = useMemo(() => {
    if (!data?.lastCheckinAt) return 0;
    return Math.floor((Date.now() - new Date(data.lastCheckinAt).getTime()) / (24 * 60 * 60 * 1000));
  }, [data?.lastCheckinAt]);
  // Opacity multiplier: 1.0 at 0 days, fades to 0.4 at 7+ days
  const freshness = Math.max(0.4, 1 - staleDays * 0.1);

  // Passive Spotify import: fire once on mount, silently import recent tracks
  useEffect(() => {
    (async () => {
      try {
        await apiRequest("GET", "/api/spotify/now?log=true");
      } catch { /* not connected or failed — silent */ }
    })();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background noise-overlay flex flex-col items-center justify-center">
        <h1 className="text-4xl font-display font-semibold tracking-tight text-foreground/80 mb-4">Parallax</h1>
        <div className="w-16 h-px bg-primary/30 mb-4 animate-pulse" />
        <p className="text-xs text-muted-foreground/30 font-mono animate-pulse">assembling your signal</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background noise-overlay flex flex-col items-center justify-center">
        <h1 className="text-4xl font-display font-semibold tracking-tight text-foreground/80 mb-4">Parallax</h1>
        <div className="w-16 h-px bg-primary/20 mb-4" />
        <p className="text-xs text-muted-foreground/40 font-mono">could not load data — try refreshing</p>
      </div>
    );
  }

  // Ambient background: subtle radial glow from dominant archetype color
  const ambientColor = latestArch?.color || "#5eaaa8";
  const ambientBg = hasData
    ? `radial-gradient(ellipse at 50% 20%, ${ambientColor}08 0%, transparent 60%)`
    : undefined;

  return (
    <div
      className="min-h-screen bg-background noise-overlay pb-24"
      style={{ backgroundImage: ambientBg }}
    >
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* Header */}
        <div className="text-center pt-2 pb-4">
          <div className="flex items-center justify-center gap-2">
            <h1
              className="text-xl font-display font-semibold tracking-tight text-foreground"
              data-testid="text-page-title"
            >
              Identity Parallax
            </h1>
            <InfoTooltip text="Your unified identity dashboard. Synthesizes signals from check-ins, writing, and music into archetype distributions, dimension scores, and signal forecasts. All data shapes one view." />
          </div>
        </div>

        {!hasData ? (
          <div className="space-y-6 py-8">
            <p className="text-sm text-muted-foreground/60 text-center">
              Your identity parallax builds from your signals.
            </p>
            <div className="space-y-2.5 max-w-sm mx-auto">
              {[
                { step: "1", label: "Check in", desc: "Tell the app how you're feeling", href: "/snapshot" },
                { step: "2", label: "Write something", desc: "Submit a piece of writing for analysis", href: "/mirrors/inner" },
                { step: "3", label: "Connect Spotify", desc: "Link your music to reveal sonic patterns", href: "/mirrors/sonic" },
              ].map((item) => (
                <a
                  key={item.step}
                  href={`/#${item.href}`}
                  className="flex items-center gap-3 p-3 rounded-[10px] border border-border/30 bg-card/20 hover:bg-card/40 transition-colors"
                >
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-mono flex items-center justify-center shrink-0">
                    {item.step}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-foreground/70">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground/40">{item.desc}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* ── Layer 1: Variant Identity ── */}
            <section className="text-center">
              {variant ? (
                <>
                  <div className="flex items-center justify-center gap-2.5 mb-1">
                    <IdentityPulse staleDays={staleDays} color={latestArch?.color || "#5eaaa8"} />
                    <h2
                      className="text-3xl font-display font-semibold tracking-tight text-foreground"
                      style={{
                        color: latestArch?.color || undefined,
                      }}
                    >
                      {variant.variant_name}
                    </h2>
                  </div>
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
                  <div className="flex items-center justify-center gap-2.5 mb-1">
                    <IdentityPulse staleDays={staleDays} color={latestArch?.color || "#5eaaa8"} />
                    <h2 className="text-3xl font-display font-semibold tracking-tight text-foreground">
                      {latestArch?.emoji}{" "}
                      <span style={{ color: latestArch?.color }}>
                        {latestArch?.name || "Observing"}
                      </span>
                    </h2>
                  </div>
                  <p className="text-xs text-muted-foreground/50">
                    {latestArch?.coreDrive}
                  </p>
                </>
              )}
            </section>

            {/* ── Active Echo Card ── */}
            {echoData?.active && (
              <ActiveEchoCard echo={echoData.active} />
            )}

            {/* Stale data notice */}
            {staleDays >= 3 && (
              <p className="text-center text-[10px] font-mono text-muted-foreground/30 -mt-4">
                signals fading — last check-in {staleDays} day{staleDays !== 1 ? "s" : ""} ago
              </p>
            )}

            {/* ── Layer 2: Radar Chart ── */}
            <section
              className="flex justify-center"
              style={{
                opacity: freshness,
                transition: "opacity 0.5s ease",
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

            {/* ── Layer 3: Archetype Distribution (unlocks at 3 check-ins) ── */}
            {(data?.sources.checkins || 0) >= 3 ? (
              <section style={{ opacity: freshness }}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium text-center mb-2">
                  Archetype Distribution
                </p>
                <ArchetypeRing
                  distribution={data?.archetypeDistribution || {}}
                  latest={data?.latestArchetype || null}
                />
              </section>
            ) : (
              <LockedSection label="Archetype Distribution" requirement={`${3 - (data?.sources.checkins || 0)} more check-ins to unlock`} />
            )}

            {/* ── Layer 4: Signal Forecast (unlocks at 3 check-ins) ── */}
            {(data?.sources.checkins || 0) >= 3 ? (
              <ProGate feature="Signal Forecast">
                {forecast ? (
                  <section className="space-y-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium text-center">
                      Current Signal
                    </p>
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                      {ARCHETYPES.map((arch) => {
                        const level = forecast.archetype_signals[arch.key] || "stable";
                        return (
                          <div key={arch.key} className="flex items-center gap-1">
                            <span className="text-sm font-display" style={{ color: arch.color }}>
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
                ) : null}
              </ProGate>
            ) : (
              <LockedSection label="Signal Forecast" requirement={`${3 - (data?.sources.checkins || 0)} more check-ins to unlock`} />
            )}

            {/* ── Collapsible Signal Details ── */}
            <SignalDetails
              data={data}
              variant={variant}
              forecast={forecast}
            />

            {/* ── About Parallax Collapsible ── */}
            <AboutParallaxSection />

            {/* ── Wrapped Link (Pro) ── */}
            {(data?.sources.checkins || 0) >= 3 && (
              <ProGate feature="Identity Wrapped">
                <a
                  href="/#/wrapped"
                  className="flex items-center justify-center gap-2 py-3 rounded-[10px] border border-border/30 bg-card/20 hover:bg-card/40 transition-colors"
                  data-testid="link-wrapped"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary/50" />
                  <span className="text-xs font-medium text-muted-foreground/50 hover:text-muted-foreground/70">View your Wrapped</span>
                </a>
              </ProGate>
            )}

            {/* ── Data Controls ── */}
            <div className="flex items-center justify-center gap-3">
              <MirrorDrop
                variantName={variant?.variant_name || latestArch?.name || "Parallax"}
                archetype={latestArch}
                mirrorLine={mirrorLineData?.line || null}
                topDimensions={
                  Object.entries(selfVec)
                    .map(([dim, value]) => ({ dim, value: value as number }))
                    .sort((a, b) => b.value - a.value)
                }
              />
              <span className="text-muted-foreground/20 text-[10px]">·</span>
              <a
                href="./api/export"
                download
                className="text-[10px] font-mono text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
              >
                export your data
              </a>
              <span className="text-muted-foreground/20 text-[10px]">·</span>
              <button
                onClick={async () => {
                  if (!window.confirm("Delete your account and all data? This cannot be undone.")) return;
                  try {
                    await apiRequest("DELETE", "/api/auth/account");
                    window.location.reload();
                  } catch {}
                }}
                className="text-[10px] font-mono text-destructive/30 hover:text-destructive/60 transition-colors"
              >
                delete account
              </button>
            </div>

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
