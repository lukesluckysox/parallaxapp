import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Aperture, Layers, Radio, TrendingUp, Gem, Sun, Moon } from "lucide-react";

const LUMEN_HUB_URL = "https://lumen-os.up.railway.app";

const navItems = [
  { href: "/snapshot", label: "Snapshot", shortLabel: "SNAPSHOT", icon: Aperture },
  { href: "/mirrors", label: "Mirrors", shortLabel: "MIRRORS", icon: Layers },
  { href: "/signals", label: "Signals", shortLabel: "SIGNALS", icon: Radio },
  { href: "/motion", label: "Motion", shortLabel: "MOTION", icon: TrendingUp },
  { href: "/portraits", label: "Portraits", shortLabel: "PORTRAITS", icon: Gem },
];

const ParallaxLogo = () => (
  <svg aria-label="Parallax" width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="14" cy="14" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
    <circle cx="14" cy="14" r="1.5" fill="currentColor" opacity="0.8" />
  </svg>
);

function SidebarThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  return (
    <div className="px-5 pb-4">
      <div className="text-[9px] text-sidebar-foreground/25 font-mono uppercase tracking-wider mb-2">
        Theme
      </div>
      <div className="flex gap-1">
        {[
          { val: false, label: "☀", icon: Sun },
          { val: true, label: "☾", icon: Moon },
        ].map(({ val, label }) => (
          <button
            key={String(val)}
            onClick={() => setDark(val)}
            className={`flex-1 text-[9px] font-mono uppercase tracking-wider py-1.5 rounded-sm border transition-all duration-150 ${
              dark === val
                ? "border-[#FFD166] text-[#FFD166] bg-[#FFD166]/8"
                : "border-sidebar-border text-sidebar-foreground/25 hover:text-sidebar-foreground/50 hover:border-sidebar-foreground/30"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AppSidebar() {
  const [location] = useLocation();
  const [username, setUsername] = useState("");

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.username) setUsername(d.username);
      })
      .catch(() => {});
  }, []);

  const isActive = (href: string) => {
    if (href === "/") return location === "/" || location === "";
    return location === href || location.startsWith(href + "/");
  };

  return (
    <aside
      className="flex flex-col bg-sidebar border-r border-sidebar-border"
      style={{ width: 220, minWidth: 220 }}
      data-testid="app-sidebar"
    >
      {/* Logo / Brand */}
      <div className="px-5 pt-7 pb-6">
        <a
          href={LUMEN_HUB_URL}
          className="text-sidebar-foreground/25 hover:text-sidebar-foreground/50 transition-colors text-[9px] font-mono tracking-wider uppercase mb-3 block"
        >
          ◁ Lumen
        </a>
        <div className="flex items-center gap-3">
          <span className="text-sidebar-foreground/60">
            <ParallaxLogo />
          </span>
          <div>
            <div className="text-sidebar-foreground font-mono text-sm font-medium tracking-widest uppercase">
              PARALLAX
            </div>
            <div className="text-sidebar-foreground/35 text-[10px] tracking-wider font-mono uppercase mt-0.5">
              Perspective Engine
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-sidebar-border mb-4" />

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-3" role="navigation" aria-label="Main navigation">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-sm cursor-pointer transition-colors duration-150 ${
                isActive(item.href)
                  ? "bg-sidebar-accent text-[#FFD166]"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
              data-testid={`nav-sidebar-${item.shortLabel.toLowerCase()}`}
            >
              <item.icon
                size={15}
                className={isActive(item.href) ? "text-[#FFD166]" : ""}
                strokeWidth={isActive(item.href) ? 2 : 1.5}
              />
              <span
                className={`text-xs tracking-wider font-mono uppercase ${
                  isActive(item.href) ? "text-[#FFD166] font-medium" : ""
                }`}
              >
                {item.shortLabel}
              </span>
            </div>
          </Link>
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-5 h-px bg-sidebar-border mt-4 mb-4" />

      {/* Home link */}
      <div className="px-3">
        <Link href="/">
          <div
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-sm cursor-pointer transition-colors duration-150 ${
              location === "/" || location === ""
                ? "bg-sidebar-accent text-[#FFD166]"
                : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/30"
            }`}
            data-testid="nav-sidebar-home"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 5.5L7 1.5L12 5.5V12H9V8.5H5V12H2V5.5Z" />
            </svg>
            <span className="text-xs tracking-wider font-mono uppercase">
              Overview
            </span>
          </div>
        </Link>
      </div>

      {/* Theme toggle pushed to bottom */}
      <div className="mt-auto">
        <SidebarThemeToggle />
      </div>

      {/* Footer */}
      <div className="px-5 pb-6">
        {username ? (
          <Link href="/profile">
            <div className="text-[10px] text-sidebar-foreground/35 hover:text-sidebar-foreground/60 transition-colors font-mono uppercase tracking-wider cursor-pointer">
              {username}
            </div>
          </Link>
        ) : (
          <div className="text-[10px] text-sidebar-foreground/25 font-mono uppercase tracking-wider leading-relaxed">
            PARALLAX
          </div>
        )}
      </div>
    </aside>
  );
}
