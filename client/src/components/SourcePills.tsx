import { useState, useEffect, useCallback } from "react";
import { Music, Heart, PenLine, RefreshCw, Sparkles, LinkIcon, Unlink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ARCHETYPE_MAP } from "@shared/archetypes";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface SourcePillsProps {
  onFetchSpotify: () => Promise<any>;
  onFetchFitness: () => Promise<any>;
  onFetchWriting: () => Promise<any>;
  spotifySummary: string;
  fitnessSummary: string;
  writingSummary: string;
}

interface WritingAnalysis {
  emotions: Record<string, number>;
  dimensions: Record<string, number>;
  archetype_lean: string;
  narrative: string;
  nudges: Record<string, number>;
  word_themes: string[];
}

interface SpotifyStatus {
  connected: boolean;
  spotifyUser?: string | null;
  expiresAt?: string;
}

export default function SourcePills({
  onFetchSpotify,
  onFetchFitness,
  onFetchWriting,
  spotifySummary,
  fitnessSummary,
  writingSummary,
}: SourcePillsProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [fitnessLoading, setFitnessLoading] = useState(false);
  const [writingOpen, setWritingOpen] = useState(false);
  const [writingContent, setWritingContent] = useState("");
  const [writingTitle, setWritingTitle] = useState("");
  const [writingDate, setWritingDate] = useState("");
  const [writingAnalyzing, setWritingAnalyzing] = useState(false);
  const [writingResult, setWritingResult] = useState<WritingAnalysis | null>(null);

  // Fetch Spotify connection status
  const { data: spotifyStatus, refetch: refetchStatus } = useQuery<SpotifyStatus>({
    queryKey: ["/api/spotify/status"],
    staleTime: 30000,
  });

  // Listen for postMessage from the Spotify auth popup
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "SPOTIFY_CONNECTED") {
        refetchStatus();
        onFetchSpotify?.();
        toast({ title: "Spotify Connected", description: "Your Spotify account has been linked." });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [refetchStatus, onFetchSpotify, toast]);

  const handleSpotifyConnect = () => {
    if (!user?.id) return;
    // Pass the current origin so the server knows the exact callback URL
    const callbackBase = window.location.origin + window.location.pathname.replace(/\/$/, "");
    window.open(
      `./api/spotify/connect?userId=${user.id}&callback_base=${encodeURIComponent(callbackBase)}`,
      "spotify-auth",
      "width=500,height=700,popup=yes"
    );
  };

  const handleSpotifyDisconnect = async () => {
    try {
      await apiRequest("POST", "/api/spotify/disconnect");
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/spotify"] });
      toast({ title: "Spotify", description: "Disconnected from Spotify." });
    } catch {
      toast({ title: "Error", description: "Could not disconnect Spotify", variant: "destructive" });
    }
  };

  const handleSpotify = async () => {
    if (!spotifyStatus?.connected) {
      handleSpotifyConnect();
      return;
    }
    setSpotifyLoading(true);
    try { await onFetchSpotify(); } finally { setSpotifyLoading(false); }
  };

  const handleFitness = async () => {
    setFitnessLoading(true);
    try { await onFetchFitness(); } finally { setFitnessLoading(false); }
  };

  const handleAnalyzeWriting = async () => {
    if (!writingContent.trim()) return;
    setWritingAnalyzing(true);
    try {
      const res = await apiRequest("POST", "/api/writing/analyze", {
        content: writingContent,
        title: writingTitle || undefined,
        dateWritten: writingDate || undefined,
      });
      const data = await res.json();
      setWritingResult(data);
      await onFetchWriting();
    } catch (err) {
      toast({ title: "Writing", description: "Could not analyze writing", variant: "destructive" });
    } finally {
      setWritingAnalyzing(false);
    }
  };

  const resetWritingDialog = () => {
    setWritingContent("");
    setWritingTitle("");
    setWritingDate("");
    setWritingResult(null);
  };

  const isSpotifyConnected = spotifyStatus?.connected ?? false;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="inline-flex items-center gap-0">
          <button
            data-testid="button-spotify"
            onClick={() => isSpotifyConnected ? setLocation("/spotify") : handleSpotifyConnect()}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-l-full text-xs font-medium transition-all border border-r-0 ${
              isSpotifyConnected
                ? spotifySummary
                  ? "bg-[#1DB954]/10 text-[#1DB954] border-[#1DB954]/20"
                  : "bg-[#1DB954]/5 text-[#1DB954]/80 border-[#1DB954]/15"
                : "bg-card text-muted-foreground border-border hover:border-foreground/20"
            }`}
          >
            <Music className="w-3 h-3" />
            {!isSpotifyConnected ? (
              <>
                <LinkIcon className="w-2.5 h-2.5" />
                Connect Spotify
              </>
            ) : spotifySummary ? (
              <span className="max-w-[120px] truncate">{spotifySummary.replace('Listening to ', '').replace(/"/g, '')}</span>
            ) : (
              spotifyStatus?.spotifyUser || "Spotify"
            )}
            {spotifySummary && isSpotifyConnected && <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954]" />}
          </button>
          {isSpotifyConnected && (
            <button
              data-testid="button-spotify-refresh"
              onClick={handleSpotify}
              disabled={spotifyLoading}
              className={`inline-flex items-center px-2 py-1.5 rounded-r-full text-xs transition-all border border-l-0 ${
                spotifySummary
                  ? "bg-[#1DB954]/10 text-[#1DB954] border-[#1DB954]/20 hover:bg-[#1DB954]/20"
                  : "bg-[#1DB954]/5 text-[#1DB954]/80 border-[#1DB954]/15 hover:bg-[#1DB954]/10"
              }`}
              aria-label="Refresh Spotify"
            >
              <RefreshCw className={`w-3 h-3 ${spotifyLoading ? "animate-spin" : ""}`} />
            </button>
          )}
          {!isSpotifyConnected && (
            <div className="inline-flex items-center px-2 py-1.5 rounded-r-full text-xs border border-l-0 bg-card text-muted-foreground border-border" />
          )}
        </div>

        <button
          data-testid="button-health"
          onClick={() => setLocation("/health")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border bg-card text-muted-foreground border-border hover:border-foreground/20"
        >
          <Heart className="w-3 h-3" />
          Coming soon
        </button>

        <button
          data-testid="button-writing"
          onClick={() => { resetWritingDialog(); setWritingOpen(true); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
            writingSummary
              ? "bg-violet-500/10 text-violet-500 border-violet-500/20"
              : "bg-card text-muted-foreground border-border hover:border-foreground/20"
          }`}
        >
          <PenLine className="w-3 h-3" />
          Writing
          {writingSummary && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
        </button>
      </div>

      {(spotifySummary || fitnessSummary || writingSummary) && (
        <div className="flex flex-col gap-1">
          {spotifySummary && (
            <p className="text-xs text-muted-foreground pl-1" data-testid="text-spotify-summary">
              🎵 {spotifySummary}
            </p>
          )}
          {fitnessSummary && (
            <p className="text-xs text-muted-foreground pl-1" data-testid="text-fitness-summary">
              💪 {fitnessSummary}
            </p>
          )}
          {writingSummary && (
            <p className="text-xs text-muted-foreground pl-1" data-testid="text-writing-summary">
              ✍️ {writingSummary}
            </p>
          )}
        </div>
      )}

      {/* Writing Analysis Dialog */}
      <Dialog open={writingOpen} onOpenChange={setWritingOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Inner Mirror</DialogTitle>
            <DialogDescription>
              Paste a poem, journal entry, or writing sample for analysis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            <input
              data-testid="input-writing-title"
              type="text"
              value={writingTitle}
              onChange={(e) => setWritingTitle(e.target.value)}
              placeholder="Title (optional)"
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
            />
            <input
              data-testid="input-writing-date"
              type="text"
              value={writingDate}
              onChange={(e) => setWritingDate(e.target.value)}
              placeholder="Date written (optional, e.g. March 2024)"
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
            />
            <textarea
              data-testid="input-writing-content"
              value={writingContent}
              onChange={(e) => setWritingContent(e.target.value)}
              placeholder="Paste your writing here..."
              rows={6}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50 font-serif leading-relaxed"
            />
            <button
              data-testid="button-analyze-writing"
              onClick={handleAnalyzeWriting}
              disabled={writingAnalyzing || !writingContent.trim()}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-all hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {writingAnalyzing ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Analyze
                </>
              )}
            </button>
          </div>

          {/* Analysis Result */}
          {writingResult && (
            <div className="space-y-3 mt-3 border-t border-border pt-3">
              {/* Narrative */}
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-sm leading-relaxed" data-testid="card-writing-narrative">
                {writingResult.narrative}
              </div>

              {/* Archetype lean */}
              {writingResult.archetype_lean && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Archetype lean:</span>
                  <span
                    className="text-xs font-medium"
                    style={{ color: ARCHETYPE_MAP[writingResult.archetype_lean]?.color }}
                  >
                    {ARCHETYPE_MAP[writingResult.archetype_lean]?.emoji}{" "}
                    {ARCHETYPE_MAP[writingResult.archetype_lean]?.name || writingResult.archetype_lean}
                  </span>
                </div>
              )}

              {/* Emotions */}
              {writingResult.emotions && Object.keys(writingResult.emotions).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Emotions</p>
                  <div className="space-y-1">
                    {Object.entries(writingResult.emotions)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 5)
                      .map(([emotion, intensity]) => (
                        <div key={emotion} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-20 capitalize">{emotion}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/60 transition-all"
                              style={{ width: `${Math.round(intensity * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
                            {Math.round(intensity * 100)}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Word themes */}
              {writingResult.word_themes && writingResult.word_themes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {writingResult.word_themes.map((theme) => (
                    <span
                      key={theme}
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent text-accent-foreground border border-border"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
