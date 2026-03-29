import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import ThemeToggle from "@/components/ThemeToggle";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        const result = await login(username, password);
        if (!result.ok) {
          setError(result.error || "Login failed");
        }
      } else {
        const result = await register(username, password, displayName || undefined);
        if (!result.ok) {
          setError(result.error || "Registration failed");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm space-y-8">
        {/* Logo + tagline */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2.5">
            <img src="/logo.png" alt="Parallax" className="w-10 h-10 rounded-md dark:brightness-90 dark:contrast-125" />
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-auth-title">Parallax</h1>
          </div>
          <p className="text-xs text-muted-foreground">See yourself from every angle</p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-[10px] border border-border bg-card p-1 gap-1">
          <button
            data-testid="button-tab-login"
            type="button"
            onClick={() => { setMode("login"); setError(""); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === "login"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign in
          </button>
          <button
            data-testid="button-tab-register"
            type="button"
            onClick={() => { setMode("register"); setError(""); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === "register"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              data-testid="input-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              className="w-full px-3 py-2.5 rounded-[10px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
            />
          </div>

          {mode === "register" && (
            <div>
              <input
                data-testid="input-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name (optional)"
                autoComplete="name"
                className="w-full px-3 py-2.5 rounded-[10px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
              />
            </div>
          )}

          <div>
            <input
              data-testid="input-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="w-full px-3 py-2.5 rounded-[10px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
            />
          </div>

          {error && (
            <p data-testid="text-auth-error" className="text-xs text-destructive text-center py-1">
              {error}
            </p>
          )}

          <button
            data-testid="button-auth-submit"
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-2.5 rounded-[10px] bg-primary text-primary-foreground text-sm font-medium transition-all hover:opacity-90 disabled:opacity-40"
          >
            {loading
              ? "..."
              : mode === "login"
                ? "Sign in"
                : "Create account"
            }
          </button>
        </form>

        <p className="text-[10px] text-muted-foreground/50 text-center">
          Your data stays on this server. No third-party tracking.
        </p>
      </div>
    </div>
  );
}
