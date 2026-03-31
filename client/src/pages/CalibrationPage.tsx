import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { ARCHETYPE_MAP } from "@shared/archetypes";

const WORD_PAIRS = [
  { a: "Structure", b: "Freedom" },
  { a: "Clarity", b: "Mystery" },
  { a: "Solitude", b: "Connection" },
  { a: "Expression", b: "Restraint" },
  { a: "Action", b: "Reflection" },
];

const MOTIVATIONS = [
  "Curiosity",
  "Self-understanding",
  "Someone shared it with me",
  "I want to track patterns",
];

type Phase = "intro" | "words" | "motivation" | "reveal";

export default function CalibrationPage() {
  const { markCalibrated } = useAuth();

  // Force dark mode on calibration screens
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  const [phase, setPhase] = useState<Phase>("intro");
  const [currentPair, setCurrentPair] = useState(0);
  const [choices, setChoices] = useState<string[]>([]);
  const [motivation, setMotivation] = useState("");
  const [seedArchetype, setSeedArchetype] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleWordChoice = (word: string) => {
    const newChoices = [...choices, word];
    setChoices(newChoices);
    if (currentPair < WORD_PAIRS.length - 1) {
      setCurrentPair(currentPair + 1);
    } else {
      setPhase("motivation");
    }
  };

  const handleMotivation = async (m: string) => {
    setMotivation(m);
    setSaving(true);
    try {
      const res = await apiRequest("POST", "/api/auth/calibrate", {
        choices,
        motivation: m,
      });
      const data = await res.json();
      if (data.seedArchetype) {
        setSeedArchetype(data.seedArchetype);
      }
    } catch {}
    setSaving(false);
    setPhase("reveal");
  };

  const handleComplete = () => {
    markCalibrated();
  };

  const arch = seedArchetype ? ARCHETYPE_MAP[seedArchetype] : null;

  // ── Intro ──
  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="max-w-sm text-center space-y-6">
          <h1 className="text-2xl font-display font-semibold text-foreground/80">
            Identity Calibration
          </h1>
          <div className="w-12 h-px bg-primary/30 mx-auto" />
          <p className="text-xs text-muted-foreground/50 leading-relaxed">
            Before you begin, a few quick instinct checks to seed your profile.
            There are no wrong answers — go with your gut.
          </p>
          <button
            onClick={() => setPhase("words")}
            className="px-6 py-2.5 rounded-[10px] bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
            data-testid="button-begin-calibration"
          >
            Begin
          </button>
        </div>
      </div>
    );
  }

  // ── Word Pairs ──
  if (phase === "words") {
    const pair = WORD_PAIRS[currentPair];
    const progress = ((currentPair) / WORD_PAIRS.length) * 100;

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="max-w-sm w-full text-center space-y-8">
          {/* Progress */}
          <div className="w-full h-0.5 bg-border/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/50 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-[10px] font-mono text-muted-foreground/30 uppercase tracking-widest">
            Pick the word that resonates
          </p>

          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => handleWordChoice(pair.a.toLowerCase())}
              className="flex-1 py-8 rounded-[10px] border border-border/40 bg-card/20 hover:bg-card/50 hover:border-primary/30 transition-all text-sm font-display font-semibold text-foreground/70 hover:text-foreground"
              data-testid={`button-word-${pair.a.toLowerCase()}`}
            >
              {pair.a}
            </button>
            <span className="text-[10px] text-muted-foreground/20 font-mono">or</span>
            <button
              onClick={() => handleWordChoice(pair.b.toLowerCase())}
              className="flex-1 py-8 rounded-[10px] border border-border/40 bg-card/20 hover:bg-card/50 hover:border-primary/30 transition-all text-sm font-display font-semibold text-foreground/70 hover:text-foreground"
              data-testid={`button-word-${pair.b.toLowerCase()}`}
            >
              {pair.b}
            </button>
          </div>

          <p className="text-[9px] font-mono text-muted-foreground/20">
            {currentPair + 1} of {WORD_PAIRS.length}
          </p>
        </div>
      </div>
    );
  }

  // ── Motivation ──
  if (phase === "motivation") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="max-w-sm w-full text-center space-y-6">
          <p className="text-[10px] font-mono text-muted-foreground/30 uppercase tracking-widest">
            What brought you here?
          </p>

          <div className="space-y-2">
            {MOTIVATIONS.map((m) => (
              <button
                key={m}
                onClick={() => handleMotivation(m)}
                disabled={saving}
                className="w-full py-3 px-4 rounded-[10px] border border-border/40 bg-card/20 hover:bg-card/50 hover:border-primary/30 transition-all text-xs text-muted-foreground/60 hover:text-foreground/70 disabled:opacity-40"
                data-testid={`button-motivation-${m.toLowerCase().replace(/\s/g, "-")}`}
              >
                {m}
              </button>
            ))}
          </div>

          {saving && (
            <p className="text-[10px] font-mono text-muted-foreground/30 animate-pulse">
              calibrating...
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Reveal ──
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="max-w-sm text-center space-y-6">
        <p className="text-[10px] font-mono text-muted-foreground/30 uppercase tracking-widest">
          Your seed archetype
        </p>

        {arch && (
          <>
            <div
              className="text-5xl font-display mx-auto"
              style={{ color: arch.color }}
            >
              {arch.emoji}
            </div>
            <h2
              className="text-2xl font-display font-semibold"
              style={{ color: arch.color }}
            >
              {arch.name}
            </h2>
            <p className="text-xs text-muted-foreground/50 leading-relaxed">
              {arch.philosophy}
            </p>
            <p className="text-[10px] text-muted-foreground/30 leading-relaxed italic">
              This will evolve as you check in, write, and listen.
            </p>
          </>
        )}

        <button
          onClick={handleComplete}
          className="px-6 py-2.5 rounded-[10px] bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
          data-testid="button-enter-parallax"
        >
          Enter Parallax
        </button>
      </div>
    </div>
  );
}
