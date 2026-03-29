import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { ARCHETYPES } from "@shared/archetypes";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="flex items-center justify-between pt-2 pb-1 mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back-about"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <ThemeToggle />
        </header>

        {/* Hero */}
        <section className="text-center mb-16" data-testid="section-hero">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src="/logo.png" alt="Parallax" className="w-14 h-14 rounded-lg dark:brightness-90 dark:contrast-125" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Parallax</h1>
          <p className="text-base text-muted-foreground mb-6">
            See yourself from every angle
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
            Parallax is a personal pattern recognition engine. It synthesizes signals from your writing, music, body, and self-reports to reveal meaning in the patterns of your life.
          </p>
        </section>

        {/* How it works */}
        <section className="mb-16" data-testid="section-how-it-works">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-6 text-center">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-[10px] border border-border bg-card text-center">
              <div className="text-2xl mb-3">📡</div>
              <h3 className="text-sm font-bold mb-1.5">Collect</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Music, fitness, writing, and self-reports feed your profile.
              </p>
            </div>
            <div className="p-4 rounded-[10px] border border-border bg-card text-center">
              <div className="text-2xl mb-3">🔮</div>
              <h3 className="text-sm font-bold mb-1.5">Synthesize</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                AI connects signals across data sources to find hidden patterns.
              </p>
            </div>
            <div className="p-4 rounded-[10px] border border-border bg-card text-center">
              <div className="text-2xl mb-3">🪞</div>
              <h3 className="text-sm font-bold mb-1.5">Reflect</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Insights reveal who you are, who you're becoming, and what your blind spots might be.
              </p>
            </div>
          </div>
        </section>

        {/* The Five Archetypes */}
        <section className="mb-16" data-testid="section-archetypes">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-6 text-center">
            The Five Archetypes
          </h2>
          <div className="space-y-3">
            {ARCHETYPES.map((arch) => (
              <div
                key={arch.key}
                data-testid={`card-about-archetype-${arch.key}`}
                className="p-4 rounded-[10px] border border-border bg-card"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0 mt-0.5">{arch.emoji}</span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <h3 className="text-sm font-bold" style={{ color: arch.color }}>
                        {arch.name}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {arch.coreDrive}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {arch.subtypes.map((sub) => (
                        <span
                          key={sub.key}
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent text-accent-foreground border border-border"
                        >
                          {sub.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Philosophy */}
        <section className="mb-16" data-testid="section-philosophy">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-6 text-center">
            Philosophy
          </h2>
          <div className="space-y-4">
            <blockquote className="p-4 rounded-[10px] border-l-4 border-l-primary/60 bg-primary/5">
              <p className="text-sm text-foreground leading-relaxed italic font-serif">
                "Parallax should not feel like a tracker. It should feel like a mirror that reveals meaning in the patterns of a person's life."
              </p>
            </blockquote>
            <blockquote className="p-4 rounded-[10px] border-l-4 border-l-primary/40 bg-primary/5">
              <p className="text-sm text-foreground leading-relaxed italic font-serif">
                "The most successful insights connect multiple data sources, reveal patterns you hadn't consciously noticed, frame them in identity-level language, and encourage reflection rather than prescribe behavior."
              </p>
            </blockquote>
          </div>
        </section>

        {/* What makes it different */}
        <section className="mb-16" data-testid="section-different">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-6 text-center">
            What makes it different
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-[10px] border border-border bg-card">
              <h3 className="text-sm font-bold mb-1">Signal Detection</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Finds correlations you can't see yourself — across music, movement, writing, and mood.
              </p>
            </div>
            <div className="p-4 rounded-[10px] border border-border bg-card">
              <h3 className="text-sm font-bold mb-1">Mirror Moments</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your own words reflected back with interpretation — the "how did it know?" effect.
              </p>
            </div>
            <div className="p-4 rounded-[10px] border border-border bg-card">
              <h3 className="text-sm font-bold mb-1">Dynamic Phases</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You're not a fixed type. You evolve. Parallax tracks your baseline, current, and emerging archetypes.
              </p>
            </div>
            <div className="p-4 rounded-[10px] border border-border bg-card">
              <h3 className="text-sm font-bold mb-1">Decision Simulation</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                See how choices reshape your identity before you commit — predicted archetype shifts and risk/gain analysis.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center pb-8">
          <Link
            href="/"
            className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
            data-testid="link-start"
          >
            Start exploring →
          </Link>
        </footer>
      </div>
    </div>
  );
}
