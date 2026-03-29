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
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <ThemeToggle />
        </header>

        <div className="space-y-12">
          {/* Hero */}
          <section className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <img src="/logo.png" alt="Parallax" className="w-14 h-14 rounded-lg dark:brightness-90 dark:contrast-125" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Parallax</h1>
            <p className="text-base text-muted-foreground mb-4">
              See yourself from every angle
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
              Parallax is a personal pattern recognition engine. It synthesizes signals from your writing, music, mood, and self-reports to reveal meaning in the patterns of your life.
            </p>
          </section>

          {/* How the Gauges Work */}
          <section>
            <h2 className="text-lg font-bold mb-4">How the gauges work</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                Your dashboard shows two types of gauges: a <strong className="text-foreground">self-report gauge</strong> (what you say you are) and a <strong className="text-foreground">data-driven gauge</strong> (what your behavior reveals).
              </p>
              <p>
                Each gauge shows your alignment percentage with the prevailing archetype. Below them, five mini gauges show your alignment with all five archetypes simultaneously — like instrument gauges on a car dashboard.
              </p>

              <div className="p-3 rounded-[10px] bg-card border border-border space-y-2 text-xs">
                <p className="font-semibold text-foreground">The math behind the gauges:</p>
                <p>Your state is represented as 8 dimensions (focus, calm, discipline, health, social, creativity, exploration, ambition), each scored 0-100. Each archetype has a "target" profile — the ideal dimension scores for that archetype.</p>
                <p>The gauge shows <strong className="text-foreground">cosine similarity</strong> between your current dimensions and each archetype's target, normalized so all five sum to 100%. The archetype you most closely resemble gets the highest percentage.</p>
                <p>Because all five must sum to 100%, the minimum is around 15-20% (when you're equidistant from all archetypes) and the maximum is around 35-40% (when your profile strongly matches one archetype). A gauge reading of 25%+ for any single archetype indicates a meaningful lean.</p>
              </div>
            </div>
          </section>

          {/* What Moves the Gauges */}
          <section>
            <h2 className="text-lg font-bold mb-4">What moves the gauges</h2>
            <div className="space-y-4 text-sm">
              <div className="p-3 rounded-[10px] bg-card border border-border">
                <p className="font-semibold text-foreground mb-1">Self-report gauge</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  When you type how you're feeling and hit "Read me," the AI interprets your words into dimension scores. Saying "I ran a marathon and feel powerful" would push health and discipline high, ambition up — shifting you toward Builder/Observer. These scores get saved when you save a check-in.
                </p>
              </div>
              <div className="p-3 rounded-[10px] bg-card border border-border">
                <p className="font-semibold text-foreground mb-1">Data-driven gauge</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  This gauge is fed by three data sources, each contributing dimension nudges:
                </p>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1.5">
                  <li><strong className="text-foreground">Music (Spotify):</strong> High energy → ambition/health. Low valence → creativity. Instrumental → focus/discipline. Danceable → social/exploration. Nudges are averaged across today's listening, not just one track.</li>
                  <li><strong className="text-foreground">Writing (Inner Mirror):</strong> Emotion analysis, MBTI inference, political compass, and moral foundations all generate dimension nudges. Introverted writing → focus/calm. Libertarian themes → exploration. High care moral → social. Nudges are averaged across your last 7 days of writing.</li>
                  <li><strong className="text-foreground">Fitness (coming soon):</strong> Steps, sleep, heart rate, HRV → health, calm, discipline nudges.</li>
                </ul>
              </div>
              <div className="p-3 rounded-[10px] bg-card border border-border">
                <p className="font-semibold text-foreground mb-1">Cumulative weighting</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  The gauges are cumulative — they reflect a <strong className="text-foreground">weighted average of all your saved check-ins</strong>, with recent entries counting up to 3x more than older ones. This means:
                </p>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                  <li>• Your first check-in sets the baseline</li>
                  <li>• Each additional check-in shifts the gauges, but gradually — one entry doesn't override everything</li>
                  <li>• Over time, the gauges converge on your actual pattern, not any single mood snapshot</li>
                  <li>• Recent behavior matters more than old behavior (recency weighting)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Example */}
          <section>
            <h2 className="text-lg font-bold mb-4">Example: "I ran a marathon"</h2>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
              <p>You type "I ran a marathon today and feel unstoppable." The AI might set:</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-card border border-border">Health: <strong className="text-foreground">92</strong></div>
                <div className="p-2 rounded-lg bg-card border border-border">Discipline: <strong className="text-foreground">85</strong></div>
                <div className="p-2 rounded-lg bg-card border border-border">Ambition: <strong className="text-foreground">88</strong></div>
                <div className="p-2 rounded-lg bg-card border border-border">Calm: <strong className="text-foreground">60</strong></div>
                <div className="p-2 rounded-lg bg-card border border-border">Focus: <strong className="text-foreground">75</strong></div>
                <div className="p-2 rounded-lg bg-card border border-border">Social: <strong className="text-foreground">40</strong></div>
              </div>
              <p>This profile most closely matches <strong className="text-foreground">Builder</strong> (high discipline, ambition, health) with <strong className="text-foreground">Observer</strong> traits (high focus). The Builder gauge might jump to 28%, pushing it ahead of the others.</p>
              <p>If you save this check-in and it's your 5th entry, it accounts for roughly 25-30% of the cumulative average (due to recency weighting). By your 20th check-in, any single entry moves the needle about 8-12%.</p>
            </div>
          </section>

          {/* The Five Archetypes */}
          <section>
            <h2 className="text-lg font-bold mb-4">The five archetypes</h2>
            <div className="space-y-3">
              {ARCHETYPES.map(arch => (
                <div key={arch.key} className="p-3 rounded-[10px] bg-card border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{arch.emoji}</span>
                    <span className="font-semibold" style={{ color: arch.color }}>{arch.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{arch.coreDrive}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">{arch.philosophy}</p>
                  <div className="flex flex-wrap gap-1">
                    {arch.subtypes.map(s => (
                      <span key={s.key} className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground border border-border">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Data Sources */}
          <section>
            <h2 className="text-lg font-bold mb-4">Data sources</h2>
            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-[10px] bg-card border border-border">
                <p className="font-semibold text-foreground">🎵 Music (Sonic Mirror)</p>
                <p className="text-xs text-muted-foreground mt-1">Connect your Spotify account. Parallax reads your currently playing track and recently played history, analyzes audio features (energy, valence, danceability, acousticness, instrumentalness, tempo), and converts them into personality dimension scores. Your listening patterns reveal emotional states you might not articulate.</p>
              </div>
              <div className="p-3 rounded-[10px] bg-card border border-border">
                <p className="font-semibold text-foreground">✍️ Writing (Inner Mirror)</p>
                <p className="text-xs text-muted-foreground mt-1">Submit poetry, journal entries, or any personal writing. The AI performs deep analysis: emotional tone, MBTI inference, political compass positioning, moral foundations scoring, theme extraction, and mirror moments (your most revealing lines reflected back with interpretation). Each analysis feeds the archetype engine.</p>
              </div>
              <div className="p-3 rounded-[10px] bg-card border border-border">
                <p className="font-semibold text-foreground">🧠 Self-report (Check-ins)</p>
                <p className="text-xs text-muted-foreground mt-1">Type how you're feeling in your own words. The AI interprets your state across 8 dimensions. Save check-ins regularly to build your cumulative profile. Each check-in is a data point that moves the gauges.</p>
              </div>
              <div className="p-3 rounded-[10px] bg-card border border-border">
                <p className="font-semibold text-foreground">❤️ Health (Body Mirror — coming soon)</p>
                <p className="text-xs text-muted-foreground mt-1">Will connect fitness trackers to add physical data: steps, sleep, heart rate, HRV, exercise. Your body is a signal source for identity patterns.</p>
              </div>
            </div>
          </section>

          {/* Identity Variants */}
          <section>
            <h2 className="text-lg font-bold mb-4">Identity variants</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                Beyond the 5 base archetypes, Parallax derives <strong className="text-foreground">emergent identity variants</strong> — unique, evocative patterns synthesized from your actual behavioral data.
              </p>
              <p>
                Think of archetypes as primary colors. Variants are the infinite shades mixed from them. Your variant is generated by an LLM analyzing all your data sources simultaneously: listening timestamps, writing themes, emotional patterns, and self-reports.
              </p>
              <div className="p-3 rounded-[10px] bg-card border border-border space-y-2 text-xs">
                <p className="font-semibold text-foreground">Example variants:</p>
                <p><strong className="text-foreground">The Night Cartographer</strong> — an Explorer who maps through late-night writing and solo music discovery</p>
                <p><strong className="text-foreground">The Quiet Architect</strong> — a Builder who constructs internally through reflection</p>
                <p><strong className="text-foreground">The Signal Drifter</strong> — an Explorer-Observer hybrid who follows data patterns like a current</p>
              </div>
              <p>
                Each variant includes <strong className="text-foreground">exploration channels</strong> (how you discover), <strong className="text-foreground">emergent traits</strong> (behavioral labels), and a description of what makes your pattern unique. Variants evolve as your data grows.
              </p>
            </div>
          </section>

          {/* Insight Detection */}
          <section>
            <h2 className="text-lg font-bold mb-4">Insight detection</h2>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground leading-relaxed">
                The Discover page runs 7 types of pattern analysis:
              </p>
              {[
                { type: "Observation", color: "hsl(var(--primary))", desc: "Connects multiple data sources to reveal patterns you haven't noticed." },
                { type: "Blind Spot", color: "#f59e0b", desc: "Detects contradictions between how you see yourself and what your behavior indicates." },
                { type: "Creative Signal", color: "#8b5cf6", desc: "Identifies conditions that correlate with your most expressive output." },
                { type: "Trajectory", color: "#10b981", desc: "Projects the direction your current patterns suggest." },
                { type: "Emotional Anomaly", color: "#f43f5e", desc: "Detects when emotional tone diverges from normal signals across data sources." },
                { type: "Creative Surge", color: "#06b6d4", desc: "Detects spikes in creative output and the conditions that preceded them." },
                { type: "State Transition", color: "#f97316", desc: "Detects rapid shifts between archetype modes and what the consolidation/expansion means." },
              ].map(t => (
                <div key={t.type} className="p-2.5 rounded-[10px] bg-card border border-border flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: t.color }} />
                  <div>
                    <p className="font-semibold text-foreground text-xs">{t.type}</p>
                    <p className="text-[11px] text-muted-foreground">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Pages */}
          <section>
            <h2 className="text-lg font-bold mb-4">Pages</h2>
            <div className="space-y-2 text-sm">
              {[
                { name: "Home", desc: "Dashboard with dual gauges (data vs self), mini archetype gauges, insight feed, and check-in." },
                { name: "Music", desc: "Sonic Mirror — now playing, listening history, audio feature analysis, and AI-generated sonic reading." },
                { name: "Writing", desc: "Inner Mirror — submit writing for deep analysis including MBTI, political compass, moral foundations, emotions, quotes, and reading recommendations. Cumulative portrait across all entries." },
                { name: "Discover", desc: "Identity variant detection, emergent trait analysis, and 7 types of insight: pattern observations, blind spots, creative signals, trajectory readings, emotional anomalies, creative surges, and archetype state transitions. Your variant is an LLM-derived identity pattern — like a fingerprint synthesized from all your behavioral data." },
                { name: "Trajectory", desc: "Where you've been and where you're heading. Archetype evolution path, behavioral drivers, and future self alignment." },
                { name: "Decisions", desc: "Decision lab — evaluate choices against your archetype profile. Predicted identity shifts, risk/gain analysis, and per-archetype verdicts." },
              ].map(p => (
                <div key={p.name} className="p-2.5 rounded-[10px] bg-card border border-border">
                  <p className="font-semibold text-foreground text-xs">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">{p.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Philosophy */}
          <section>
            <h2 className="text-lg font-bold mb-4">Philosophy</h2>
            <div className="space-y-4">
              <blockquote className="border-l-2 border-primary pl-4 italic text-sm text-muted-foreground">
                "Parallax should not feel like a tracker. It should feel like a mirror that reveals meaning in the patterns of a person's life."
              </blockquote>
              <blockquote className="border-l-2 border-primary pl-4 italic text-sm text-muted-foreground">
                "The most successful insights connect multiple data sources, reveal patterns you hadn't consciously noticed, frame them in identity-level language, and encourage reflection rather than prescribe behavior."
              </blockquote>
            </div>
          </section>

          {/* Footer */}
          <div className="text-center py-8 text-xs text-muted-foreground/50">
            Parallax — a personal pattern recognition engine for the psyche
          </div>
        </div>
      </div>
    </div>
  );
}
