import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";
import {
  ArrowLeft, RefreshCw, Music, Clock, Users, Zap, LinkIcon, Unlink, ChevronRight,
} from "lucide-react";

// ── Interfaces ────────────────────────────────────────────────

interface SpotifyStatus {
  connected: boolean;
  spotifyUser?: string | null;
  expiresAt?: string;
}

interface NowPlayingData {
  connected: boolean;
  playing: boolean;
  logged: boolean;
  track?: {
    name: string;
    artist: string;
    id: string;
    album: string | null;
    albumArt: string | null;
    durationMs: number | null;
  };
  audioFeatures?: {
    energy: number;
    valence: number;
    danceability: number;
    acousticness: number;
    instrumentalness: number;
    tempo: number;
  } | null;
  summary?: string;
}

interface SpotifyListen {
  id: number;
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  album_art_url: string | null;
  duration_ms: number | null;
  energy: number | null;
  valence: number | null;
  danceability: number | null;
  acousticness: number | null;
  timestamp: string;
}

interface HistoryData {
  listens: SpotifyListen[];
  stats: {
    totalTracks: number;
    totalMinutes: number;
    uniqueArtists: number;
    avgEnergy: number;
    avgValence: number;
    avgDanceability: number;
    topArtists: { name: string; count: number }[];
  };
}

interface PatternsData {
  hasData: boolean;
  moodClusters: Record<string, number>;
  hourlyPatterns: { hour: number; count: number; avgEnergy: number; avgValence: number }[];
  discoveryRatio: number;
  uniqueTracks: number;
  uniqueArtists: number;
  totalListens: number;
  trend: {
    recentEnergy: number;
    recentValence: number;
    overallEnergy: number;
    overallValence: number;
    energyDelta: number;
    valenceDelta: number;
  };
}

// ── Helper functions ──────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (!ms) return "--:--";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = (minutes / 60).toFixed(1);
  return `${hrs} hrs`;
}

function formatDayLabel(dateStr: string): string {
  const today = new Date().toISOString().substring(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Subcomponents ─────────────────────────────────────────────

/** Thin horizontal bar for audio features */
function FeatureBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">{value}%</span>
    </div>
  );
}

/** Colored dot indicator for energy/valence */
function MoodDot({ value, type }: { value: number | null; type: "energy" | "valence" }) {
  if (value === null || value === undefined) return null;
  let color: string;
  if (type === "energy") {
    color = value > 65 ? "#ef4444" : value > 35 ? "#f59e0b" : "#3b82f6";
  } else {
    color = value > 65 ? "#22c55e" : value > 35 ? "#a3a3a3" : "#8b5cf6";
  }
  return (
    <span
      className="w-2 h-2 rounded-full inline-block shrink-0"
      style={{ backgroundColor: color }}
      title={`${type}: ${value}%`}
    />
  );
}

/** Stat card */
function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0 p-3 rounded-[10px] bg-card border border-border" data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider truncate">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** Collapsible section */
function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-2.5 px-1 group">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest group-hover:text-foreground/60 transition-colors">{title}</span>
        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground/40 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

