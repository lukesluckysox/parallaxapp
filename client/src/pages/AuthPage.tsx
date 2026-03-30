import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import ThemeToggle from "@/components/ThemeToggle";

const MIRROR_LINES = [
  "You write like someone who builds their freedom in private.",
  "You listen like someone preparing to leave.",
  "You think in spirals, not lines.",
  "You carry silence like a language.",
  "You move toward what you can't yet name.",
];

const LOCATIONS = [
  // US States
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
  // Countries
  "Australia", "Austria", "Belgium", "Brazil", "Canada", "Chile",
  "China", "Colombia", "Croatia", "Czech Republic", "Denmark",
  "Egypt", "Finland", "France", "Germany", "Greece", "Hungary",
  "India", "Indonesia", "Ireland", "Israel", "Italy", "Japan",
  "Kenya", "Malaysia", "Mexico", "Netherlands", "New Zealand",
  "Nigeria", "Norway", "Pakistan", "Philippines", "Poland",
  "Portugal", "Romania", "Russia", "Saudi Arabia", "Singapore",
  "South Africa", "South Korea", "Spain", "Sweden", "Switzerland",
  "Thailand", "Turkey", "Ukraine", "United Kingdom", "United States",
  "Vietnam",
];

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [location, setLocation] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Rotating mirror lines
  const [mirrorIndex, setMirrorIndex] = useState(0);
  const [mirrorVisible, setMirrorVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setMirrorVisible(false);
      setTimeout(() => {
        setMirrorIndex(i => (i + 1) % MIRROR_LINES.length);
        setMirrorVisible(true);
      }, 500);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Location autocomplete filter
  useEffect(() => {
    if (locationQuery.length < 1) {
      setLocationSuggestions([]);
      return;
    }
    const q = locationQuery.toLowerCase();
    setLocationSuggestions(
      LOCATIONS.filter(l => l.toLowerCase().startsWith(q)).slice(0, 6)
    );
  }, [locationQuery]);

  const handleLocationSelect = (loc: string) => {
    setLocation(loc);
    setLocationQuery(loc);
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        const result = await login(username, password);
        if (!result.ok) setError(result.error || "Login failed");
      } else {
        const ageNum = age ? parseInt(age, 10) : undefined;
        if (age && (isNaN(ageNum!) || ageNum! < 13 || ageNum! > 110)) {
          setError("Please enter a valid age");
          setLoading(false);
          return;
        }
        const result = await register(
          username, password,
          displayName || undefined,
          ageNum,
          gender || undefined,
          location || undefined
        );
        if (!result.ok) setError(result.error || "Registration failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background animated radar SVG */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <svg
          viewBox="0 0 400 400"
          className="w-[500px] h-[500px]"
          style={{ opacity: 0.06 }}
        >
          <style>{`
            @keyframes radar-morph {
              0%   { d: path("M200,80 L262,118 L280,188 L240,250 L180,268 L118,238 L100,168 L138,110 Z"); }
              25%  { d: path("M200,70 L275,125 L295,200 L250,260 L190,275 L115,240 L90,165 L130,105 Z"); }
              50%  { d: path("M200,85 L255,115 L270,185 L230,245 L175,265 L110,230 L95,160 L145,115 Z"); }
              75%  { d: path("M200,75 L268,120 L285,195 L242,255 L182,270 L112,242 L92,162 L135,108 Z"); }
              100% { d: path("M200,80 L262,118 L280,188 L240,250 L180,268 L118,238 L100,168 L138,110 Z"); }
            }
            @keyframes radar-morph-2 {
              0%   { d: path("M200,110 L242,135 L255,178 L228,218 L188,230 L148,210 L135,168 L158,128 Z"); }
              33%  { d: path("M200,105 L248,138 L262,183 L232,222 L185,234 L142,212 L128,168 L155,124 Z"); }
              66%  { d: path("M200,115 L238,132 L250,175 L224,215 L190,228 L152,208 L140,170 L162,132 Z"); }
              100% { d: path("M200,110 L242,135 L255,178 L228,218 L188,230 L148,210 L135,168 L158,128 Z"); }
            }
            .radar-outer { animation: radar-morph 12s ease-in-out infinite; }
            .radar-mid   { animation: radar-morph-2 9s ease-in-out infinite reverse; }
          `}</style>
          <circle cx="200" cy="200" r="150" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="200" cy="200" r="100" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="200" cy="200" r="50"  fill="none" stroke="currentColor" strokeWidth="0.5" />
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i * Math.PI * 2) / 8 - Math.PI / 2;
            const x2 = 200 + 150 * Math.cos(angle);
            const y2 = 200 + 150 * Math.sin(angle);
            return <line key={i} x1="200" y1="200" x2={x2} y2={y2} stroke="currentColor" strokeWidth="0.5" />;
          })}
          <path className="radar-outer" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1" d="M200,80 L262,118 L280,188 L240,250 L180,268 L118,238 L100,168 L138,110 Z" />
          <path className="radar-mid" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1" d="M200,110 L242,135 L255,178 L228,218 L188,230 L148,210 L135,168 L158,128 Z" />
        </svg>
      </div>

      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm space-y-8 relative z-10">
        {/* Logo + tagline */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center">
            <h1 className="text-4xl font-display font-semibold tracking-tight" data-testid="text-auth-title">Parallax</h1>
          </div>
          <p className="text-[10px] text-muted-foreground/50 font-mono tracking-widest uppercase">a personal pattern recognition engine</p>
          <div className="min-h-[40px] flex items-center justify-center px-4 pt-1">
            <p
              className="text-xs font-display italic text-foreground/40 leading-relaxed text-center transition-opacity duration-500"
              style={{ opacity: mirrorVisible ? 1 : 0 }}
            >
              "{MIRROR_LINES[mirrorIndex]}"
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-[10px] border border-border bg-card p-1 gap-1">
          <button
            data-testid="button-tab-login"
            type="button"
            onClick={() => { setMode("login"); setError(""); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign in
          </button>
          <button
            data-testid="button-tab-register"
            type="button"
            onClick={() => { setMode("register"); setError(""); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === "register" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            data-testid="input-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            className="w-full px-3 py-2.5 rounded-[10px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
          />

          {mode === "register" && (
            <>
              <input
                data-testid="input-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name (optional)"
                autoComplete="name"
                className="w-full px-3 py-2.5 rounded-[10px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
              />

              {/* Age + Gender row */}
              <div className="flex gap-2">
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Age"
                  min="13"
                  max="110"
                  className="w-1/2 px-3 py-2.5 rounded-[10px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                />
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-1/2 px-3 py-2.5 rounded-[10px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-muted-foreground/80"
                >
                  <option value="">Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="nonbinary">Non-binary</option>
                  <option value="prefer_not">Prefer not to say</option>
                </select>
              </div>

              {/* Location autocomplete */}
              <div className="relative">
                <input
                  type="text"
                  value={locationQuery}
                  onChange={(e) => {
                    setLocationQuery(e.target.value);
                    setLocation(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="State or country (optional)"
                  className="w-full px-3 py-2.5 rounded-[10px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                />
                {showSuggestions && locationSuggestions.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-[10px] shadow-lg overflow-hidden">
                    {locationSuggestions.map(loc => (
                      <button
                        key={loc}
                        type="button"
                        onMouseDown={() => handleLocationSelect(loc)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <input
            data-testid="input-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="w-full px-3 py-2.5 rounded-[10px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
          />

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
            {loading ? "..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="text-[10px] text-muted-foreground/50 text-center">
          Your data stays on this server. No third-party tracking.
        </p>
      </div>
    </div>
  );
}
