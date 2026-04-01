import { useEffect } from "react";
import { Link } from "wouter";

export default function LandingPage({ onShowAuth }: { onShowAuth: () => void }) {
  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white overflow-y-auto">
      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative">
        {/* Ambient glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,#5eaaa808_0%,transparent_70%)]" />

        <p className="text-[9px] tracking-[6px] uppercase text-white/15 mb-6 relative z-10">
          Parallax
        </p>
        <h1 className="text-4xl sm:text-5xl font-display font-semibold tracking-tight text-white/85 mb-4 relative z-10 leading-tight">
          See yourself from<br />every angle
        </h1>
        <p className="text-sm text-white/35 max-w-sm leading-relaxed mb-10 relative z-10">
          An identity system that tracks how you feel, what you write, and what you listen to — then reveals the patterns you can't see.
        </p>

        <div className="flex items-center gap-3 relative z-10">
          <button
            onClick={onShowAuth}
            className="px-6 py-2.5 rounded-[10px] bg-white/10 text-white/80 text-sm font-medium hover:bg-white/15 transition-colors border border-white/10"
          >
            Begin
          </button>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <span className="text-[9px] text-white/15 tracking-widest uppercase">scroll</span>
          <div className="w-px h-6 bg-white/10" />
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6">
        <div className="max-w-md mx-auto space-y-12">
          <p className="text-[9px] tracking-[5px] uppercase text-white/20 text-center">How it works</p>

          {[
            {
              step: "01",
              title: "Check in",
              desc: "Tell the app how you're feeling. AI maps your words into 8 identity dimensions and assigns your archetype.",
            },
            {
              step: "02",
              title: "Write something honest",
              desc: "Submit a journal entry, poem, or raw thought. The system extracts emotions, mirror moments, and psychological patterns.",
            },
            {
              step: "03",
              title: "Connect your music",
              desc: "Link Spotify. Your listening patterns reveal mood profiles, energy trends, and sonic identity signals you won't see elsewhere.",
            },
          ].map((item) => (
            <div key={item.step} className="flex gap-4">
              <span className="text-[10px] font-mono text-white/15 pt-1 shrink-0">{item.step}</span>
              <div>
                <h3 className="text-sm font-semibold text-white/70 mb-1">{item.title}</h3>
                <p className="text-xs text-white/30 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* The Five Archetypes */}
      <section className="py-20 px-6">
        <div className="max-w-md mx-auto">
          <p className="text-[9px] tracking-[5px] uppercase text-white/20 text-center mb-10">Five Archetypes</p>
          <div className="grid grid-cols-5 gap-2 text-center">
            {[
              { glyph: "◉", name: "Observer", color: "#7c8ba0" },
              { glyph: "◧", name: "Builder", color: "#6b9080" },
              { glyph: "◇", name: "Explorer", color: "#c4956a" },
              { glyph: "◈", name: "Dissenter", color: "#b07aa1" },
              { glyph: "✧", name: "Seeker", color: "#c17b6e" },
            ].map((a) => (
              <div key={a.name}>
                <span className="text-2xl font-display" style={{ color: a.color }}>{a.glyph}</span>
                <p className="text-[9px] text-white/30 mt-1">{a.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-md mx-auto space-y-6">
          <p className="text-[9px] tracking-[5px] uppercase text-white/20 text-center mb-6">What you get</p>

          {[
            { label: "Free", features: ["Identity calibration", "Unlimited check-ins", "Radar chart + archetype tracking", "Decision lab", "Reflection history"] },
            { label: "Pro", features: ["AI feeling interpretation", "Writing analysis (3 tiers)", "Signal forecast", "Daily reading", "Sonic reading", "Identity Wrapped", "Mirror Drop export", "Variant assignment"] },
          ].map((tier) => (
            <div key={tier.label} className="p-4 rounded-[10px] border border-white/5 bg-white/[0.02]">
              <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3">{tier.label}</p>
              <ul className="space-y-1.5">
                {tier.features.map((f) => (
                  <li key={f} className="text-xs text-white/30 flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 text-center">
        <h2 className="text-xl font-display font-semibold text-white/70 mb-3">
          Your identity is not static
        </h2>
        <p className="text-xs text-white/25 mb-8 max-w-xs mx-auto">
          It moves between recurring patterns. Parallax reveals the modes you cycle through.
        </p>
        <button
          onClick={onShowAuth}
          className="px-6 py-2.5 rounded-[10px] bg-white/10 text-white/80 text-sm font-medium hover:bg-white/15 transition-colors border border-white/10"
        >
          Begin
        </button>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center">
        <p className="text-[9px] text-white/10 font-mono">parallax — all signals, one view</p>
      </footer>
    </div>
  );
}
