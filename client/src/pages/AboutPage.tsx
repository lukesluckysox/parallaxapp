import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { ARCHETYPES } from "@shared/archetypes";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background noise-overlay">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="flex items-center pt-2 pb-1 mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
        </header>

        <div className="space-y-12">
          {/* Hero */}
          <section className="text-center mb-8">
            <h1 className="text-3xl font-display font-semibold tracking-tight mb-2">Parallax</h1>
            <p className="text-xs text-muted-foreground/50 font-mono mb-4">
              a personal pattern recognition engine
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
              Parallax synthesizes signals from your writing, music, mood, and self-reports to reveal
              recurring identity patterns. It treats identity as dynamic, cyclical, and multi-signal —
              not a fixed type.
            </p>
          </section>

          {/* App Structure */}
          <section>
            <h2 className="text-lg font-display font-semibold mb-4">How it works</h2>
            <div className="space-y-3 text-sm">
              {[
                {
                  name: "Home (Identity Parallax)",
                  desc: "Your identity dashboard — variant name, 8-dimension radar chart, archetype distribution, active identity echoes, and the Parallax Mirror one-liner. Ambient background shifts based on your dominant archetype. Visual signals fade when data goes stale.",
                },
                {
                  name: "Snapshot (Instant Reflection)",
                  desc: "Quick present-moment check-in. Type how you're feeling, get an AI interpretation mapped to 8 dimensions. Daily Reading combines your narrative arc with today's signal forecast. Dual bars show self-report vs data-driven archetype alignment. Check-in streak counter tracks consistency.",
                },
                {
                  name: "Mirrors (Data Collection)",
                  desc: "Three mirrors feed the system. Sonic Mirror analyzes your Spotify listening — mood clustering radar, temporal patterns, discovery ratio. Inner Mirror analyzes your writing — emotional tone, mirror moments, MBTI, political compass, moral foundations. Body Mirror (coming soon) will add fitness data.",
                },
                {
                  name: "Signals (Pattern Detection)",
                  desc: "Hub for deeper insights. Featured insight preview, constellation status, latest echo. Drill into All Insights (7 types, paginated) or Timeline & Patterns (constellation visualization, identity timeline, echo archive).",
                },
                {
                  name: "Motion (Trajectory)",
                  desc: "Forward-looking — projected archetype movement, dimension drivers, emerging identity signals, future alignment.",
                },
                {
                  name: "Decision Lab",
                  desc: "Evaluate choices against your archetype profile. Per-archetype verdicts, predicted identity shifts, risk/gain analysis. Accessible from the Snapshot page.",
                },
              ].map((p) => (
                <div key={p.name} className="p-3 rounded-[10px] bg-card/30 border border-border/30">
                  <p className="font-semibold text-foreground text-xs">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground/60 leading-relaxed mt-0.5">{p.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* The 8 Dimensions */}
          <section>
            <h2 className="text-lg font-display font-semibold mb-4">The 8 dimensions</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Every data source maps onto 8 psychological dimensions scored 0-100. These form the
              shape of your identity radar and drive all archetype calculations.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {["Focus", "Calm", "Discipline", "Health", "Social", "Creativity", "Exploration", "Ambition"].map((dim) => (
                <div key={dim} className="px-3 py-2 rounded-lg bg-card/20 border border-border/20">
                  <span className="text-xs font-mono text-foreground/60">{dim}</span>
                </div>
              ))}
            </div>
          </section>

          {/* The 5 Archetypes */}
          <section>
            <h2 className="text-lg font-display font-semibold mb-4">The 5 archetypes</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Archetypes are not static personality types. They shift dynamically based on behavioral
              inputs. Your distribution is percentage-based — all 5 are always present in different proportions.
            </p>
            <div className="space-y-3">
              {ARCHETYPES.map((arch) => (
                <div key={arch.key} className="p-3 rounded-[10px] bg-card/30 border border-border/30">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg font-display" style={{ color: arch.color }}>{arch.emoji}</span>
                    <span className="font-semibold text-sm" style={{ color: arch.color }}>{arch.name}</span>
                    <span className="text-[10px] text-muted-foreground/40 ml-auto font-mono">{arch.coreDrive}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{arch.philosophy}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {arch.subtypes.map((s) => (
                      <span key={s.key} className="text-[9px] px-2 py-0.5 rounded-full bg-accent/30 text-foreground/40 border border-border/20 font-mono">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Identity System */}
          <section>
            <h2 className="text-lg font-display font-semibold mb-4">Identity system</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <div className="p-3 rounded-[10px] bg-card/30 border border-border/30">
                <p className="font-semibold text-foreground text-xs mb-1">Variant Detection</p>
                <p className="text-[11px] text-muted-foreground/60">
                  The LLM synthesizes all your data into an emergent identity variant — a unique name
                  like "The Night Cartographer" or "The Quiet Architect." Variants are derived from the
                  5 base archetypes but are limitless. Each includes exploration channels, emergent traits,
                  and a description.
                </p>
              </div>
              <div className="p-3 rounded-[10px] bg-card/30 border border-border/30">
                <p className="font-semibold text-foreground text-xs mb-1">Identity Constellations</p>
                <p className="text-[11px] text-muted-foreground/60">
                  After 15+ check-ins over 2+ weeks, the system runs k-means clustering on your dimension
                  vectors to discover recurring identity modes. Each mode gets an LLM-generated name and
                  represents a stable behavioral pattern you cycle through.
                </p>
              </div>
              <div className="p-3 rounded-[10px] bg-card/30 border border-border/30">
                <p className="font-semibold text-foreground text-xs mb-1">Identity Echoes</p>
                <p className="text-[11px] text-muted-foreground/60">
                  When your current signals match a previously observed mode (85%+ cosine similarity),
                  an echo is detected. This appears on the home dashboard, in the timeline, and in the
                  echo archive. Echoes reveal cyclical patterns in your identity.
                </p>
              </div>
              <div className="p-3 rounded-[10px] bg-card/30 border border-border/30">
                <p className="font-semibold text-foreground text-xs mb-1">Parallax Mirror</p>
                <p className="text-[11px] text-muted-foreground/60">
                  A single evocative line distilled from your latest writing mirror moment — something
                  like "You write like someone who builds their freedom in private." Designed to be
                  screenshot-worthy and shareable.
                </p>
              </div>
            </div>
          </section>

          {/* Data Sources */}
          <section>
            <h2 className="text-lg font-display font-semibold mb-4">Data sources</h2>
            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-[10px] bg-card/30 border border-border/30">
                <p className="font-semibold text-foreground text-xs">Sonic Mirror (Music)</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  Spotify OAuth connection. Tracks are imported passively when you open the app. Audio features
                  (energy, valence, danceability, acousticness, instrumentalness, tempo) are analyzed and clustered
                  into 6 mood profiles: Ambient, Energetic, Melancholic, Rhythmic, Acoustic, Experimental.
                  Temporal patterns show when and how you listen.
                </p>
              </div>
              <div className="p-3 rounded-[10px] bg-card/30 border border-border/30">
                <p className="font-semibold text-foreground text-xs">Inner Mirror (Writing)</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  Submit any writing for tiered analysis. Primary: mirror moment, narrative reading, emotional
                  tone. Secondary: dimension scores, archetype lean, quotes, book recommendations. Deep Layer:
                  MBTI inference, political compass, moral foundations. Each tier is an independent LLM call —
                  select only what you want.
                </p>
              </div>
              <div className="p-3 rounded-[10px] bg-card/30 border border-border/30">
                <p className="font-semibold text-foreground text-xs">Self-reports (Check-ins)</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  Free-text feeling input interpreted by AI into 8-dimension scores. Check-ins are cumulative —
                  recent entries are weighted up to 3x heavier than older ones. Each check-in also triggers
                  identity echo detection against known constellation modes.
                </p>
              </div>
              <div className="p-3 rounded-[10px] bg-card/30 border border-border/30">
                <p className="font-semibold text-foreground text-xs">Body Mirror (coming soon)</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  Will connect fitness trackers for steps, sleep, heart rate, HRV. Architecture is ready.
                </p>
              </div>
            </div>
          </section>

          {/* Insight Types */}
          <section>
            <h2 className="text-lg font-display font-semibold mb-4">7 insight types</h2>
            <div className="space-y-2">
              {[
                { type: "Observation", desc: "Connects multiple data sources to reveal patterns you haven't noticed." },
                { type: "Blind Spot", desc: "Detects contradictions between self-perception and behavioral data." },
                { type: "Creative Signal", desc: "Identifies conditions that correlate with your most expressive output." },
                { type: "Trajectory", desc: "Projects the direction your current patterns suggest." },
                { type: "Emotional Anomaly", desc: "Detects when emotional tone diverges from normal signals." },
                { type: "Creative Surge", desc: "Detects output spikes and the conditions that preceded them." },
                { type: "State Transition", desc: "Detects rapid shifts between archetype modes." },
              ].map((t) => (
                <div key={t.type} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-card/20 border border-border/20">
                  <div className="w-1 h-1 rounded-full bg-primary/40 mt-1.5 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground text-[11px]">{t.type}</p>
                    <p className="text-[10px] text-muted-foreground/50">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Daily Reading */}
          <section>
            <h2 className="text-lg font-display font-semibold mb-4">Daily Reading</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A single LLM call that combines narrative identity interpretation with practical signal
              forecasting. Produces an arc name, 2-3 sentence narrative, archetype signal levels
              (rising/elevated/stable/low/dormant), recommended conditions, and personal operating rules.
              Cached for 30 minutes. Replaces the previous separate mythology and forecast systems.
            </p>
          </section>

          {/* Privacy */}
          <section>
            <h2 className="text-lg font-display font-semibold mb-4">Your data</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              All data stays on the server. Nothing is sent to third parties except Spotify (to read your
              listening history) and Anthropic's Claude (to analyze your writing and generate insights — it
              doesn't store your data). You can export all your data as JSON or delete your account entirely
              from the home page.
            </p>
          </section>

          {/* Philosophy */}
          <section>
            <h2 className="text-lg font-display font-semibold mb-4">Philosophy</h2>
            <div className="space-y-4">
              <blockquote className="border-l-2 border-primary/30 pl-4 italic text-sm text-muted-foreground/60">
                "Parallax should not feel like a tracker. It should feel like a mirror that reveals
                meaning in the patterns of a person's life."
              </blockquote>
              <blockquote className="border-l-2 border-primary/30 pl-4 italic text-sm text-muted-foreground/60">
                "Identity is not static. It moves between recurring patterns. The system doesn't label
                you with a fixed type — it reveals the modes you cycle through and the conditions that
                produce them."
              </blockquote>
            </div>
          </section>

          {/* Footer */}
          <div className="text-center py-8 text-[10px] text-muted-foreground/20 font-mono">
            parallax — a personal pattern recognition engine for the psyche
          </div>
        </div>
      </div>
    </div>
  );
}
