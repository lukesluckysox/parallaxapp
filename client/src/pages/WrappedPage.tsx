import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ARCHETYPE_MAP } from "@shared/archetypes";
import { SkeletonCard } from "@/components/Skeleton";

interface WrappedData {
  ready: boolean;
  reason?: string;
  dominant: { archetype: string; percentage: number; count: number };
  rarest: { archetype: string; percentage: number; count: number };
  volatile: { dim: string; range: number; min: number; max: number };
  sonic: { topArtist: string; moodProfile: Record<string, number>; totalTracks: number };
  mirrorLine: string | null;
  stats: { checkins: number; writings: number; tracks: number };
}

// ── Individual Card Components ──────────────────────────────

function CardDominant({ data }: { data: WrappedData }) {
  const arch = ARCHETYPE_MAP[data.dominant.archetype];
  return (
    <div className="flex flex-col items-center justify-center text-center px-8">
      <p className="text-[9px] tracking-[5px] uppercase text-white/20 mb-10">Your Dominant Mode</p>
      <span className="text-7xl font-display mb-4" style={{ color: arch?.color }}>{arch?.emoji}</span>
      <h2 className="text-3xl font-display font-semibold mb-2" style={{ color: arch?.color }}>{arch?.name}</h2>
      <p className="text-[11px] tracking-[3px] uppercase text-white/30 mb-8">{data.dominant.percentage}% of your check-ins</p>
      <p className="text-[13px] text-white/40 leading-relaxed max-w-xs">
        You've spent most of your time in {arch?.name} mode — driven by {arch?.coreDrive?.toLowerCase()}. This is your gravitational center.
      </p>
    </div>
  );
}

function CardRarest({ data }: { data: WrappedData }) {
  const arch = ARCHETYPE_MAP[data.rarest.archetype];
  return (
    <div className="flex flex-col items-center justify-center text-center px-8">
      <p className="text-[9px] tracking-[5px] uppercase text-white/20 mb-10">Your Rarest Signal</p>
      <span className="text-7xl font-display mb-4 opacity-40" style={{ color: arch?.color }}>{arch?.emoji}</span>
      <h2 className="text-3xl font-display font-semibold mb-2" style={{ color: arch?.color }}>{arch?.name}</h2>
      <p className="text-[11px] tracking-[3px] uppercase text-white/30 mb-8">appeared in only {data.rarest.percentage}% of sessions</p>
      <p className="text-[13px] text-white/40 leading-relaxed max-w-xs">
        {arch?.name} is your dormant signal. This isn't a weakness — it's a blind spot worth watching. When it surfaces, pay attention.
      </p>
    </div>
  );
}

function CardVolatile({ data }: { data: WrappedData }) {
  const dimLabel = data.volatile.dim.charAt(0).toUpperCase() + data.volatile.dim.slice(1);
  return (
    <div className="flex flex-col items-center justify-center text-center px-8">
      <p className="text-[9px] tracking-[5px] uppercase text-white/20 mb-10">Most Volatile Dimension</p>
      <p className="text-6xl font-display font-semibold text-purple-400 mb-2">±{Math.round(data.volatile.range / 2)}</p>
      <p className="text-[11px] tracking-[3px] uppercase text-white/30 mb-2">{dimLabel}</p>
      <p className="text-[11px] tracking-[3px] uppercase text-white/20 mb-8">swung between {data.volatile.min} and {data.volatile.max}</p>
      {/* Waveform */}
      <svg width="260" height="50" viewBox="0 0 260 50" className="mb-8 opacity-60">
        <path
          d={generateWave(data.volatile.min, data.volatile.max)}
          fill="none" stroke="#b07aa1" strokeWidth="1.5"
        />
        <line x1="0" y1="25" x2="260" y2="25" stroke="white" strokeWidth="0.3" opacity="0.1" strokeDasharray="3 3" />
      </svg>
      <p className="text-[13px] text-white/40 leading-relaxed max-w-xs">
        Your {dimLabel.toLowerCase()} is your most unstable signal — it spikes and crashes more than any other dimension.
      </p>
    </div>
  );
}

