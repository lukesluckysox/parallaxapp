import { Lock } from "lucide-react";

// ── Signal strength: 0–5 bars ────────────────────────────────
// Each bar represents a confidence tier based on cumulative data.
// Thresholds are tuned per-section via the `strength` prop (0-5).

interface SignalStrengthProps {
  strength: number;       // 0-5
  label?: string;         // e.g. "trajectory read" or "behavioral drivers"
  compact?: boolean;      // smaller variant for inline use
}

const BAR_COLORS = [
  "bg-muted-foreground/15", // empty
  "bg-red-500/60",          // 1 - very weak
  "bg-orange-500/60",       // 2 - weak
  "bg-yellow-500/60",       // 3 - moderate
  "bg-green-500/50",        // 4 - strong
  "bg-green-400/70",        // 5 - high confidence
];

const STRENGTH_LABELS = [
  "no signal",
  "faint signal",
  "forming",
  "moderate signal",
  "strong signal",
  "high confidence",
];

export default function SignalStrength({ strength, label, compact }: SignalStrengthProps) {
  const clamped = Math.max(0, Math.min(5, Math.round(strength)));
  const barH = compact ? "h-2" : "h-2.5";
  const barW = compact ? "w-1" : "w-1.5";
  const gap = compact ? "gap-[2px]" : "gap-[3px]";

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-end ${gap}`} aria-label={`Signal strength: ${clamped} of 5`}>
        {[1, 2, 3, 4, 5].map((bar) => (
          <div
            key={bar}
            className={`${barW} rounded-[1px] transition-all duration-300 ${
              bar <= clamped ? BAR_COLORS[clamped] : "bg-muted-foreground/10"
            }`}
            style={{ height: compact ? `${4 + bar * 2}px` : `${5 + bar * 2.5}px` }}
          />
        ))}
      </div>
      {label && (
        <span className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-wider">
          {label} — {STRENGTH_LABELS[clamped]}
        </span>
      )}
    </div>
  );
}

// ── Locked gate with signal strength ────────────────────────
interface GatedSectionProps {
  title: string;
  strength: number;
  threshold: number;       // minimum strength to unlock
  hint: string;            // e.g. "3 more check-ins to unlock"
  children: React.ReactNode;
}

export function GatedSection({ title, strength, threshold, hint, children }: GatedSectionProps) {
  const unlocked = strength >= threshold;

  if (!unlocked) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-muted-foreground/30">{title}</h2>
          <SignalStrength strength={strength} compact />
        </div>
        <div className="p-4 rounded-[10px] border border-dashed border-border/50 bg-card/30 text-center">
          <Lock className="w-4 h-4 mx-auto mb-2 text-muted-foreground/15" />
          <p className="text-[10px] font-mono text-muted-foreground/25">{hint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div /> {/* title rendered by child component */}
        <SignalStrength strength={strength} label={title.toLowerCase()} compact />
      </div>
      {children}
    </div>
  );
}
