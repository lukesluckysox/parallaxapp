import { Home, Music, PenLine, Compass, TrendingUp } from "lucide-react";
import { Link, useLocation } from "wouter";

const NAV_ITEMS = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/spotify", icon: Music, label: "Music" },
  { href: "/writing", icon: PenLine, label: "Writing" },
  { href: "/discover", icon: Compass, label: "Discover" },
  { href: "/trajectory", icon: TrendingUp, label: "Trajectory" },
];

export default function BottomNav() {
  const [location] = useLocation();

  // Hide on About page
  if (location === "/about") return null;

  return (
    <nav
      data-testid="nav-bottom"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm"
    >
      <div className="max-w-2xl mx-auto flex items-center justify-around px-1 py-1.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = location === href || (href === "/" && location === "");
          return (
            <Link
              key={href}
              href={href}
              data-testid={`nav-${label.toLowerCase()}`}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[3rem] ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.2 : 1.8} />
              <span className={`text-[10px] leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
