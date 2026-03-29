import ThemeToggle from "./ThemeToggle";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="pt-2 pb-1">
      <div className="flex items-center justify-between mb-1">
        <div className="w-8" />
        <div className="flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="Parallax logo">
            <line x1="8" y1="4" x2="14" y2="28" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="14" y1="4" x2="20" y2="28" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
            <line x1="20" y1="4" x2="26" y2="28" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" opacity="0.3" />
          </svg>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-title">Parallax</h1>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center" data-testid="text-subtitle">
        See yourself from every angle
      </p>
      {user && (
        <div className="flex items-center justify-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground" data-testid="text-username">
            {user.displayName || user.username}
          </span>
          <button
            data-testid="button-logout"
            onClick={logout}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="w-3 h-3" />
          </button>
        </div>
      )}
    </header>
  );
}
