import { useState } from "react";
import { Info, X } from "lucide-react";

interface InfoTooltipProps {
  text: string;
}

export default function InfoTooltip({ text }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(!open)}
        className="p-0.5 rounded-full text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
        aria-label="Info"
        data-testid="button-info-tooltip"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Tooltip */}
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-64 p-3 rounded-lg bg-card border border-border shadow-lg">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-1.5 right-1.5 text-muted-foreground/30 hover:text-muted-foreground/60"
            >
              <X className="w-3 h-3" />
            </button>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed pr-4">
              {text}
            </p>
          </div>
        </>
      )}
    </span>
  );
}
