import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Clock } from "lucide-react";
import { ARCHETYPE_MAP } from "@shared/archetypes";
import type { Checkin } from "@shared/schema";

export default function HistorySection() {
  const [open, setOpen] = useState(false);

  const { data: checkins = [], isLoading } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins"],
  });

  return (
    <div className="rounded-[10px] border border-border bg-card overflow-hidden">
      <button
        data-testid="button-toggle-history"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-accent/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          History
          {checkins.length > 0 && (
            <span className="text-xs text-muted-foreground">({checkins.length})</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-3 pb-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground py-2">Loading...</p>
          ) : checkins.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No check-ins yet. Save one below.</p>
          ) : (
            <div className="space-y-2">
              {checkins.map((c) => {
                const arch = ARCHETYPE_MAP[c.self_archetype];
                const ts = new Date(c.timestamp);
                const dateStr = ts.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const timeStr = ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

                return (
                  <div
                    key={c.id}
                    data-testid={`card-checkin-${c.id}`}
                    className="p-2.5 rounded-lg border border-border/50 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span>{arch?.emoji || "?"}</span>
                        <span className="font-medium" style={{ color: arch?.color }}>{arch?.name || c.self_archetype}</span>
                        {c.data_archetype && c.data_archetype !== c.self_archetype && (
                          <span className="text-muted-foreground">
                            / {ARCHETYPE_MAP[c.data_archetype]?.emoji} {ARCHETYPE_MAP[c.data_archetype]?.name}
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground">{dateStr} {timeStr}</span>
                    </div>
                    {c.feeling_text && (
                      <p className="text-muted-foreground line-clamp-2">{c.feeling_text}</p>
                    )}
                    {c.llm_narrative && (
                      <p className="text-muted-foreground/70 italic line-clamp-1">{c.llm_narrative}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
