import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import { DIMENSIONS } from "@shared/archetypes";
import bcrypt from "bcryptjs";
import { getAuthUrl, exchangeCode, refreshAccessToken, spotifyApi } from "./spotify-auth";

let anthropic: Anthropic;
try {
  anthropic = new Anthropic();
} catch (e) {
  console.warn("Anthropic SDK failed to initialize — LLM features will be unavailable. Set ANTHROPIC_API_KEY env var.");
  anthropic = null as any;
}

// Keep callExternalTool for fitness (non-Spotify) endpoints
// NOTE: external-tool CLI only exists in the Perplexity sandbox.
// On Railway/other hosts, this gracefully returns null.
function callExternalTool(sourceId: string, toolName: string, args: Record<string, unknown>) {
  try {
    const params = JSON.stringify({ source_id: sourceId, tool_name: toolName, arguments: args });
    const result = execSync(`external-tool call '${params}'`, { timeout: 30000 }).toString();
    return JSON.parse(result);
  } catch (err: any) {
    // Silently fail — external-tool doesn't exist outside sandbox
    return null;
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function getUserId(req: Request): number | null {
  const id = req.headers["x-user-id"];
  if (!id) return null;
  return parseInt(id as string, 10) || null;
}

/** Get a valid Spotify access token for a user, refreshing if expired */
async function getValidToken(userId: number): Promise<string | null> {
  const tokenData = storage.getSpotifyToken(userId);
  if (!tokenData) return null;

  const expiresAt = new Date(tokenData.expires_at);
  // Refresh 60 seconds before actual expiry for safety
  if (expiresAt.getTime() <= Date.now() + 60000) {
    try {
      const refreshed = await refreshAccessToken(tokenData.refresh_token);
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      storage.saveSpotifyToken({
        user_id: userId,
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || tokenData.refresh_token,
        expires_at: newExpiresAt,
        spotify_user_id: tokenData.spotify_user_id,
        spotify_display_name: tokenData.spotify_display_name,
      });
      return refreshed.access_token;
    } catch (err) {
      console.error("Token refresh failed:", err);
      return null;
    }
  }
  return tokenData.access_token;
}

/** Construct the redirect URI from request headers or query param */
function getRedirectUri(req: Request): string {
  // Prefer explicit callback_base from frontend (knows the actual deployed URL)
  const callbackBase = req.query.callback_base as string;
  if (callbackBase) {
    return `${callbackBase}/api/spotify/callback`;
  }
  // Fallback to request headers
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}/api/spotify/callback`;
}

// In-memory store for redirect URIs used during auth flow (needed for token exchange)
const pendingAuthRedirectUris: Map<string, string> = new Map();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ===================== AUTH ROUTES =====================

  // POST /api/auth/register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, displayName } = req.body;

      // Validate username: 3+ chars, alphanumeric + underscore
      if (!username || typeof username !== "string" || username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: "Username must be 3+ characters (letters, numbers, underscores)" });
      }

      // Validate password: 6+ chars
      if (!password || typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      // Check if username already taken
      const existing = storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ error: "Username already taken" });
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10);

      // Create user
      const user = storage.createUser({
        username,
        password_hash,
        display_name: displayName || null,
        created_at: new Date().toISOString(),
      });

      return res.json({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
      });
    } catch (err: any) {
      console.error("Register error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const user = storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      return res.json({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
      });
    } catch (err: any) {
      console.error("Login error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/auth/me
  app.get("/api/auth/me", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.json(null);
    }
    const user = storage.getUserById(userId);
    if (!user) {
      return res.json(null);
    }
    return res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
    });
  });

  // ===================== SPOTIFY OAUTH ROUTES =====================

  // GET /api/spotify/connect — Redirects user to Spotify auth (opened in popup)
  app.get("/api/spotify/connect", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).send("Missing userId");
    }
    const redirectUri = getRedirectUri(req);
    // Store the redirect URI so the callback can use the same one
    pendingAuthRedirectUris.set(userId, redirectUri);
    const state = userId;
    const url = getAuthUrl(redirectUri, state);
    return res.redirect(url);
  });

  // GET /api/spotify/callback — Receives auth code from Spotify, exchanges for tokens
  app.get("/api/spotify/callback", async (req, res) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      const error = req.query.error as string;

      if (error) {
        return res.send(`<html><body><p>Authorization denied: ${error}</p><script>window.close();</script></body></html>`);
      }

      if (!code || !state) {
        return res.status(400).send("Missing code or state");
      }

      const userId = parseInt(state, 10);
      if (!userId) {
        return res.status(400).send("Invalid state (userId)");
      }

      // Use the same redirect URI that was used for the auth request
      const redirectUri = pendingAuthRedirectUris.get(state) || getRedirectUri(req);
      pendingAuthRedirectUris.delete(state); // Clean up
      const tokens = await exchangeCode(code, redirectUri);

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      // Fetch Spotify user profile
      let spotifyUserId: string | null = null;
      let spotifyDisplayName: string | null = null;
      try {
        const profile = await spotifyApi(tokens.access_token, "/me");
        spotifyUserId = profile?.id || null;
        spotifyDisplayName = profile?.display_name || profile?.id || null;
      } catch (e) {
        console.error("Failed to fetch Spotify profile:", e);
      }

      // Save tokens to DB
      storage.saveSpotifyToken({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        spotify_user_id: spotifyUserId,
        spotify_display_name: spotifyDisplayName,
      });

      // Return HTML that closes the popup and signals the parent window
      return res.send(`<html><body><script>
  window.opener?.postMessage({ type: "SPOTIFY_CONNECTED" }, "*");
  window.close();
</script><p>Connected! You can close this window.</p></body></html>`);
    } catch (err: any) {
      console.error("Spotify callback error:", err);
      return res.send(`<html><body><p>Error: ${err.message}</p><script>setTimeout(() => window.close(), 3000);</script></body></html>`);
    }
  });

  // GET /api/spotify/status — Check if user has Spotify connected
  app.get("/api/spotify/status", (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.json({ connected: false });
    }
    const token = storage.getSpotifyToken(userId);
    if (!token) {
      return res.json({ connected: false });
    }
    return res.json({
      connected: true,
      spotifyUser: token.spotify_display_name || token.spotify_user_id || null,
      expiresAt: token.expires_at,
    });
  });

  // POST /api/spotify/disconnect — Remove Spotify token
  app.post("/api/spotify/disconnect", (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    storage.deleteSpotifyToken(userId);
    return res.json({ disconnected: true });
  });

  // ===================== SPOTIFY DATA ROUTES =====================

  // GET /api/spotify — fetch currently playing + recently played + compute AGGREGATED nudges
  app.get("/api/spotify", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.json({ connected: false, playing: false, nudges: {}, error: "Not authenticated" });
      }

      const accessToken = await getValidToken(userId);
      if (!accessToken) {
        return res.json({ connected: false, playing: false, nudges: {}, error: "Spotify not connected" });
      }

      // 1. Fetch currently playing track
      let currentTrack: { name: string; artist: string; id: string } | null = null;
      let currentFeatures: any = null;

      try {
        const nowPlaying = await spotifyApi(accessToken, "/me/player/currently-playing");
        if (nowPlaying && nowPlaying.item && nowPlaying.item.id) {
          const item = nowPlaying.item;
          currentTrack = {
            name: item.name || "Unknown",
            artist: item.artists?.[0]?.name || "Unknown",
            id: item.id,
          };
        }
      } catch (e: any) {
        if (e.message !== "TOKEN_EXPIRED") console.error("Currently playing error:", e);
      }

      // 2. Fetch recently played (up to 50 tracks)
      let recentTracks: any[] = [];
      try {
        const recent = await spotifyApi(accessToken, "/me/player/recently-played?limit=50");
        if (recent?.items) {
          recentTracks = recent.items;
        }
      } catch (e: any) {
        console.error("Recently played error:", e);
      }

      // 3. Collect all track IDs for batch audio features
      const allTrackIds: string[] = [];
      if (currentTrack) allTrackIds.push(currentTrack.id);
      for (const item of recentTracks) {
        const trackId = item.track?.id;
        if (trackId && !allTrackIds.includes(trackId)) {
          allTrackIds.push(trackId);
        }
      }

      // 4. Batch fetch audio features (up to 100 at a time)
      const audioFeaturesMap: Map<string, any> = new Map();
      if (allTrackIds.length > 0) {
        try {
          // Batch in chunks of 100
          for (let i = 0; i < allTrackIds.length; i += 100) {
            const chunk = allTrackIds.slice(i, i + 100);
            const featuresResult = await spotifyApi(accessToken, `/audio-features?ids=${chunk.join(",")}`);
            if (featuresResult?.audio_features) {
              for (const feat of featuresResult.audio_features) {
                if (feat && feat.id) {
                  audioFeaturesMap.set(feat.id, feat);
                }
              }
            }
          }
        } catch (e: any) {
          console.error("Batch audio features error:", e);
        }
      }

      // Current track features
      if (currentTrack) {
        currentFeatures = audioFeaturesMap.get(currentTrack.id) || null;
      }

      // 5. Log current track to DB if playing
      if (currentTrack) {
        try {
          storage.logSpotifyListen({
            user_id: userId,
            timestamp: new Date().toISOString(),
            track_id: currentTrack.id,
            track_name: currentTrack.name,
            artist_name: currentTrack.artist,
            album_name: null,
            album_art_url: null,
            duration_ms: null,
            energy: currentFeatures ? Math.round((currentFeatures.energy || 0) * 100) : null,
            valence: currentFeatures ? Math.round((currentFeatures.valence || 0) * 100) : null,
            danceability: currentFeatures ? Math.round((currentFeatures.danceability || 0) * 100) : null,
            acousticness: currentFeatures ? Math.round((currentFeatures.acousticness || 0) * 100) : null,
            instrumentalness: currentFeatures ? Math.round((currentFeatures.instrumentalness || 0) * 100) : null,
            tempo: currentFeatures ? Math.round(currentFeatures.tempo || 0) : null,
          });
        } catch (e) { /* dedup or error, skip */ }
      }

      // 6. Log recently played tracks to DB
      for (const item of recentTracks) {
        const track = item.track;
        if (!track?.id) continue;
        const features = audioFeaturesMap.get(track.id);
        const albumImages = track.album?.images || [];
        try {
          storage.logSpotifyListen({
            user_id: userId,
            timestamp: item.played_at || new Date().toISOString(),
            track_id: track.id,
            track_name: track.name || "Unknown",
            artist_name: track.artists?.[0]?.name || "Unknown",
            album_name: track.album?.name || null,
            album_art_url: albumImages[0]?.url || null,
            duration_ms: track.duration_ms || null,
            energy: features ? Math.round((features.energy || 0) * 100) : null,
            valence: features ? Math.round((features.valence || 0) * 100) : null,
            danceability: features ? Math.round((features.danceability || 0) * 100) : null,
            acousticness: features ? Math.round((features.acousticness || 0) * 100) : null,
            instrumentalness: features ? Math.round((features.instrumentalness || 0) * 100) : null,
            tempo: features ? Math.round(features.tempo || 0) : null,
          });
        } catch (e) { /* dedup or error, skip */ }
      }

      // 7. Compute AGGREGATED nudges from today's listening history
      const todayListens = storage.getSpotifyListensByDay(userId, 1);
      const todayTracks = todayListens.length > 0 ? todayListens[0].tracks : [];

      const nudges: Record<string, number> = {};
      let summaryParts: string[] = [];

      if (todayTracks.length > 0) {
        let energySum = 0, valenceSum = 0, danceSum = 0, acousticSum = 0, instrumentalSum = 0, tempoSum = 0;
        let featureCount = 0;

        for (const t of todayTracks) {
          if (t.energy !== null && t.energy !== undefined) {
            energySum += t.energy / 100;
            valenceSum += (t.valence || 0) / 100;
            danceSum += (t.danceability || 0) / 100;
            acousticSum += (t.acousticness || 0) / 100;
            instrumentalSum += (t.instrumentalness || 0) / 100;
            tempoSum += (t.tempo || 120);
            featureCount++;
          }
        }

        if (featureCount > 0) {
          const avgEnergy = energySum / featureCount;
          const avgValence = valenceSum / featureCount;
          const avgDance = danceSum / featureCount;
          const avgAcoustic = acousticSum / featureCount;
          const avgInstrumental = instrumentalSum / featureCount;
          const avgTempo = tempoSum / featureCount;

          if (avgEnergy > 0.7) { nudges.ambition = (nudges.ambition || 0) + 10; nudges.health = (nudges.health || 0) + 6; }
          else if (avgEnergy > 0.55) { nudges.ambition = (nudges.ambition || 0) + 4; }
          else if (avgEnergy < 0.3) { nudges.calm = (nudges.calm || 0) + 10; nudges.focus = (nudges.focus || 0) + 6; }

          if (avgValence > 0.7) { nudges.social = (nudges.social || 0) + 8; nudges.exploration = (nudges.exploration || 0) + 5; }
          else if (avgValence < 0.3) { nudges.creativity = (nudges.creativity || 0) + 10; nudges.calm = (nudges.calm || 0) - 5; }

          if (avgDance > 0.7) { nudges.social = (nudges.social || 0) + 6; nudges.exploration = (nudges.exploration || 0) + 4; }
          else if (avgDance < 0.3) { nudges.focus = (nudges.focus || 0) + 5; nudges.discipline = (nudges.discipline || 0) + 3; }

          if (avgAcoustic > 0.6) { nudges.calm = (nudges.calm || 0) + 6; nudges.focus = (nudges.focus || 0) + 4; }
          if (avgInstrumental > 0.4) { nudges.focus = (nudges.focus || 0) + 10; nudges.creativity = (nudges.creativity || 0) + 5; nudges.discipline = (nudges.discipline || 0) + 5; }

          if (avgTempo > 140) { nudges.ambition = (nudges.ambition || 0) + 4; nudges.health = (nudges.health || 0) + 3; }
          else if (avgTempo < 90) { nudges.calm = (nudges.calm || 0) + 4; nudges.creativity = (nudges.creativity || 0) + 3; }

          summaryParts.push(`${todayTracks.length} tracks today`);
          if (avgEnergy > 0.7) summaryParts.push("high energy");
          else if (avgEnergy < 0.3) summaryParts.push("low energy");
          if (avgValence > 0.7) summaryParts.push("upbeat mood");
          else if (avgValence < 0.3) summaryParts.push("darker tones");
          if (avgInstrumental > 0.4) summaryParts.push("instrumental focus");
          if (avgAcoustic > 0.6) summaryParts.push("acoustic");
        }

        for (const key of Object.keys(nudges)) {
          nudges[key] = clamp(nudges[key], -15, 15);
        }
      } else if (currentFeatures) {
        const { energy = 0.5, valence = 0.5, danceability = 0.5, acousticness = 0.3, instrumentalness = 0 } = currentFeatures;
        if (energy > 0.75) { nudges.ambition = 10; nudges.health = 6; }
        if (energy < 0.3) { nudges.calm = 10; nudges.focus = 6; }
        if (valence > 0.7) { nudges.social = 8; nudges.exploration = 5; }
        if (valence < 0.3) { nudges.creativity = 10; nudges.calm = (nudges.calm || 0) - 5; }
        if (danceability > 0.75) { nudges.social = (nudges.social || 0) + 6; nudges.exploration = (nudges.exploration || 0) + 4; }
        if (acousticness > 0.65) { nudges.calm = (nudges.calm || 0) + 6; nudges.focus = (nudges.focus || 0) + 4; }
        if (instrumentalness > 0.5) { nudges.focus = (nudges.focus || 0) + 10; nudges.creativity = (nudges.creativity || 0) + 5; nudges.discipline = 5; }
        for (const key of Object.keys(nudges)) { nudges[key] = clamp(nudges[key], -15, 15); }
      }

      // Build final summary
      let summary = "";
      if (currentTrack) {
        summary = `Now: "${currentTrack.name}" by ${currentTrack.artist}`;
        if (summaryParts.length > 0) summary += ` · ${summaryParts.join(", ")}`;
      } else if (summaryParts.length > 0) {
        summary = summaryParts.join(", ");
      }

      const stats = storage.getSpotifyStats(userId);

      return res.json({
        connected: true,
        playing: !!currentTrack,
        track: currentTrack || null,
        audioFeatures: currentFeatures || null,
        nudges,
        summary,
        aggregated: todayTracks.length > 1,
        todayTrackCount: todayTracks.length,
        stats: {
          totalTracks: stats.totalTracks,
          avgEnergy: stats.avgEnergy,
          avgValence: stats.avgValence,
          topArtists: stats.topArtists.slice(0, 3),
        },
      });
    } catch (err: any) {
      console.error("Spotify route error:", err);
      return res.json({ connected: false, playing: false, nudges: {}, error: err.message });
    }
  });

  // GET /api/fitness — fetch wearable data + compute nudges (still uses callExternalTool)
  app.get("/api/fitness", async (_req, res) => {
    try {
      const result = callExternalTool("health", "health_wearables_data", {
        categories: ["activity", "sleep", "vitals_and_labs"],
        time_range_days: 1,
      });

      if (!result || !result.content) {
        return res.json({ connected: false, nudges: {} });
      }

      let content = result.content;
      if (typeof content === "string") {
        try { content = JSON.parse(content); } catch { /* keep as string */ }
      }

      // Parse common metrics
      let steps = 0, sleepHours = 0, exerciseMinutes = 0, restingHR = 0, hrv = 0;

      if (typeof content === "object" && content !== null) {
        const data = content.data || content;
        if (data.activity) {
          steps = data.activity.steps || data.activity.step_count || 0;
          exerciseMinutes = data.activity.exercise_minutes || data.activity.active_minutes || 0;
        }
        if (data.sleep) {
          sleepHours = data.sleep.hours || data.sleep.total_hours || data.sleep.duration_hours || 0;
        }
        if (data.vitals_and_labs || data.vitals) {
          const vitals = data.vitals_and_labs || data.vitals;
          restingHR = vitals.resting_heart_rate || vitals.resting_hr || 0;
          hrv = vitals.hrv || vitals.heart_rate_variability || 0;
        }
        if (!data.activity && !data.sleep) {
          steps = data.steps || 0;
          sleepHours = data.sleep_hours || data.total_sleep_hours || 0;
          exerciseMinutes = data.exercise_minutes || data.active_minutes || 0;
          restingHR = data.resting_heart_rate || data.resting_hr || 0;
          hrv = data.hrv || 0;
        }
      }

      const nudges: Record<string, number> = {};

      if (steps > 10000) { nudges.health = (nudges.health || 0) + 10; nudges.discipline = (nudges.discipline || 0) + 5; }
      else if (steps > 7000) { nudges.health = (nudges.health || 0) + 5; }
      else if (steps < 3000) { nudges.health = (nudges.health || 0) - 5; }

      if (sleepHours >= 7.5) { nudges.calm = (nudges.calm || 0) + 8; nudges.focus = (nudges.focus || 0) + 6; }
      else if (sleepHours < 6) { nudges.calm = (nudges.calm || 0) - 8; nudges.focus = (nudges.focus || 0) - 5; }

      if (exerciseMinutes > 30) { nudges.health = (nudges.health || 0) + 8; nudges.ambition = (nudges.ambition || 0) + 5; nudges.discipline = (nudges.discipline || 0) + 5; }

      if (hrv > 50) { nudges.calm = (nudges.calm || 0) + 6; nudges.health = (nudges.health || 0) + 4; }
      else if (hrv > 0 && hrv < 30) { nudges.calm = (nudges.calm || 0) - 5; }

      for (const key of Object.keys(nudges)) {
        nudges[key] = clamp(nudges[key], -15, 15);
      }

      const parts: string[] = [];
      if (steps > 0) parts.push(`${steps.toLocaleString()} steps`);
      if (sleepHours > 0) parts.push(`${sleepHours.toFixed(1)}h sleep`);
      if (exerciseMinutes > 0) parts.push(`${exerciseMinutes}min exercise`);
      if (restingHR > 0) parts.push(`${restingHR} bpm resting HR`);
      if (hrv > 0) parts.push(`HRV ${hrv}`);

      const summary = parts.length > 0 ? parts.join(" · ") : "Wearable data received";

      return res.json({
        connected: true,
        metrics: { steps, sleepHours, exerciseMinutes, restingHR, hrv },
        nudges,
        summary,
      });
    } catch (err: any) {
      console.error("Fitness route error:", err);
      return res.json({ connected: false, nudges: {}, error: err.message });
    }
  });

  // POST /api/interpret — LLM interprets feeling text into dimensions
  app.post("/api/interpret", async (req, res) => {
    try {
      const { text, spotifySummary, fitnessSummary } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "text is required" });
      }

      const contextParts: string[] = [];
      if (spotifySummary) contextParts.push(`Spotify: ${spotifySummary}`);
      if (fitnessSummary) contextParts.push(`Fitness: ${fitnessSummary}`);
      const contextStr = contextParts.length > 0 ? `\nData context: ${contextParts.join(". ")}` : "";

      const message = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `You are a self-quantification coach. A user described how they feel:

"${text}"${contextStr}

Interpret this into 8 psychological/behavioral dimensions, each scored 0-100. Also provide a brief narrative (2-3 sentences) and which archetype they seem to lean toward.

The 8 dimensions are: focus, calm, discipline, health, social, creativity, exploration, ambition.

The 5 meta-archetypes are: observer (understanding patterns), builder (creating structure), explorer (novelty and expression), dissenter (autonomy and resistance), seeker (meaning and transformation).

Respond ONLY with valid JSON:
{"dimensions":{"focus":N,"calm":N,"discipline":N,"health":N,"social":N,"creativity":N,"exploration":N,"ambition":N},"narrative":"...","archetype_lean":"observer|builder|explorer|dissenter|seeker"}`
        }],
      });

      const responseText = message.content[0].type === "text" ? message.content[0].text : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(500).json({ error: "Could not parse LLM response" });
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return res.json(parsed);
    } catch (err: any) {
      console.error("Interpret error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/analyze-decision — LLM analyzes decision impact
  app.post("/api/analyze-decision", async (req, res) => {
    try {
      const { decision, currentState } = req.body;
      if (!decision || typeof decision !== "string") {
        return res.status(400).json({ error: "decision is required" });
      }

      const stateStr = currentState ? `\nCurrent state: ${JSON.stringify(currentState)}` : "";

      const message = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `You are a decision-analysis coach for the Parallax identity system. A user is considering:

"${decision}"${stateStr}

The 5 meta-archetypes are: observer (understanding patterns), builder (creating structure), explorer (novelty and expression), dissenter (autonomy and resistance), seeker (meaning and transformation).

Estimate the impact on 8 dimensions (each -50 to +50, where positive means the dimension increases):
focus, calm, discipline, health, social, creativity, exploration, ambition.

Also provide:
- reasoning: 2-3 sentences explaining the decision's impact
- quick_take: 1 sentence summary
- predicted_shift: which archetype the user is currently closest to ("from"), which they'd move toward after this decision ("to"), and confidence (0-1)
- risk_factors: array of 2-4 short risk phrases
- potential_gains: array of 2-4 short gain phrases
- narrative: A short narrative sentence framing this as identity progression (e.g. "This decision moves you from observation into active exploration — trading certainty for discovery.")

Respond ONLY with valid JSON:
{"impacts":{"focus":N,"calm":N,"discipline":N,"health":N,"social":N,"creativity":N,"exploration":N,"ambition":N},"reasoning":"...","quick_take":"...","predicted_shift":{"from":"archetype","to":"archetype","confidence":0.0},"risk_factors":["..."],"potential_gains":["..."],"narrative":"..."}`
        }],
      });

      const responseText = message.content[0].type === "text" ? message.content[0].text : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(500).json({ error: "Could not parse LLM response" });
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return res.json(parsed);
    } catch (err: any) {
      console.error("Analyze decision error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/mythology — generate current arc / personal mythology
  app.get("/api/mythology", async (req, res) => {
    try {
      const userId = getUserId(req);
      const recentCheckins = storage.getCheckins(userId).slice(0, 10);
      const recentWritings = storage.getWritings(5, userId);

      if (recentCheckins.length === 0) {
        return res.json({ empty: true });
      }

      const checkinArchetypes = recentCheckins.map(c => c.self_archetype).join(", ");
      const latestCheckin = recentCheckins[0];
      const latestFeeling = latestCheckin.feeling_text || "no text provided";
      const latestNarrative = latestCheckin.llm_narrative || "";

      const writingSummaries = recentWritings.map(w => {
        const analysis = w.analysis ? JSON.parse(w.analysis) : null;
        return analysis ? `${w.title || "Untitled"}: ${analysis.narrative || ""} (lean: ${analysis.archetype_lean || "unknown"})` : null;
      }).filter(Boolean).join("\n");

      const message = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `You are a narrative psychologist for the Parallax identity system. Based on the user's recent data, generate a "Current Arc" — a mythological/narrative interpretation of where they are in their life journey.

Recent check-in archetypes (newest first): ${checkinArchetypes}
Recent writing themes:
${writingSummaries || "No writings yet."}
Current self-reported state: "${latestFeeling}"
${latestNarrative ? `Latest narrative: ${latestNarrative}` : ""}

The 5 meta-archetypes are: observer (understanding patterns), builder (creating structure), explorer (novelty and expression), dissenter (autonomy and resistance), seeker (meaning and transformation).

Generate:
1. arc_name: A short evocative name (e.g., "The Threshold", "The Descent", "The Return", "The Forge", "The Crossing")
2. narrative: 2-3 sentences describing where the user is in their journey, written in second person, slightly poetic
3. baseline_archetype: Their most common archetype historically (from the checkins)
4. current_archetype: Their most recent archetype
5. emerging_archetype: Which archetype is trending based on recent shifts
6. observation: A "Parallax Observation" — a short, poetic insight connecting their behavior, emotion, and identity (2-3 sentences max)

Return ONLY valid JSON:
{"arc_name":"...","narrative":"...","baseline_archetype":"...","current_archetype":"...","emerging_archetype":"...","observation":"..."}`
        }],
      });

      const responseText = message.content[0].type === "text" ? message.content[0].text : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(500).json({ error: "Could not parse LLM response" });
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return res.json(parsed);
    } catch (err: any) {
      console.error("Mythology error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/writing/analyze — LLM analyzes writing sample
  app.post("/api/writing/analyze", async (req, res) => {
    try {
      const { content, title, dateWritten } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "content is required" });
      }

      const userId = getUserId(req);

      const titleStr = title ? `\nTitle: "${title}"` : "";
      const dateStr = dateWritten ? `\nDate written: ${dateWritten}` : "";

      const message = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: `You are an Inner Mirror — a literary psychologist who reads writing to reveal the author's inner state. Analyze this writing sample:${titleStr}${dateStr}

"""
${content}
"""

Analyze the writing for emotional tone, psychological themes, and map those to 8 dimensions (each 0-100):
focus, calm, discipline, health, social, creativity, exploration, ambition.

Key mapping guidelines:
- Dark/heavy emotional content → calm down, creativity up
- Structured/analytical writing → focus up, discipline up
- Social/relational themes → social up, exploration up
- Ambitious/driven language → ambition up, discipline up
- Chaotic/fragmented → discipline down, exploration up, creativity up

Also determine:
- emotions: object mapping emotion names to 0-1 intensity (e.g. {"grief": 0.3, "hope": 0.6})
- archetype_lean: which of the 5 meta-archetypes this writing most reflects (observer, builder, explorer, dissenter, seeker)
- narrative: 2-3 sentence reading of what the writing reveals about who they are right now
- nudges: dimension adjustments from neutral (-15 to +15 for each dimension)
- word_themes: 3-5 thematic words that capture the writing's essence
- mirror_moment: Extract the single most resonant or revealing line from the writing (verbatim), and provide a 2-3 sentence interpretation of what this line reveals about the user's current psychological state, identity, or inner conflict. This should be the "how did it know?" moment.
- political_compass: Infer the author's political compass position from the themes, values, and worldview expressed. economic: -10 (left) to +10 (right), social: -10 (libertarian) to +10 (authoritarian). Include an explanation sentence.
- mbti: Infer MBTI cognitive tendencies from writing style. extraversion: 0-100 (0=introversion, 100=extraversion) based on self-referential vs outward patterns. intuition: 0-100 (0=sensing, 100=intuition) based on abstract vs concrete language. feeling: 0-100 (0=thinking, 100=feeling) based on analytical vs emotional tone. perceiving: 0-100 (0=judging, 100=perceiving) based on structured vs open-ended expression. type: the 4-letter MBTI type. Include an explanation sentence.
- moral_foundations: Score which moral values the writing emphasizes. Each 0-1: care, fairness, loyalty, authority, sanctity, liberty. Include an explanation sentence.
- quotes: Select exactly 5 quotes from real, well-known authors that directly address the emotional and thematic content of this writing. Each with "text" and "author" fields.
- recommended_reading: Recommend exactly 3 books that connect to the writing's themes. Each with "title", "author", and "reason" (1 sentence connecting the book to this specific writing).

Respond ONLY with valid JSON:
{"emotions":{"emotion_name":0.0},"dimensions":{"focus":N,"calm":N,"discipline":N,"health":N,"social":N,"creativity":N,"exploration":N,"ambition":N},"archetype_lean":"...","narrative":"...","nudges":{"focus":N,"calm":N,"discipline":N,"health":N,"social":N,"creativity":N,"exploration":N,"ambition":N},"word_themes":["..."],"mirror_moment":{"line":"exact line from writing","interpretation":"2-3 sentence reflection"},"political_compass":{"economic":0.0,"social":0.0,"explanation":"..."},"mbti":{"extraversion":50,"intuition":50,"feeling":50,"perceiving":50,"type":"XXXX","explanation":"..."},"moral_foundations":{"care":0.0,"fairness":0.0,"loyalty":0.0,"authority":0.0,"sanctity":0.0,"liberty":0.0,"explanation":"..."},"quotes":[{"text":"...","author":"..."}],"recommended_reading":[{"title":"...","author":"...","reason":"..."}]}`
        }],
      });

      const responseText = message.content[0].type === "text" ? message.content[0].text : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(500).json({ error: "Could not parse LLM response" });
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Save to database with user_id
      const writing = storage.createWriting({
        timestamp: new Date().toISOString(),
        title: title || null,
        content,
        date_written: dateWritten || null,
        analysis: JSON.stringify({
          emotions: parsed.emotions,
          dimensions: parsed.dimensions,
          archetype_lean: parsed.archetype_lean,
          narrative: parsed.narrative,
          word_themes: parsed.word_themes,
          mirror_moment: parsed.mirror_moment || null,
          political_compass: parsed.political_compass || null,
          mbti: parsed.mbti || null,
          moral_foundations: parsed.moral_foundations || null,
          quotes: parsed.quotes || null,
          recommended_reading: parsed.recommended_reading || null,
        }),
        nudges: JSON.stringify(parsed.nudges || {}),
        user_id: userId,
      });

      return res.json({
        ...parsed,
        id: writing.id,
      });
    } catch (err: any) {
      console.error("Writing analyze error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/writings — list recent writings
  app.get("/api/writings", async (req, res) => {
    try {
      const userId = getUserId(req);
      const result = storage.getWritings(50, userId);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/writing/nudges — aggregate nudges from writings in last 7 days
  app.get("/api/writing/nudges", async (req, res) => {
    try {
      const userId = getUserId(req);
      const allWritings = storage.getWritings(100, userId);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const recentWritings = allWritings.filter(w => w.timestamp >= sevenDaysAgo && w.nudges);

      if (recentWritings.length === 0) {
        return res.json({ nudges: {}, count: 0, summary: "" });
      }

      const totals: Record<string, number> = {};
      let count = 0;
      for (const w of recentWritings) {
        try {
          const nudges = JSON.parse(w.nudges!);
          for (const [k, v] of Object.entries(nudges)) {
            if (typeof v === "number") {
              totals[k] = (totals[k] || 0) + v;
            }
          }
          count++;
        } catch { /* skip bad records */ }
      }

      const averaged: Record<string, number> = {};
      for (const [k, v] of Object.entries(totals)) {
        averaged[k] = Math.round(v / count);
      }

      const latestAnalysis = recentWritings[0].analysis;
      let archetype = "";
      try {
        const a = JSON.parse(latestAnalysis!);
        archetype = a.archetype_lean || "";
      } catch { /* skip */ }

      const summary = `${count} writing${count > 1 ? "s" : ""} analyzed${archetype ? ` · leaning ${archetype}` : ""}`;

      return res.json({ nudges: averaged, count, summary });
    } catch (err: any) {
      console.error("Writing nudges error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/checkins — list recent checkins
  app.get("/api/checkins", async (req, res) => {
    try {
      const userId = getUserId(req);
      const result = storage.getCheckins(userId);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/checkins — save a checkin
  app.post("/api/checkins", async (req, res) => {
    try {
      const userId = getUserId(req);
      const checkin = storage.createCheckin({ ...req.body, user_id: userId });
      return res.json(checkin);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/decisions — list recent decisions
  app.get("/api/decisions", async (req, res) => {
    try {
      const userId = getUserId(req);
      const result = storage.getDecisions(userId);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/decisions — save a decision
  app.post("/api/decisions", async (req, res) => {
    try {
      const userId = getUserId(req);
      const decision = storage.createDecision({ ...req.body, user_id: userId });
      return res.json(decision);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ===================== SPOTIFY DASHBOARD ROUTES =====================

  // GET /api/spotify/now — fetch currently playing + recently played + log to history
  app.get("/api/spotify/now", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.json({ connected: false, playing: false, logged: false });
      }

      const accessToken = await getValidToken(userId);
      if (!accessToken) {
        return res.json({ connected: false, playing: false, logged: false });
      }

      // Fetch currently playing
      let trackName = "";
      let artistName = "";
      let trackId = "";
      let albumName: string | null = null;
      let albumArtUrl: string | null = null;
      let durationMs: number | null = null;
      let playing = false;

      try {
        const nowPlaying = await spotifyApi(accessToken, "/me/player/currently-playing");
        if (nowPlaying?.item?.id) {
          const item = nowPlaying.item;
          trackName = item.name || "Unknown";
          artistName = item.artists?.[0]?.name || "Unknown";
          trackId = item.id;
          albumName = item.album?.name || null;
          albumArtUrl = item.album?.images?.[0]?.url || null;
          durationMs = item.duration_ms || null;
          playing = true;
        }
      } catch (e: any) {
        if (e.message !== "TOKEN_EXPIRED") console.error("Currently playing error:", e);
      }

      // Fetch recently played and log them
      let recentTracks: any[] = [];
      try {
        const recent = await spotifyApi(accessToken, "/me/player/recently-played?limit=50");
        if (recent?.items) {
          recentTracks = recent.items;
        }
      } catch (e: any) {
        console.error("Recently played error:", e);
      }

      // Collect all track IDs for batch audio features
      const allTrackIds: string[] = [];
      if (trackId) allTrackIds.push(trackId);
      for (const item of recentTracks) {
        const tid = item.track?.id;
        if (tid && !allTrackIds.includes(tid)) {
          allTrackIds.push(tid);
        }
      }

      // Batch fetch audio features
      const audioFeaturesMap: Map<string, any> = new Map();
      if (allTrackIds.length > 0) {
        try {
          for (let i = 0; i < allTrackIds.length; i += 100) {
            const chunk = allTrackIds.slice(i, i + 100);
            const featuresResult = await spotifyApi(accessToken, `/audio-features?ids=${chunk.join(",")}`);
            if (featuresResult?.audio_features) {
              for (const feat of featuresResult.audio_features) {
                if (feat && feat.id) {
                  audioFeaturesMap.set(feat.id, feat);
                }
              }
            }
          }
        } catch (e) {
          console.error("Batch audio features error:", e);
        }
      }

      const audioFeatures = trackId ? audioFeaturesMap.get(trackId) || null : null;

      // Log current track
      let logged = false;
      if (playing && trackId) {
        try {
          const listenData: any = {
            user_id: userId,
            timestamp: new Date().toISOString(),
            track_id: trackId,
            track_name: trackName,
            artist_name: artistName,
            album_name: albumName,
            album_art_url: albumArtUrl,
            duration_ms: durationMs,
          };
          if (audioFeatures) {
            listenData.energy = Math.round((audioFeatures.energy || 0) * 100);
            listenData.valence = Math.round((audioFeatures.valence || 0) * 100);
            listenData.danceability = Math.round((audioFeatures.danceability || 0) * 100);
            listenData.acousticness = Math.round((audioFeatures.acousticness || 0) * 100);
            listenData.instrumentalness = Math.round((audioFeatures.instrumentalness || 0) * 100);
            listenData.tempo = Math.round(audioFeatures.tempo || 0);
          }
          const result = storage.logSpotifyListen(listenData);
          logged = result !== null;
        } catch (e) {
          console.error("Failed to log listen:", e);
        }
      }

      // Log recently played tracks
      for (const item of recentTracks) {
        const track = item.track;
        if (!track?.id) continue;
        const features = audioFeaturesMap.get(track.id);
        const albumImages = track.album?.images || [];
        try {
          storage.logSpotifyListen({
            user_id: userId,
            timestamp: item.played_at || new Date().toISOString(),
            track_id: track.id,
            track_name: track.name || "Unknown",
            artist_name: track.artists?.[0]?.name || "Unknown",
            album_name: track.album?.name || null,
            album_art_url: albumImages[0]?.url || null,
            duration_ms: track.duration_ms || null,
            energy: features ? Math.round((features.energy || 0) * 100) : null,
            valence: features ? Math.round((features.valence || 0) * 100) : null,
            danceability: features ? Math.round((features.danceability || 0) * 100) : null,
            acousticness: features ? Math.round((features.acousticness || 0) * 100) : null,
            instrumentalness: features ? Math.round((features.instrumentalness || 0) * 100) : null,
            tempo: features ? Math.round(features.tempo || 0) : null,
          });
        } catch (e) { /* dedup or error, skip */ }
      }

      // Compute nudges
      const nudges: Record<string, number> = {};
      if (audioFeatures) {
        const { energy = 0.5, valence = 0.5, danceability = 0.5, acousticness = 0.3, instrumentalness = 0 } = audioFeatures;
        if (energy > 0.75) { nudges.ambition = (nudges.ambition || 0) + 10; nudges.health = (nudges.health || 0) + 6; }
        if (energy < 0.3) { nudges.calm = (nudges.calm || 0) + 10; nudges.focus = (nudges.focus || 0) + 6; }
        if (valence > 0.7) { nudges.social = (nudges.social || 0) + 8; nudges.exploration = (nudges.exploration || 0) + 5; }
        if (valence < 0.3) { nudges.creativity = (nudges.creativity || 0) + 10; nudges.calm = (nudges.calm || 0) - 5; }
        if (danceability > 0.75) { nudges.social = (nudges.social || 0) + 6; nudges.exploration = (nudges.exploration || 0) + 4; }
        if (acousticness > 0.65) { nudges.calm = (nudges.calm || 0) + 6; nudges.focus = (nudges.focus || 0) + 4; }
        if (instrumentalness > 0.5) { nudges.focus = (nudges.focus || 0) + 10; nudges.creativity = (nudges.creativity || 0) + 5; nudges.discipline = (nudges.discipline || 0) + 5; }
        for (const key of Object.keys(nudges)) {
          nudges[key] = clamp(nudges[key], -15, 15);
        }
      }

      return res.json({
        connected: true,
        playing,
        track: playing ? {
          name: trackName,
          artist: artistName,
          id: trackId,
          album: albumName,
          albumArt: albumArtUrl,
          durationMs,
        } : null,
        audioFeatures: audioFeatures ? {
          energy: Math.round((audioFeatures.energy || 0) * 100),
          valence: Math.round((audioFeatures.valence || 0) * 100),
          danceability: Math.round((audioFeatures.danceability || 0) * 100),
          acousticness: Math.round((audioFeatures.acousticness || 0) * 100),
          instrumentalness: Math.round((audioFeatures.instrumentalness || 0) * 100),
          tempo: Math.round(audioFeatures.tempo || 0),
        } : null,
        nudges,
        logged,
        summary: playing ? `Listening to "${trackName}" by ${artistName}` : "",
      });
    } catch (err: any) {
      console.error("Spotify /now error:", err);
      return res.json({ connected: false, playing: false, logged: false, error: err.message });
    }
  });

  // GET /api/spotify/history — get listening history (reads from local DB)
  app.get("/api/spotify/history", async (req, res) => {
    try {
      const userId = getUserId(req);
      const days = parseInt(req.query.days as string) || 7;

      const listens = storage.getSpotifyListens(userId, 200);
      const stats = storage.getSpotifyStats(userId);
      const byDay = storage.getSpotifyListensByDay(userId, days);

      return res.json({ listens, stats, byDay });
    } catch (err: any) {
      console.error("Spotify history error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
