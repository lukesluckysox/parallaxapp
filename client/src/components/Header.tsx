import { useState, useEffect } from "react";
import ThemeToggle from "./ThemeToggle";
import { LogOut, MapPin } from "lucide-react";
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
    // Get location and weather
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            // Use Open-Meteo (free, no API key)
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
            // Reverse geocode for location name
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
          // Geolocation denied — that's fine
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
  if (code === 0) return "☀️";
  if (code <= 2) return "⛅";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "❄️";
  if (code >= 95) return "⛈️";
  return "☀️";
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
      {/* Weather + Clock bar */}
      <div className="flex items-center justify-between mb-3 text-muted-foreground">
        <div className="flex items-center gap-1.5 text-xs">
          {weather ? (
            <>
              <span>{weather.icon}</span>
              <span className="font-medium">{weather.temp}°F</span>
              <span className="text-muted-foreground/60">{weather.condition}</span>
            </>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
          {locationName && (
            <>
              <MapPin className="w-2.5 h-2.5 ml-1 text-muted-foreground/40" />
              <span className="text-muted-foreground/60 text-[10px]">{locationName}</span>
            </>
          )}
        </div>
        <div className="text-right">
          <span className="text-xs font-medium tabular-nums">{formatTime(time)}</span>
        </div>
      </div>

      {/* Main header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="w-8" />
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Parallax" className="w-10 h-10 rounded-lg dark:brightness-90 dark:contrast-125" />
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-title">Parallax</h1>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center" data-testid="text-subtitle">
        See yourself from every angle
      </p>

      {/* Date line */}
      <p className="text-[10px] text-muted-foreground/50 text-center mt-0.5">
        {formatDate(time)}
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
