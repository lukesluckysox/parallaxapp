import { Home, CircleDot, FlaskConical, Zap, Ghost, Compass } from "lucide-react";
import { Link, useLocation } from "wouter";

const LUMEN_HUB_URL = "https://lumen-os.up.railway.app";
const CURRENT_APP = "parallax";

const APP_NAV = [
  { key: "parallax", href: "https://parallaxapp.up.railway.app/", icon: Compass, label: "Parallax" },
  { key: "praxis", href: "https://praxis-app.up.railway.app/", icon: FlaskConical, label: "Praxis" },
  { key: "axiom", href: "https://axiomtool-production.up.railway.app/#/", icon: Zap, label: "Axiom" },
  { key: "liminal", href: "https://liminal-app.up.railway.app/", icon: Ghost, label: "Liminal" },
];

export default function BottomNav() {
  const [location] = useLocation();

  if (location === "/about") return null;

  return (
    <nav
      data-testid="nav-bottom"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/90 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Top row: Lumen Home + App Home */}
      <div className="flex border-b border-border/30">
        <a
          href={LUMEN_HUB_URL}
          data-testid="nav-lumen"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          <CircleDot className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span className="text-[10px] font-mono">lumen</span>
        </a>
        <div className="w-px bg-border/30" />
        <Link
          href="/"
          data-testid="nav-app-home"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          <Home className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span className="text-[10px] font-mono">parallax</span>
        </Link>
      </div>

      {/* Bottom row: 4 sub-apps */}
      <div className="flex items-center justify-around px-2 py-1">
        {APP_NAV.map(({ key, href, icon: Icon, label }) => {
          const isSelf = key === CURRENT_APP;
          return (
            <a
              key={key}
              href={isSelf ? "/" : href}
              data-testid={`nav-app-${key}`}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-2 rounded-lg transition-all min-h-[44px] ${
                isSelf
                  ? "text-violet-500"
                  : "text-muted-foreground/40 hover:text-muted-foreground"
              }`}
              {...(!isSelf ? { target: "_self" } : {})}
            >
              <Icon className="w-4.5 h-4.5" strokeWidth={isSelf ? 2 : 1.5} />
              <span className={`text-[10px] font-mono ${isSelf ? "text-violet-500/80" : "text-muted-foreground/30"}`}>
                {label.toLowerCase()}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
