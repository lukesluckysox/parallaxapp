import { useState } from "react";
import { Link } from "wouter";
import { Music, PenLine, Aperture, ArrowRight, Check } from "lucide-react";

const STEPS = [
  {
    icon: Music,
    title: "Connect Spotify",
    description: "Link your music to see how your listening patterns reveal your identity.",
    action: "mirrors/sonic",
    actionLabel: "Connect Spotify",
    color: "#6b9080",
  },
  {
    icon: PenLine,
    title: "Submit a writing",
    description: "Paste a poem, journal entry, or anything you've written. The AI will find the mirror moment.",
    action: "mirrors/inner",
    actionLabel: "Write something",
    color: "#7c8ba0",
  },
  {
    icon: Aperture,
    title: "Check in",
    description: "Tell Parallax how you're feeling right now. This is the calibration point for everything else.",
    action: "snapshot",
    actionLabel: "Take a snapshot",
    color: "#b8976a",
  },
];

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="min-h-screen bg-background noise-overlay flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground mb-1">Welcome to Parallax</h1>
          <p className="text-xs text-muted-foreground/50 font-mono">three ways to start building your identity profile</p>
        </div>

        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <Link key={i} href={`/${step.action}`} onClick={onComplete}>
                <div className="flex items-center gap-4 p-4 rounded-[10px] border border-border/30 bg-card/20 hover:bg-card/40 transition-all cursor-pointer group">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${step.color}15` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: step.color }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{step.title}</p>
                    <p className="text-[11px] text-muted-foreground/50">{step.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>

        <button
          onClick={onComplete}
          className="w-full py-2.5 text-xs font-mono text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
        >
          skip for now — explore on your own
        </button>
      </div>
    </div>
  );
}
