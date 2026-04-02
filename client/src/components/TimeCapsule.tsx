import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Clock } from "lucide-react";

interface Echo {
  title: string;
  body: string;
}

interface TimeCapsuleResponse {
  echoes: Echo[];
}

export default function TimeCapsule() {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<TimeCapsuleResponse>({
    queryKey: ["/api/time-capsule"],
    staleTime: 10 * 60_000,
    enabled: open, // only fetch when expanded
  });

  const echoes = data?.echoes || [];

  return (
    <div className="space-y-2" data-testid="card-time-capsule">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full group"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
        )}
        <Clock className="w-3.5 h-3.5 text-muted-foreground/40" />
        <span className="text-sm font-bold text-foreground/80 group-hover:text-foreground transition-colors">
          Time Capsule
        </span>
      </button>

      {open && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          {isLoading ? (
            <div className="p-4 rounded-[10px] border border-border bg-card space-y-3">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-px bg-border/50" />
                <div className="h-4 bg-muted rounded w-2/3" />
                <div className="h-3 bg-muted rounded w-5/6" />
                <div className="h-px bg-border/50" />
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-4/5" />
              </div>
            </div>
          ) : echoes.length === 0 ? (
            <div className="p-4 rounded-[10px] border border-dashed border-border bg-card/50 text-center">
              <p className="text-xs text-muted-foreground">
                Check in a few times to unlock your historical echoes.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-[10px] border border-border bg-card space-y-4">
              {echoes.map((echo, i) => (
                <div key={i}>
                  {i > 0 && <div className="h-px bg-border/30 mb-4" />}
                  <p className="text-sm font-medium text-foreground/90 leading-snug">
                    {echo.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed font-serif italic">
                    {echo.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
