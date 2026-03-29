import { Link } from "wouter";
import { ArrowLeft, Heart } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const INTEGRATIONS = [
  "Apple Health",
  "Fitbit",
  "Garmin",
  "Oura",
  "Whoop",
];

export default function HealthPage() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back-home"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Parallax
          </Link>
          <h1 className="text-base font-bold" data-testid="text-page-title">
            Body Mirror
          </h1>
          <ThemeToggle />
        </header>

        {/* Center content */}
        <div className="flex flex-col items-center justify-center text-center pt-16 space-y-6">
          <Heart
            className="w-16 h-16 text-muted-foreground/20"
            strokeWidth={1.2}
            data-testid="icon-health-heart"
          />

          <div className="space-y-3">
            <h2
              className="text-lg font-bold text-foreground"
              data-testid="text-coming-soon"
            >
              Coming Soon
            </h2>
            <p
              className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto"
              data-testid="text-health-description"
            >
              Body Mirror will connect your fitness and health data — steps,
              sleep, heart rate, HRV, exercise — to reveal how your physical
              state shapes your identity patterns.
            </p>
          </div>

          {/* Integration pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {INTEGRATIONS.map((name) => (
              <span
                key={name}
                data-testid={`badge-integration-${name.toLowerCase().replace(/\s+/g, "-")}`}
                className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-muted/50 text-muted-foreground border border-border"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
