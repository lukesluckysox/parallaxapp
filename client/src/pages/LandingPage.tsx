import { useEffect, useState } from "react";

// ── FAQ accordion item ──────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.04] last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-start justify-between gap-4 w-full py-3.5 text-left group"
      >
        <span className="text-xs text-white/45 group-hover:text-white/60 transition-colors leading-relaxed">
          {q}
        </span>
        <span className="text-white/15 text-xs shrink-0 mt-0.5">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <p className="text-[11px] text-white/20 leading-relaxed pb-4 -mt-1 pr-6">
          {a}
        </p>
      )}
    </div>
  );
}

const LANDING_FAQS = [
  {
    q: "What is Parallax actually doing with my data?",
    a: "Parallax stores what you choose to give it — your writing, check-ins, and any connected signals — in its own database so it can show you Mirrors, Motion, Trajectory, Helix, Refractions, and other views of your pattern. Your data exists to reflect you back to yourself, not to power an ad network or some hidden third party.",
  },
  {
    q: "Does Parallax sell or share my data?",
    a: "No. Parallax doesn't sell your data to advertisers or data brokers, and we don't run third-party ad trackers inside the app. The only services that ever see your data are the ones required to operate Parallax, like Anthropic (for AI analysis) and Spotify (if you choose to connect your listening data).",
  },
  {
    q: "Is my data used to train AI models?",
    a: "When Parallax sends your text to Anthropic's Claude API for analysis, it's only to generate your personal insights in that moment. Anthropic's API terms state that customer API data is not used to train their public models. Parallax does not train its own models on your private entries.",
  },
  {
    q: "Is this a mental health or medical tool?",
    a: "No. Parallax is a self-reflection and identity pattern tool. It can help you notice themes and shifts, but it isn't a substitute for therapy, medical care, or professional advice.",
  },
  {
    q: 'How "accurate" are the reflections?',
    a: "Parallax is interpretive, not oracular. It reads patterns in your writing, listening, and check-ins and turns them into mirrors and motion — but it will never know you better than you know yourself. Treat it as a lens and conversation partner, not a verdict machine.",
  },
  {
    q: 'Will Parallax try to "fix" or optimize me?',
    a: "No. Parallax doesn't score you as good or bad. It shows you where your energy and archetypes are moving so you can decide what you want to lean into, soften, or experiment with. You're in charge of the story; the app is just a mirror.",
  },
];

