import { Link } from "wouter";
import { Music, PenLine, Heart, ArrowRight } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const MIRRORS = [
  {
    href: "/mirrors/sonic",
    icon: Music,
    title: "Sonic Mirror",
    subtitle: "Your listening identity, tracked over time",
    description: "Connect Spotify to see how your music choices reveal emotional patterns, energy states, and identity signals.",
    color: "#6b9080",
  },
  {
    href: "/mirrors/inner",
    icon: PenLine,
    title: "Inner Mirror",
    subtitle: "Your writing reveals who you are right now",
    description: "Submit poetry, journal entries, or prose. AI analyzes emotional tone, psychological themes, and hidden patterns.",
    color: "#7c8ba0",
  },
  {
    href: "/mirrors/body",
    icon: Heart,
    title: "Body Mirror",
    subtitle: "Your physical signals, decoded",
    description: "Connect fitness trackers to add steps, sleep, heart rate, and HRV to your identity profile. Coming soon.",
    color: "#b8976a",
    comingSoon: true,
  },
];

export default function MirrorsPage() {
  return (
    <div className="min-h-screen bg-background noise-overlay pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-center justify-between">
          <div />
          <h1 className="text-base font-display font-semibold">Mirrors</h1>
          <ThemeToggle />
        </header>
        <p className="text-xs text-muted-foreground/50 text-center -mt-2 font-mono">
          data collection — see yourself from every angle
        </p>

        <div className="space-y-3">
          {MIRRORS.map((mirror) => {
            const Icon = mirror.icon;
            return (
              <Link key={mirror.href} href={mirror.href}>
                <div
                  className={`p-4 rounded-[10px] border border-border/40 bg-card/30 hover:bg-card/60 transition-all cursor-pointer group ${mirror.comingSoon ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${mirror.color}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: mirror.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-foreground">{mirror.title}</h2>
                        {mirror.comingSoon && (
                          <span className="text-[9px] font-mono text-muted-foreground/40 uppercase">soon</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground/60">{mirror.subtitle}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
                  </div>
                  <p className="text-[11px] text-muted-foreground/40 leading-relaxed mt-2 pl-13">
                    {mirror.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
