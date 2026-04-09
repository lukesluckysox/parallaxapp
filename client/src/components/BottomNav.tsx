import { Home, Aperture, Layers, Radio, TrendingUp } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

const NAV_ITEMS = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/snapshot", icon: Aperture, label: "Reflection" },
  { href: "/mirrors", icon: Layers, label: "Mirrors" },
  { href: "/signals", icon: Radio, label: "Signals" },
  { href: "/motion", icon: TrendingUp, label: "Motion" },
];

export default function BottomNav() {
  const [location] = useLocation();

  const { data: echoData } = useQuery<{ active: any }>({
    queryKey: ["/api/echo"],
    staleTime: 5 * 60 * 1000,
  });
  const hasActiveEcho = !!echoData?.active;

  if (location === "/about") return null;

  return (
    <nav
      data-testid="nav-bottom"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/90 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="max-w-2xl mx-auto flex items-center justify-around px-2 py-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          let isActive: boolean;
          if (href === "/") {
            isActive = location === href || location === "";
          } else if (href === "/mirrors") {
            isActive = location === href || location.startsWith("/mirrors/");
          } else if (href === "/signals") {
            isActive = location === href || location.startsWith("/signals/");
          } else if (href === "/motion") {
            isActive = location === href || location.startsWith("/motion/");
          } else {
            isActive = location === href;
          }
          return (
            <Link
              key={href}
              href={href}
              data-testid={`nav-${label.toLowerCase()}`}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-3 rounded-lg transition-all min-h-[44px] ${
                isActive
                  ? "text-violet-500"
                  : "text-muted-foreground/40 hover:text-muted-foreground"
              }`}
            >
              <Icon className="w-4.5 h-4.5" strokeWidth={isActive ? 2 : 1.5} />
              <span className={`text-[10px] font-mono ${isActive ? "text-violet-500/80" : "text-muted-foreground/30"}`}>
                {label.toLowerCase()}
              </span>
              {label === "Signals" && hasActiveEcho && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