function CardSonic({ data }: { data: WrappedData }) {
  const [barsAnimated, setBarsAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBarsAnimated(true), 400);
    return () => clearTimeout(t);
  }, []);

  if (!data.sonic.topArtist && data.sonic.totalTracks === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center px-8">
        <p className="text-[9px] tracking-[5px] uppercase text-white/20 mb-10">Your Sonic Identity</p>
        <p className="text-[13px] text-white/30">Connect Spotify to reveal your sonic identity</p>
      </div>
    );
  }

  const bars = Object.entries(data.sonic.moodProfile).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col items-center justify-center text-center px-8">
      <p className="text-[9px] tracking-[5px] uppercase text-white/20 mb-10">Your Sonic Identity</p>
      {data.sonic.topArtist && (
        <h2 className="text-2xl font-display font-semibold italic text-teal-400 mb-2">{data.sonic.topArtist}</h2>
      )}
      <p className="text-[11px] tracking-[3px] uppercase text-white/20 mb-8">
        {data.sonic.totalTracks} tracks logged
      </p>
      {bars.length > 0 && (
        <div className="w-64 space-y-2.5 mb-8">
          {bars.map(([label, value]) => (
            <div key={label} className="flex items-center gap-2.5">
              <span className="text-[9px] text-white/25 w-20 text-right uppercase tracking-wider">{label}</span>
              <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500/60 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: barsAnimated ? `${value}%` : "0%" }}
                />
              </div>
              <span className="text-[10px] text-white/20 w-8">{value}%</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[13px] text-white/40 leading-relaxed max-w-xs">
        Your listening patterns reveal what words can't — the emotional frequencies you're drawn to.
      </p>
    </div>
  );
}

function CardMirrorLine({ data }: { data: WrappedData }) {
  if (!data.mirrorLine) {
    return (
      <div className="flex flex-col items-center justify-center text-center px-8">
        <p className="text-[9px] tracking-[5px] uppercase text-white/20 mb-10">Your Mirror Line</p>
        <p className="text-[13px] text-white/30">Submit writing to discover your mirror line</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center px-8">
      <p className="text-[9px] tracking-[5px] uppercase text-white/20 mb-10">Your Mirror Line</p>
      <div className="w-10 h-px bg-rose-400/30 mb-8" />
      <p className="text-2xl font-display italic text-white/55 leading-relaxed max-w-sm">
        "{data.mirrorLine}"
      </p>
      <div className="w-10 h-px bg-rose-400/30 mt-8 mb-8" />
      <p className="text-[11px] text-white/20 leading-relaxed max-w-xs">
        The moment your writing revealed the most about where you are.
      </p>
    </div>
  );
}

// ── Wave Generator ──────────────────────────────────────────

function generateWave(min: number, max: number): string {
  const points: string[] = [];
  const mid = 25;
  const amp = 20;
  for (let x = 0; x <= 260; x += 5) {
    const noise = Math.sin(x * 0.08) * 0.6 + Math.sin(x * 0.15) * 0.4;
    const normalizedRange = (max - min) / 100;
    const y = mid + noise * amp * normalizedRange;
    points.push(`${x === 0 ? "M" : "L"}${x},${y.toFixed(1)}`);
  }
  return points.join(" ");
}

// ── Main Page ───────────────────────────────────────────────

const ARCHETYPE_COLORS: Record<string, string> = {
  observer: "#7c8ba0",
  builder: "#6b9080",
  explorer: "#c4956a",
  dissenter: "#b07aa1",
  seeker: "#c17b6e",
};

export default function WrappedPage() {
  const [, setLocation] = useLocation();
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");

  const { data, isLoading } = useQuery<WrappedData>({
    queryKey: ["/api/wrapped"],
    staleTime: 5 * 60 * 1000,
  });

  const totalCards = 5;

  const goNext = useCallback(() => {
    if (current >= totalCards - 1) {
      setLocation("/");
      return;
    }
    setDirection("next");
    setCurrent(c => c + 1);
  }, [current, setLocation]);

  const goPrev = useCallback(() => {
    if (current <= 0) return;
    setDirection("prev");
    setCurrent(c => c - 1);
  }, [current]);

  // Keyboard + swipe
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") setLocation("/");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, setLocation]);

  useEffect(() => {
    let startX = 0;
    const onStart = (e: TouchEvent) => { startX = e.touches[0].clientX; };
    const onEnd = (e: TouchEvent) => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) goNext();
        else goPrev();
      }
    };
    window.addEventListener("touchstart", onStart);
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [goNext, goPrev]);

  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (!data?.ready) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex flex-col items-center justify-center gap-4">
        <p className="text-xs text-white/30">{data?.reason || "Not enough data yet"}</p>
        <button onClick={() => setLocation("/")} className="text-xs text-white/20 hover:text-white/40 transition-colors">
          back to home
        </button>
      </div>
    );
  }

  // Determine ambient color per card
  const cardColors = [
    ARCHETYPE_COLORS[data.dominant.archetype] || "#5eaaa8",
    ARCHETYPE_COLORS[data.rarest.archetype] || "#5eaaa8",
    "#b07aa1",
    "#5eaaa8",
    "#c17b6e",
  ];

  const cards = [
    <CardDominant data={data} />,
    <CardRarest data={data} />,
    <CardVolatile data={data} />,
    <CardSonic data={data} />,
    <CardMirrorLine data={data} />,
  ];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: `radial-gradient(ellipse at 50% 40%, ${cardColors[current]}10 0%, #0a0c10 70%)` }}
    >
      {/* Branding */}
      <p className="text-center text-[9px] tracking-[6px] uppercase text-white/10 pt-6">
        Parallax
      </p>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {cards.map((card, i) => (
          <div
            key={i}
            className="absolute inset-0 flex items-center justify-center transition-all duration-500"
            style={{
              opacity: i === current ? 1 : 0,
              transform: i === current
                ? "translateX(0)"
                : i < current
                  ? "translateX(-100%)"
                  : "translateX(100%)",
              pointerEvents: i === current ? "auto" : "none",
            }}
          >
            {card}
          </div>
        ))}
      </div>

      {/* Tap zones */}
      <div className="fixed inset-0 flex z-10" style={{ pointerEvents: "none" }}>
        <div className="w-1/2 h-full cursor-pointer" style={{ pointerEvents: "auto" }} onClick={goPrev} />
        <div className="w-1/2 h-full cursor-pointer" style={{ pointerEvents: "auto" }} onClick={goNext} />
      </div>

      {/* Progress dots + close */}
      <div className="flex items-center justify-center gap-2 pb-8 relative z-20">
        {Array.from({ length: totalCards }).map((_, i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full transition-all duration-300"
            style={{
              background: i === current ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.12)",
              transform: i === current ? "scale(1.4)" : "scale(1)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
