import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";
import ThemeToggle from "@/components/ThemeToggle";
import { ArrowLeft, RefreshCw, Music, Clock, Users, Zap, LinkIcon, Unlink } from "lucide-react";

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
  byDay: {
    date: string;
    tracks: SpotifyListen[];
    totalMinutes: number;
    trackCount: number;
  }[];
}

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

function MusicSynopsis({ stats, recentTracks }: { stats: HistoryData["stats"]; recentTracks: SpotifyListen[] }) {
  const [synopsis, setSynopsis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (fetched || stats.totalTracks === 0) return;
    setLoading(true);
    setFetched(true);
    (async () => {
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
    })();
  }, [stats, recentTracks, fetched]);

  if (!synopsis && !loading) return null;

  return (
    <div className="p-3 rounded-[10px] border border-primary/20 bg-primary/5" data-testid="card-music-synopsis">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/60 mb-1.5">
        Sonic reading
      </p>
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-3 bg-muted rounded animate-pulse w-full" />
          <div className="h-3 bg-muted rounded animate-pulse w-4/5" />
        </div>
      ) : (
        <p className="text-sm text-foreground leading-relaxed italic">{synopsis}</p>
      )}
    </div>
  );
}

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
    queryKey: ["/api/spotify/history?days=14"],
    staleTime: 0,
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
      // Single call with ?log=true — logs new tracks AND returns now-playing data
      const res = await apiRequest("GET", "/api/spotify/now?log=true");
      const data = await res.json();
      // Manually update the query cache instead of refetching (avoids double call)
      queryClient.setQueryData(["/api/spotify/now"], data);
      // Refresh history from DB
      await refetchHistory();
    } finally {
      setRefreshing(false);
    }
  }, [refetchHistory]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/history?days=14"] });
    } catch {
      // ignore
    }
  };

  const stats = history?.stats;
  const byDay = history?.byDay || [];

  return (
    <div className="min-h-screen bg-background noise-overlay">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <header className="pt-2 pb-1">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-back"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Parallax
            </Link>
            <h1 className="text-lg font-bold tracking-tight" data-testid="text-sonic-mirror-title">
              Sonic Mirror
            </h1>
            <ThemeToggle />
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

            {/* Music Synopsis */}
            {stats && stats.totalTracks > 0 && (
              <MusicSynopsis stats={stats} recentTracks={byDay.length > 0 ? byDay[0]?.tracks || [] : []} />
            )}

            {/* Listening History by Day */}
            <div data-testid="section-history">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                Listening History
              </p>

              {byDay.length === 0 ? (
                <div className="p-6 rounded-[10px] bg-card border border-border text-center" data-testid="card-empty-history">
                  <Music className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Start listening on Spotify and check back here. Your history builds over time.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {byDay.map((day) => (
                    <div key={day.date}>
                      {/* Day header */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold">{formatDayLabel(day.date)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {day.trackCount} track{day.trackCount !== 1 ? "s" : ""} · {formatMinutes(day.totalMinutes)}
                        </span>
                      </div>

                      {/* Track list */}
                      <div className="space-y-1">
                        {day.tracks.map((track) => (
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
                              <MoodDot value={track.energy} type="energy" />
                              <MoodDot value={track.valence} type="valence" />
                              <span className="text-[10px] tabular-nums text-muted-foreground w-10 text-right">
                                {formatDuration(track.duration_ms)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div className="pb-6" />
      </div>
    </div>
  );
}