/** Mood Radar SVG chart */
function MoodRadar({ clusters }: { clusters: Record<string, number> }) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.36;
  const labels = ["ambient", "energetic", "melancholic", "rhythmic", "acoustic", "experimental"];
  const displayLabels: Record<string, string> = {
    ambient: "Ambient",
    energetic: "Energetic",
    melancholic: "Melancholic",
    rhythmic: "Rhythmic",
    acoustic: "Acoustic",
    experimental: "Experimental",
  };
  const angleStep = (2 * Math.PI) / labels.length;

  const points = labels.map((label, i) => {
    const val = (clusters[label] || 0) / 100;
    const angle = -Math.PI / 2 + i * angleStep;
    return { x: cx + maxR * val * Math.cos(angle), y: cy + maxR * val * Math.sin(angle) };
  });

  const rings = [0.25, 0.5, 0.75, 1.0];

  return (
    <div className="flex justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid */}
        {rings.map(r => (
          <polygon
            key={r}
            points={labels.map((_, i) => {
              const angle = -Math.PI / 2 + i * angleStep;
              return `${cx + maxR * r * Math.cos(angle)},${cy + maxR * r * Math.sin(angle)}`;
            }).join(" ")}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={r === 1 ? 0.8 : 0.4}
            opacity={r === 1 ? 0.4 : 0.15}
          />
        ))}
        {/* Axes */}
        {labels.map((_, i) => {
          const angle = -Math.PI / 2 + i * angleStep;
          return (
            <line key={i} x1={cx} y1={cy} x2={cx + maxR * Math.cos(angle)} y2={cy + maxR * Math.sin(angle)} stroke="hsl(var(--border))" strokeWidth={0.4} opacity={0.2} />
          );
        })}
        {/* Shape */}
        <polygon
          points={points.map(p => `${p.x},${p.y}`).join(" ")}
          fill="hsl(var(--primary))"
          fillOpacity={0.1}
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          strokeOpacity={0.6}
          strokeLinejoin="round"
        />
        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="hsl(var(--primary))" opacity={0.7} />
        ))}
        {/* Labels */}
        {labels.map((label, i) => {
          const angle = -Math.PI / 2 + i * angleStep;
          const labelR = maxR + 20;
          const lx = cx + labelR * Math.cos(angle);
          const ly = cy + labelR * Math.sin(angle);
          return (
            <g key={label}>
              <text x={lx} y={ly - 4} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="hsl(var(--muted-foreground))" fontFamily="var(--font-sans)" fontWeight={500} opacity={0.6}>
                {displayLabels[label]}
              </text>
              <text x={lx} y={ly + 8} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="hsl(var(--foreground))" fontFamily="var(--font-mono)" fontWeight={500} opacity={0.4}>
                {clusters[label] || 0}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MusicSynopsis({ stats, recentTracks }: { stats: HistoryData["stats"]; recentTracks: SpotifyListen[] }) {
  const [synopsis, setSynopsis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (loading || stats.totalTracks === 0) return;
    setLoading(true);
    try {
      const trackList = recentTracks.slice(0, 10).map(t =>
        `"${t.track_name}" by ${t.artist_name} (energy:${t.energy ?? "?"}, valence:${t.valence ?? "?"})`
      ).join(", ");
      const res = await apiRequest("POST", "/api/interpret", {
        text: `Based on my music listening patterns: ${stats.totalTracks} tracks, average energy ${stats.avgEnergy}%, average valence ${stats.avgValence}%, top artists: ${stats.topArtists.map(a => a.name).join(", ")}. Recent tracks: ${trackList}. What does my music listening suggest about my current psychological state? Answer in 2-3 sentences, focusing on identity and emotional patterns, not just describing the music.`,
        spotifySummary: `${stats.totalTracks} tracks, avg energy ${stats.avgEnergy}%, avg valence ${stats.avgValence}%`,
      });
      const data = await res.json();
      if (data.narrative) setSynopsis(data.narrative);
    } catch { /* skip */ }
    setLoading(false);
  };

  return (
    <div className="p-3 rounded-[10px] border border-primary/20 bg-primary/5" data-testid="card-music-synopsis">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/60 mb-1.5">
        Sonic reading
      </p>
      {synopsis ? (
        <p className="text-sm text-foreground leading-relaxed italic">{synopsis}</p>
      ) : (
        <button
          onClick={generate}
          disabled={loading}
          className="text-xs text-primary/60 hover:text-primary transition-colors disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate sonic reading →"}
        </button>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function SpotifyPage() {
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch connection status
  const { data: spotifyStatus, refetch: refetchStatus } = useQuery<SpotifyStatus>({
    queryKey: ["/api/spotify/status"],
    staleTime: 30000,
  });

  const isConnected = spotifyStatus?.connected ?? false;

  // Fetch now playing (only if connected)
  const { data: nowPlaying, refetch: refetchNow } = useQuery<NowPlayingData>({
    queryKey: ["/api/spotify/now"],
    staleTime: 0,
    enabled: isConnected,
  });

  // Fetch history (only if connected)
  const { data: history, refetch: refetchHistory } = useQuery<HistoryData>({
    queryKey: ["/api/spotify/history"],
    staleTime: 0,
    enabled: isConnected,
  });

  // Fetch patterns (only if connected)
  const { data: patterns } = useQuery<PatternsData>({
    queryKey: ["/api/spotify/patterns"],
    staleTime: 5 * 60 * 1000,
    enabled: isConnected,
  });

  // Listen for postMessage from the Spotify auth popup
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (event.data?.type === "SPOTIFY_CONNECTED") {
        refetchStatus();
        // After first connection, do an initial import with ?log=true
        // so the user immediately sees their recent listening history
        setTimeout(async () => {
          try {
            const res = await apiRequest("GET", "/api/spotify/now?log=true");
            const data = await res.json();
            queryClient.setQueryData(["/api/spotify/now"], data);
            await refetchHistory();
          } catch {
            // Fallback to read-only fetch if logging fails
            refetchNow();
            refetchHistory();
          }
        }, 800);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [refetchStatus, refetchNow, refetchHistory]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Read-only refresh — just update what's currently playing, no logging
      const res = await apiRequest("GET", "/api/spotify/now");
      const data = await res.json();
      queryClient.setQueryData(["/api/spotify/now"], data);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleConnect = () => {
    if (!user?.id) return;
    const callbackBase = window.location.origin + window.location.pathname.replace(/\/$/, "");
    window.open(
      `./api/spotify/connect?userId=${user.id}&callback_base=${encodeURIComponent(callbackBase)}`,
      "spotify-auth",
      "width=500,height=700,popup=yes"
    );
  };

  const handleDisconnect = async () => {
    try {
      await apiRequest("POST", "/api/spotify/disconnect");
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/spotify"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/now"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/patterns"] });
    } catch {
      // ignore
    }
  };

  const stats = history?.stats;

  return (
    <div className="min-h-screen bg-background noise-overlay">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <header className="pt-2 pb-1">
          <div className="flex items-center justify-between">
            <Link
              href="/mirrors"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-back"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Mirrors
            </Link>
            <h1 className="text-lg font-bold tracking-tight" data-testid="text-sonic-mirror-title">
              Sonic Mirror
            </h1>
            <div />
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-0.5">
            Your listening identity, tracked over time
          </p>
        </header>

        {/* Connection Banner */}
        {!isConnected ? (
          <div className="p-4 rounded-[10px] bg-card border border-border text-center space-y-3" data-testid="card-spotify-connect">
            <Music className="w-10 h-10 text-[#1DB954] mx-auto" />
            <div>
              <p className="text-sm font-semibold">Connect your Spotify account</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Link Spotify to track your listening identity and see how music shapes your character dimensions.
              </p>
            </div>
            <button
              data-testid="button-connect-spotify"
              onClick={handleConnect}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1DB954] text-white text-sm font-medium hover:bg-[#1DB954]/90 transition-colors"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              Connect Spotify
            </button>
          </div>
        ) : (
          <>
            {/* Connected status bar */}
            <div className="flex items-center justify-between px-3 py-2 rounded-[10px] bg-[#1DB954]/10 border border-[#1DB954]/20">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#1DB954]" />
                <span className="text-xs font-medium text-[#1DB954]">
                  {spotifyStatus?.spotifyUser || "Connected to Spotify"}
                </span>
              </div>
              <button
                data-testid="button-disconnect-spotify"
                onClick={handleDisconnect}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Unlink className="w-3 h-3" />
                Disconnect
              </button>
            </div>

            {/* Now Playing Card */}
            <div className="p-4 rounded-[10px] bg-card border border-border" data-testid="card-now-playing">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-[#1DB954]" />
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Now Playing</span>
                </div>
                <button
                  data-testid="button-refresh-now"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                  aria-label="Refresh"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                </button>
              </div>

              {nowPlaying?.playing && nowPlaying.track ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {nowPlaying.track.albumArt ? (
                      <img
                        src={nowPlaying.track.albumArt}
                        alt={nowPlaying.track.album || "Album art"}
                        className="w-14 h-14 rounded-lg shadow-md object-cover shrink-0"
                        data-testid="img-album-art"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Music className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#1DB954] animate-pulse shrink-0" />
                        <p className="text-sm font-semibold truncate" data-testid="text-track-name">
                          {nowPlaying.track.name}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground truncate" data-testid="text-artist-name">
                        {nowPlaying.track.artist}
                      </p>
                      {nowPlaying.track.album && (
                        <p className="text-[10px] text-muted-foreground/70 truncate">
                          {nowPlaying.track.album}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Audio features bars */}
                  {nowPlaying.audioFeatures && (
                    <div className="space-y-1.5 pt-1">
                      <FeatureBar label="Energy" value={nowPlaying.audioFeatures.energy} color="#ef4444" />
                      <FeatureBar label="Valence" value={nowPlaying.audioFeatures.valence} color="#22c55e" />
                      <FeatureBar label="Danceability" value={nowPlaying.audioFeatures.danceability} color="#f59e0b" />
                      <FeatureBar label="Acousticness" value={nowPlaying.audioFeatures.acousticness} color="#3b82f6" />
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="text-nothing-playing">
                  Nothing playing right now
                </p>
              )}
            </div>

            {/* Sonic Reading */}
            {stats && stats.totalTracks > 0 && (
              <MusicSynopsis stats={stats} recentTracks={history?.listens?.slice(0, 10) || []} />
            )}

            {/* Stats Cards */}
            {stats && stats.totalTracks > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="section-stats">
                <StatCard
                  label="Tracks"
                  value={String(stats.totalTracks)}
                  icon={<Music className="w-3 h-3" />}
                />
                <StatCard
                  label="Listened"
                  value={formatMinutes(stats.totalMinutes)}
                  icon={<Clock className="w-3 h-3" />}
                />
                <StatCard
                  label="Artists"
                  value={String(stats.uniqueArtists)}
                  icon={<Users className="w-3 h-3" />}
                />
                <StatCard
                  label="Avg Energy"
                  value={`${stats.avgEnergy}%`}
                  icon={<Zap className="w-3 h-3" />}
                />
              </div>
            )}

            {/* Top Artists */}
            {stats && stats.topArtists.length > 0 && (
              <div className="p-3 rounded-[10px] bg-card border border-border" data-testid="card-top-artists">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Top Artists</p>
                <div className="flex flex-wrap gap-1.5">
                  {stats.topArtists.map((artist) => (
                    <span
                      key={artist.name}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent text-accent-foreground border border-border"
                    >
                      {artist.name}
                      <span className="ml-1 text-muted-foreground">{artist.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Mood Clustering Radar */}
            {patterns?.hasData && patterns.moodClusters && (
              <div className="p-3 rounded-[10px] bg-card border border-border" data-testid="card-mood-radar">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
                  Mood Profile
                </p>
                <MoodRadar clusters={patterns.moodClusters} />
              </div>
            )}

            {/* Listening Patterns — Collapsible */}
            {patterns?.hasData && (
              <div className="rounded-[10px] border border-border/40 bg-card/20 px-3">
                <CollapsibleSection title="Listening Patterns">
                  <div className="space-y-4">
                    {/* Discovery ratio */}
                    <div className="flex items-center justify-between py-1">
                      <span className="text-[11px] text-muted-foreground/60">Discovery ratio</span>
                      <span className="text-xs font-mono text-foreground/70">{patterns.discoveryRatio}%</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-t border-border/20">
                      <span className="text-[11px] text-muted-foreground/60">Unique tracks</span>
                      <span className="text-xs font-mono text-foreground/70">{patterns.uniqueTracks}</span>
                    </div>

                    {/* Trend comparison */}
                    {patterns.trend && (
                      <div className="pt-1 border-t border-border/20">
                        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-mono mb-2">7-day vs overall</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2 rounded-lg bg-card/50 border border-border/30">
                            <p className="text-[10px] text-muted-foreground/50 mb-0.5">Energy</p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-sm font-mono">{patterns.trend.recentEnergy}%</span>
                              <span className={`text-[10px] font-mono ${patterns.trend.energyDelta > 0 ? "text-emerald-500" : patterns.trend.energyDelta < 0 ? "text-rose-500" : "text-muted-foreground/40"}`}>
                                {patterns.trend.energyDelta > 0 ? "+" : ""}{patterns.trend.energyDelta}
                              </span>
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-card/50 border border-border/30">
                            <p className="text-[10px] text-muted-foreground/50 mb-0.5">Valence</p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-sm font-mono">{patterns.trend.recentValence}%</span>
                              <span className={`text-[10px] font-mono ${patterns.trend.valenceDelta > 0 ? "text-emerald-500" : patterns.trend.valenceDelta < 0 ? "text-rose-500" : "text-muted-foreground/40"}`}>
                                {patterns.trend.valenceDelta > 0 ? "+" : ""}{patterns.trend.valenceDelta}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Hourly heatmap */}
                    {patterns.hourlyPatterns && patterns.hourlyPatterns.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-border/20">
                        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-mono mb-2">Listening by hour</p>
                        {patterns.hourlyPatterns.map(h => {
                          const maxCount = Math.max(...patterns.hourlyPatterns.map(p => p.count));
                          const pct = maxCount > 0 ? (h.count / maxCount) * 100 : 0;
                          const hourLabel = h.hour === 0 ? "12am" : h.hour < 12 ? `${h.hour}am` : h.hour === 12 ? "12pm" : `${h.hour - 12}pm`;
                          return (
                            <div key={h.hour} className="flex items-center gap-2">
                              <span className="text-[9px] font-mono text-muted-foreground/40 w-8 text-right">{hourLabel}</span>
                              <div className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden">
                                <div className="h-full rounded-full bg-primary/40" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[9px] font-mono text-muted-foreground/30 w-6 text-right">{h.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CollapsibleSection>
              </div>
            )}

            {/* Listening History — Collapsible */}
            <div className="rounded-[10px] border border-border/40 bg-card/20 px-3" data-testid="section-history">
              <CollapsibleSection title="Listening History">
                {(!history?.listens || history.listens.length === 0) ? (
                  <div className="p-6 rounded-[10px] bg-card border border-border text-center">
                    <Music className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Start listening on Spotify and check back here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {history.listens.map((track) => (
                      <div
                        key={`${track.id}-${track.timestamp}`}
                        className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent/40 transition-colors"
                        data-testid={`track-${track.id}`}
                      >
                        {track.album_art_url ? (
                          <img
                            src={track.album_art_url}
                            alt=""
                            className="w-8 h-8 rounded shadow-sm object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                            <Music className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{track.track_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{track.artist_name}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] font-mono text-muted-foreground/30 w-14 text-right">
                            {new Date(track.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                          </span>
                          <MoodDot value={track.energy} type="energy" />
                          <MoodDot value={track.valence} type="valence" />
                        </div>
                      </div>
                    ))}
                    <p className="text-[9px] text-muted-foreground/30 font-mono text-center pt-2">
                      showing last {history.listens.length} tracks
                    </p>
                  </div>
                )}
              </CollapsibleSection>
            </div>
          </>
        )}

        <div className="pb-6" />
      </div>
    </div>
  );
}
