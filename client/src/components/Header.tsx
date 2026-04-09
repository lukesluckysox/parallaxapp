// This component is unused — TopBar.tsx replaced it.
// Commented out to prevent duplicate weather API calls from useClockAndWeather().
// Original code preserved below for reference.

/*
import { useState, useEffect } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface WeatherData {
  temp: number;
  condition: string;
  icon: string;
  location: string;
}

function useClockAndWeather() {
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState<string>("");

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
              const condition = weatherCodeToText(code);
              const icon = weatherCodeToIcon(code);
              setWeather({
                temp: Math.round(data.current.temperature_2m),
                condition,
                icon,
                location: "",
              });
            }
            try {
              const geoRes = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
              );
              const geoData = await geoRes.json();
              setLocationName(geoData.city || geoData.locality || geoData.principalSubdivision || "");
            } catch {
              setLocationName("");
            }
          } catch {
            // Weather fetch failed silently
          }
        },
        () => {
          // Geolocation denied
        },
        { timeout: 5000 }
      );
    }
  }, []);

  return { time, weather, locationName };
}

function weatherCodeToText(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow";
  if (code >= 95) return "Storm";
  return "Clear";
}

function weatherCodeToIcon(code: number): string {
  if (code === 0) return "clear";
  if (code <= 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  if (code <= 86) return "snow";
  if (code >= 95) return "storm";
  return "clear";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function Header() {
  const { user, logout } = useAuth();
  const { time, weather, locationName } = useClockAndWeather();

  return (
    <header className="pt-3 pb-2">
      <div className="flex items-center justify-between mb-4 text-muted-foreground font-mono text-[11px]">
        <div className="flex items-center gap-2">
          {weather ? (
            <>
              <span className="tabular-nums">{weather.temp}°</span>
              <span className="text-muted-foreground/40">|</span>
              <span className="text-muted-foreground/60">{weather.icon}</span>
            </>
          ) : (
            <span className="text-muted-foreground/30">—</span>
          )}
          {locationName && (
            <>
              <span className="text-muted-foreground/40">|</span>
              <span className="text-muted-foreground/40">{locationName}</span>
            </>
          )}
        </div>
        <div>
          <span className="tabular-nums">{formatTime(time)}</span>
        </div>
      </div>

      <div className="text-center mb-1">
        <h1 className="text-3xl font-display font-semibold tracking-tight text-foreground" data-testid="text-title">
          Parallax
        </h1>
        <p className="text-[11px] text-muted-foreground/50 mt-1 tracking-wide" data-testid="text-subtitle">
          See yourself from every angle
        </p>
        <p className="text-[10px] text-muted-foreground/30 font-mono mt-0.5">
          {formatDate(time)}
        </p>
      </div>

      {user && (
        <div className="flex items-center justify-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground/50 font-mono" data-testid="text-username">
            {user.displayName || user.username}
          </span>
          <button
            data-testid="button-logout"
            onClick={logout}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/30 hover:text-foreground transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="w-3 h-3" />
          </button>
        </div>
      )}
    </header>
  );
}
*/

// Export a no-op component so imports don't break
export default function Header() {
  return null;
}
