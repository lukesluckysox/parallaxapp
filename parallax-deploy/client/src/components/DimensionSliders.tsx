import { ChevronDown } from "lucide-react";
import { DIMENSIONS, type DimensionVec } from "@shared/archetypes";

interface DimensionSlidersProps {
  vec: DimensionVec;
  onChange: (dim: string, val: number) => void;
  open: boolean;
  onToggle: () => void;
}

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

export default function DimensionSliders({ vec, onChange, open, onToggle }: DimensionSlidersProps) {
  return (
    <div className="rounded-[10px] border border-border bg-card overflow-hidden">
      <button
        data-testid="button-toggle-sliders"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-accent/50 transition-colors"
      >
        <span>Manual sliders</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {DIMENSIONS.map((dim) => (
            <div key={dim} className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">{DIMENSION_LABELS[dim]}</label>
                <span className="text-xs tabular-nums font-medium text-foreground/70">{vec[dim]}</span>
              </div>
              <input
                data-testid={`slider-${dim}`}
                type="range"
                min={0}
                max={100}
                value={vec[dim]}
                onChange={(e) => onChange(dim, parseInt(e.target.value, 10))}
                className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer accent-primary [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
