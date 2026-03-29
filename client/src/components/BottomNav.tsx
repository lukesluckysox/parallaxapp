import { Home, Music, PenLine, Compass, TrendingUp, Orbit } from "lucide-react";
import { Link, useLocation } from "wouter";

const NAV_ITEMS = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/holistic", icon: Orbit, label: "Parallax" },
  { href: "/spotify", icon: Music, label: "Music" },
  { href: "/writing", icon: PenLine, label: "Writing" },
  { href: "/discover", icon: Compass, label: "Discover" },
  { href: "/trajectory", icon: TrendingUp, label: "Trajectory" },
];

export default function BottomNav() {
  const [location] = useLocation();

  if (location === "/about") return null;

  return (
    <nav
      data-testid="nav-bottom"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/90 backdrop-blur-md"
    >
      <div className="max-w-2xl mx-auto flex items-center justify-around px-2 py-2.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = location === href || (href === "/" && location === "");
          return (
            <Link
              key={href}
              href={href}
              data-testid={`nav-${label.toLowerCase()}`}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-all ${
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground/40 hover:text-muted-foreground"
              }`}
            >
              <Icon className="w-4.5 h-4.5" strokeWidth={isActive ? 2 : 1.5} />
              <span className={`text-[8px] font-mono ${isActive ? "text-foreground/70" : "text-muted-foreground/30"}`}>
                {label.toLowerCase()}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
