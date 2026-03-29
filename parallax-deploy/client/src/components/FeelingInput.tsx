import { Sparkles } from "lucide-react";

interface FeelingInputProps {
  value: string;
  onChange: (val: string) => void;
  onInterpret: () => void;
  isLoading: boolean;
  narrative: string;
}

export default function FeelingInput({ value, onChange, onInterpret, isLoading, narrative }: FeelingInputProps) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          data-testid="input-feeling"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="How are you feeling right now? What's on your mind?"
          rows={3}
          className="w-full px-3 py-2.5 rounded-[10px] border border-border bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/50"
        />
        <button
          data-testid="button-interpret"
          onClick={onInterpret}
          disabled={isLoading || !value.trim()}
          className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40"
        >
          {isLoading ? (
            <Sparkles className="w-3 h-3 animate-pulse" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          Read me
        </button>
      </div>

      {narrative && (
        <div
          data-testid="card-narrative"
          className="p-3 rounded-[10px] border border-primary/20 bg-primary/5 text-sm leading-relaxed"
        >
          {narrative}
        </div>
      )}
    </div>
  );
}
