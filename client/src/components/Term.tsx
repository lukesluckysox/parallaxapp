import { useState } from "react";

const TERMS: Record<string, string> = {
  archetype: "One of 5 identity modes — Observer, Builder, Explorer, Dissenter, Seeker — each representing a core drive.",
  variant: "Your unique identity pattern, synthesized by the LLM from all your data. Like a character class derived from your behavior.",
  dimension: "One of 8 measurable identity axes: focus, calm, agency, vitality, social, creativity, exploration, drive.",
  constellation: "A recurring identity mode discovered by clustering your check-in history. Requires 15+ check-ins over 14 days.",
  echo: "Detected when your current signals match a previous constellation at 85%+ similarity — reveals cyclical patterns.",
  forecast: "A daily prediction of which archetypes are rising or falling, based on your recent behavioral data.",
  "mirror line": "A single sentence distilled from your writing that captures your most revealing moment.",
  "signal signature": "A unique generative visual fingerprint derived from your dimension scores and archetype distribution.",
};

export default function Term({ children }: { children: string }) {
  const [showDef, setShowDef] = useState(false);
  const key = children.toLowerCase();
  const def = TERMS[key];
  if (!def) return <>{children}</>;

  return (
    <span className="relative inline">
      <button
        onClick={() => setShowDef(!showDef)}
        className="border-b border-dotted border-muted-foreground/20 hover:border-muted-foreground/40 transition-colors cursor-help"
      >
        {children}
      </button>
      {showDef && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDef(false)} />
          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-50 w-56 p-2.5 rounded-lg bg-card border border-border shadow-lg text-[10px] text-muted-foreground/70 leading-relaxed">
            {def}
          </span>
        </>
      )}
    </span>
  );
}
