import { useState, useEffect } from "react";
import { LogOut, HelpCircle } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import ThemeToggle from "./ThemeToggle";

function useClockAndWeather() {
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState<{ temp: number; condition: string } | null>(null);
  const [locationName, setLocationName] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            const res = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`
            );
            const data = await res.json();
            if (data.current) {
              const code = data.current.weather_code || 0;
              let condition = "clear";
              if (code <= 3) condition = "cloudy";
              else if (code <= 48) condition = "fog";
              else if (code <= 57) condition = "drizzle";
              else if (code <= 67) condition = "rain";
              else if (code <= 77) condition = "snow";
              else if (code <= 82) condition = "showers";
              else if (code >= 95) condition = "storm";
              setWeather({ temp: Math.round(data.current.temperature_2m), condition });
            }
            try {
              const geoRes = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
              );
              const geoData = await geoRes.json();
              setLocationName(geoData.city || geoData.locality || geoData.principalSubdivision || "");
            } catch {}
          } catch {}
        },
        () => {},
        { timeout: 5000 }
      );
    }
  }, []);

  return { time, weather, locationName };
}

export default function TopBar() {
  const { user, logout } = useAuth();
  const { time, weather, locationName } = useClockAndWeather();

  const timeStr = time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <div className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border/30">
      <div className="max-w-2xl mx-auto flex items-center justify-between px-4 py-1.5 text-[10px] font-mono text-muted-foreground/40">
        <div className="flex items-center gap-2">
          {weather ? (
            <>
              <span className="tabular-nums text-muted-foreground/50">{weather.temp}°</span>
              <span className="text-muted-foreground/20">|</span>
              <span>{weather.condition}</span>
            </>
          ) : (
            <span>—</span>
          )}
          {locationName && (
            <>
              <span className="text-muted-foreground/20">|</span>
              <span>{locationName}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-muted-foreground/50">{timeStr}</span>
          {user && (
            <>
              <span className="text-muted-foreground/30">{user.displayName || user.username}</span>
              <Link
                href="/about"
                className="text-muted-foreground/20 hover:text-foreground transition-colors"
                aria-label="Help & FAQ"
              >
                <HelpCircle className="w-3 h-3" />
              </Link>
              <button
                onClick={logout}
                className="text-muted-foreground/20 hover:text-foreground transition-colors"
                aria-label="Sign out"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