export default function LandingPage({ onShowAuth }: { onShowAuth: () => void }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white overflow-y-auto scroll-smooth">

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="min-h-[85dvh] sm:min-h-screen flex flex-col items-center justify-center px-6 text-center relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,#5eaaa808_0%,transparent_70%)]" />

        <p className="text-[9px] tracking-[6px] uppercase text-white/35 mb-6 relative z-10">
          Parallax
        </p>
        <h1 className="text-4xl sm:text-5xl font-display font-semibold tracking-tight text-white/85 mb-4 relative z-10 leading-tight">
          See how you change.
        </h1>
        <p className="text-sm text-white/30 max-w-sm leading-relaxed mb-10 relative z-10">
          Turn your writing, listening, check-ins, and choices into a living map of your patterns — what's stable, what's shifting, and what conditions bring out different versions of you.
        </p>

        <button
          onClick={onShowAuth}
          className="px-7 py-2.5 min-h-[44px] rounded-[10px] bg-white/10 text-white/80 text-sm font-medium hover:bg-white/15 transition-colors border border-white/10 relative z-10"
        >
          Start free
        </button>
      </section>

      {/* ── Archetypes ───────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-md mx-auto">
          <p className="text-[9px] tracking-[5px] uppercase text-white/15 text-center mb-8">
            Five Archetypes
          </p>
          <div className="grid grid-cols-5 gap-2 text-center">
            {[
              { glyph: "◉", name: "Observer", color: "#7c8ba0" },
              { glyph: "◧", name: "Builder", color: "#5a7d9a" },
              { glyph: "◇", name: "Explorer", color: "#6b9080" },
              { glyph: "◈", name: "Dissenter", color: "#c17b6e" },
              { glyph: "✧", name: "Seeker", color: "#b8976a" },
            ].map((a) => (
              <div key={a.name}>
                <span className="text-2xl font-display" style={{ color: a.color }}>
                  {a.glyph}
                </span>
                <p className="text-[9px] text-white/25 mt-1">{a.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-md mx-auto space-y-10">
          <p className="text-[9px] tracking-[5px] uppercase text-white/15 text-center">
            How it works
          </p>

          <p className="text-sm text-white/35 leading-relaxed text-center max-w-sm mx-auto">
            Most apps log your day. Parallax interprets it. Your data becomes a dynamic read on your identity — the archetypes you lean toward, the variants you move through, and the conditions that shape your trajectory.
          </p>

          <div className="space-y-8">
            {[
              {
                step: "01",
                title: "Check in",
                desc: "Tell the app how you're feeling. AI maps your words into 8 identity dimensions and assigns your archetype.",
              },
              {
                step: "02",
                title: "Write something honest",
                desc: "Submit a journal entry, poem, or raw thought. Parallax reveals emotions, mirror moments, and psychological patterns within your words.",
              },
              {
                step: "03",
                title: "Connect your signals",
                desc: "Link Spotify, feed in behavioral data. Your listening and routine patterns reveal identity signals you won't see elsewhere.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <span className="text-[10px] font-mono text-white/12 pt-1 shrink-0">
                  {item.step}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-white/65 mb-1">
                    {item.title}
                  </h3>
                  <p className="text-xs text-white/25 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-lg mx-auto">
          <p className="text-[9px] tracking-[5px] uppercase text-white/15 text-center mb-8">
            Understand yourself through
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                title: "Mirrors",
                subhead: "See yourself through different lenses.",
                body: "Writing, music, and behavioral inputs become reflections of tone, pattern, tension, and emerging identity signals.",
                color: "#7c8ba0",
              },
              {
                title: "Motion",
                subhead: "Track what's shifting, not just what's happening.",
                body: "Archetype drift, narrative projection, variant DNA, and deeper modules like Time Capsule — your identity over time.",
                color: "#6b9080",
              },
              {
                title: "Decision Lab",
                subhead: "Make choices with more self-awareness.",
                body: "Weigh actions against the kind of person you say you want to become — not just what feels easiest right now.",
                color: "#b8976a",
              },
              {
                title: "Refractions",
                subhead: "How your pattern changes under conditions.",
                body: "Run experiments, observe what strengthens or weakens certain patterns, and understand how recovery actually happens for you.",
                color: "#c17b6e",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="p-4 rounded-[10px] border border-white/[0.04] bg-white/[0.015]"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: f.color }}
                  />
                  <h3 className="text-xs font-semibold text-white/65">{f.title}</h3>
                </div>
                <p className="text-[11px] text-white/35 mb-1.5">{f.subhead}</p>
                <p className="text-[10px] text-white/20 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who it's for ─────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-md mx-auto text-center">
          <p className="text-[9px] tracking-[5px] uppercase text-white/15 mb-6">
            Who it's for
          </p>
          <div className="space-y-3">
            {[
              "People who journal or reflect regularly.",
              "People who care about self-observation and pattern recognition.",
              "People who want more than mood logging.",
              "People curious how music, writing, routine, and decisions shape who they become.",
            ].map((line) => (
              <p key={line} className="text-xs text-white/25 leading-relaxed">
                {line}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ───────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-md mx-auto text-center space-y-4">
          <h2 className="text-base font-display font-semibold text-white/60">
            Free to start. Deeper insight when you're ready.
          </h2>
          <div className="space-y-2">
            <p className="text-xs text-white/25 leading-relaxed">
              <span className="text-white/40 font-medium">Free</span> — calibration, basic snapshot, and early signal reading.
            </p>
            <p className="text-xs text-white/25 leading-relaxed">
              <span className="text-white/40 font-medium">Parallax Pro</span> — deep mirrors, Motion layers, Decision Lab, Refractions, Helix, Time Capsule, and future exports like Wrapped and Mirror Drop.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-md mx-auto">
          <p className="text-[9px] tracking-[5px] uppercase text-white/15 text-center mb-6">
            Questions
          </p>
          <div className="rounded-[10px] border border-white/[0.04] bg-white/[0.015] px-4">
            {LANDING_FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section className="py-20 px-6 text-center">
        <p className="text-sm text-white/30 max-w-xs mx-auto leading-relaxed mb-8">
          You are not one static profile.<br />
          You are a pattern in motion.
        </p>
        <button
          onClick={onShowAuth}
          className="px-7 py-2.5 min-h-[44px] rounded-[10px] bg-white/10 text-white/80 text-sm font-medium hover:bg-white/15 transition-colors border border-white/10"
        >
          Start free
        </button>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="py-8 text-center">
        <p className="text-[9px] text-white/20 font-mono">parallax — all signals, one view</p>
      </footer>
    </div>
  );
}
