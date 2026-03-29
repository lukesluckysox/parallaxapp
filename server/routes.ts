import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import { DIMENSIONS } from "@shared/archetypes";
import bcrypt from "bcryptjs";
import { getAuthUrl, exchangeCode, refreshAccessToken, spotifyApi } from "./spotify-auth";
import jwt from "jsonwebtoken";
import type { InsertIdentityMode } from "@shared/schema";

const JWT_SECRET = process.env.JWT_SECRET || "parallax-dev-secret-change-in-production";

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
  // Try Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: number };
      return decoded.userId;
    } catch {
      return null;
    }
  }
  // Fallback to X-User-Id for backward compat during transition
  const id = req.headers["x-user-id"];
  if (id) return parseInt(id as string, 10) || null;
  return null;
}

function getUserTimezone(req: Request): string {
  const tz = req.headers["x-timezone"] as string;
  // Validate it's a real timezone
  if (tz) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return tz;
    } catch { /* invalid timezone */ }
  }
  return "UTC";
}

function formatTimestampLocal(isoTimestamp: string, tz: string): string {
  const d = new Date(isoTimestamp);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: tz });
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

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      return res.json({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        token,
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

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      return res.json({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        token,
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

      // 5. Skip logging from this route — /api/spotify/now handles logging
      // This route is for nudge computation only

      // 6. Skip logging recently played from this route — /api/spotify/now handles it
      // This route only computes nudges from whatever is already in the DB

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
        model: "claude-sonnet-4-20250514",
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
        model: "claude-sonnet-4-20250514",
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

      // Check cache first
      if (userId) {
        const cached = storage.getCachedResponse(userId, "mythology", 60);
        if (cached) {
          try { return res.json(JSON.parse(cached)); } catch {}
        }
      }

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
        model: "claude-sonnet-4-20250514",
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
      if (userId) {
        storage.setCachedResponse(userId, "mythology", JSON.stringify(parsed));
      }
      return res.json(parsed);
    } catch (err: any) {
      console.error("Mythology error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Helper: call LLM and parse JSON with retry
  async function callAndParseJSON(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<any> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const raw = message.content[0].type === "text" ? message.content[0].text : "";
      let text = raw.trim();
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error(`LLM JSON parse: no JSON (attempt ${attempt + 1}). First 200:`, raw.slice(0, 200));
        continue;
      }
      try {
        return JSON.parse(match[0]);
      } catch {
        let fixed = match[0]
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]")
          .replace(/(["'])\s*\n\s*/g, "$1 ");
        try {
          return JSON.parse(fixed);
        } catch {
          console.error(`LLM JSON parse: failed (attempt ${attempt + 1}). First 300:`, match[0].slice(0, 300));
          continue;
        }
      }
    }
    return null;
  }

  const SYSTEM_JSON = "You are a literary psychologist. You MUST respond with ONLY valid JSON. No markdown, no code fences, no explanation, no text outside the JSON object.";

  // POST /api/writing/analyze — save immediately, analyze in background
  app.post("/api/writing/analyze", async (req, res) => {
    try {
      const { content, title, dateWritten, tiers } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "content is required" });
      }

      if (!anthropic) {
        return res.status(503).json({ error: "LLM service unavailable. Check ANTHROPIC_API_KEY." });
      }

      const userId = getUserId(req);

      // Save writing immediately with pending status
      const writing = storage.createWriting({
        timestamp: new Date().toISOString(),
        title: title || null,
        content,
        date_written: dateWritten || null,
        analysis: null,
        nudges: null,
        user_id: userId,
        status: "pending",
      });

      // Return immediately
      res.json({ id: writing.id, status: "pending" });

      // Process in background
      (async () => {
        try {
          const titleStr = title ? `\nTitle: "${title}"` : "";
          const dateStr = dateWritten ? `\nDate written: ${dateWritten}` : "";
          const writingExcerpt = content.length > 4000 ? content.slice(0, 4000) + "\n[truncated]" : content;
          const writingBlock = `${titleStr}${dateStr}\n\n"""\n${writingExcerpt}\n"""`;

          const requestedTiers: string[] = Array.isArray(tiers) && tiers.length > 0 ? tiers : ["primary", "secondary"];
          const doPrimary = requestedTiers.includes("primary");
          const doSecondary = requestedTiers.includes("secondary");
          const doDeep = requestedTiers.includes("deep");

          let merged: any = {};

          if (doPrimary) {
            const result = await callAndParseJSON(
              SYSTEM_JSON,
              `Analyze this writing:${writingBlock}\n\nReturn JSON with these exact keys:\n- emotions: object of emotion names to 0-1 intensity (3-6 emotions)\n- archetype_lean: one of "observer", "builder", "explorer", "dissenter", "seeker"\n- narrative: 2-3 sentence reading of what this reveals about the author\n- mirror_moment: {"line": "exact verbatim line from the writing", "interpretation": "2-3 sentence reflection"}\n- word_themes: array of 3-5 thematic words`,
              2000
            );
            if (result) merged = { ...merged, ...result };
          }

          if (doSecondary) {
            const result = await callAndParseJSON(
              SYSTEM_JSON,
              `Analyze this writing:${writingBlock}\n\nReturn JSON with these exact keys:\n- dimensions: {focus, calm, discipline, health, social, creativity, exploration, ambition} each 0-100\n- nudges: {focus, calm, discipline, health, social, creativity, exploration, ambition} each -15 to +15\n- quotes: array of 5 objects {"text": "quote", "author": "name"} from real well-known authors relevant to this writing\n- recommended_reading: array of 3 objects {"title": "book", "author": "name", "reason": "one sentence"}`,
              2000
            );
            if (result) merged = { ...merged, ...result };
          }

          if (doDeep) {
            const result = await callAndParseJSON(
              SYSTEM_JSON,
              `Analyze this writing:${writingBlock}\n\nReturn JSON with these exact keys:\n- political_compass: {"economic": number -10 to 10, "social": number -10 to 10, "explanation": "one sentence"}\n- mbti: {"extraversion": 0-100, "intuition": 0-100, "feeling": 0-100, "perceiving": 0-100, "type": "XXXX", "explanation": "one sentence"}\n- moral_foundations: {"care": 0-1, "fairness": 0-1, "loyalty": 0-1, "authority": 0-1, "sanctity": 0-1, "liberty": 0-1, "explanation": "one sentence"}`,
              1500
            );
            if (result) merged = { ...merged, ...result };
          }

          const hasResult = merged.narrative || merged.emotions || merged.dimensions;

          storage.updateWritingAnalysis(
            writing.id,
            JSON.stringify({
              emotions: merged.emotions || null,
              dimensions: merged.dimensions || null,
              archetype_lean: merged.archetype_lean || null,
              narrative: merged.narrative || null,
              word_themes: merged.word_themes || null,
              mirror_moment: merged.mirror_moment || null,
              political_compass: merged.political_compass || null,
              mbti: merged.mbti || null,
              moral_foundations: merged.moral_foundations || null,
              quotes: merged.quotes || null,
              recommended_reading: merged.recommended_reading || null,
            }),
            JSON.stringify(merged.nudges || {}),
            hasResult ? "complete" : "failed"
          );

          // Clear relevant caches
          if (userId) {
            storage.clearUserCache(userId, "profile");
            storage.clearUserCache(userId, "mirror-line");
          }
        } catch (err: any) {
          console.error("Background writing analysis error:", err?.message || err);
          storage.updateWritingAnalysis(writing.id, "{}", "{}", "failed");
        }
      })();
    } catch (err: any) {
      console.error("Writing analyze error:", err?.message || err);
      return res.status(500).json({ error: "Failed to save writing." });
    }
  });

  // GET /api/writing/:id/status — poll for analysis completion
  app.get("/api/writing/:id/status", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const writing = storage.getWritingById(id);
    if (!writing) return res.status(404).json({ error: "Not found" });

    const status = (writing as any).status || "complete";
    if (status === "complete" && writing.analysis) {
      try {
        const analysis = JSON.parse(writing.analysis);
        const nudges = writing.nudges ? JSON.parse(writing.nudges) : {};
        return res.json({ status: "complete", ...analysis, nudges, id: writing.id });
      } catch {
        return res.json({ status: "complete", id: writing.id });
      }
    }

    return res.json({ status, id: writing.id });
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

  // DELETE /api/writings/:id — delete a writing entry
  app.delete("/api/writings/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const id = parseInt(req.params.id, 10);
      if (!id) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const deleted = storage.deleteWriting(id, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Writing not found or not yours" });
      }
      return res.json({ success: true });
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

      // Additional nudges from personality analysis
      for (const w of recentWritings) {
        try {
          const analysis = JSON.parse(w.analysis!);

          // MBTI influence on archetype dimensions
          if (analysis.mbti) {
            const { extraversion = 50, intuition = 50, feeling = 50, perceiving = 50 } = analysis.mbti;
            // Introversion → focus, calm (Observer/Seeker signals)
            if (extraversion < 40) { averaged.focus = (averaged.focus || 0) + 3; averaged.calm = (averaged.calm || 0) + 2; }
            // Extraversion → social, exploration (Explorer/Dissenter signals)
            if (extraversion > 60) { averaged.social = (averaged.social || 0) + 3; averaged.exploration = (averaged.exploration || 0) + 2; }
            // Intuition → creativity, exploration
            if (intuition > 60) { averaged.creativity = (averaged.creativity || 0) + 3; averaged.exploration = (averaged.exploration || 0) + 2; }
            // Thinking → focus, discipline (Builder signals)
            if (feeling < 40) { averaged.focus = (averaged.focus || 0) + 2; averaged.discipline = (averaged.discipline || 0) + 3; }
            // Perceiving → exploration, creativity
            if (perceiving > 60) { averaged.exploration = (averaged.exploration || 0) + 3; averaged.creativity = (averaged.creativity || 0) + 2; }
            // Judging → discipline, ambition (Builder signals)
            if (perceiving < 40) { averaged.discipline = (averaged.discipline || 0) + 3; averaged.ambition = (averaged.ambition || 0) + 2; }
          }

          // Political compass influence
          if (analysis.political_compass) {
            const { economic = 0, social: socialAxis = 0 } = analysis.political_compass;
            // Libertarian lean → exploration, creativity (Dissenter/Explorer signals)
            if (socialAxis < -3) { averaged.exploration = (averaged.exploration || 0) + 3; averaged.creativity = (averaged.creativity || 0) + 2; }
            // Authoritarian lean → discipline, ambition (Builder signals)
            if (socialAxis > 3) { averaged.discipline = (averaged.discipline || 0) + 2; averaged.ambition = (averaged.ambition || 0) + 2; }
          }

          // Moral foundations influence
          if (analysis.moral_foundations) {
            const { care = 0, fairness = 0, liberty = 0, authority = 0 } = analysis.moral_foundations;
            // High care → social, calm (Seeker signals)
            if (care > 0.7) { averaged.social = (averaged.social || 0) + 2; averaged.calm = (averaged.calm || 0) + 2; }
            // High liberty → exploration (Dissenter signals)
            if (liberty > 0.7) { averaged.exploration = (averaged.exploration || 0) + 3; }
            // High authority → discipline (Builder signals)
            if (authority > 0.7) { averaged.discipline = (averaged.discipline || 0) + 3; }
          }
        } catch { /* skip */ }
      }

      // Re-clamp all averaged values
      for (const k of Object.keys(averaged)) {
        averaged[k] = Math.max(-15, Math.min(15, averaged[k]));
      }

      const latestAnalysis = recentWritings[0].analysis;
      let archetype = "";
      try {
        const a = JSON.parse(latestAnalysis!);
        archetype = a.archetype_lean || "";
      } catch { /* skip */ }

      let personalitySummary = "";
      // Get latest MBTI type
      const latestWithMbti = recentWritings.find(w => {
        try { return JSON.parse(w.analysis!).mbti?.type; } catch { return false; }
      });
      if (latestWithMbti) {
        try {
          const a = JSON.parse(latestWithMbti.analysis!);
          personalitySummary = ` · ${a.mbti.type}`;
        } catch {}
      }

      const summary = `${count} writing${count > 1 ? "s" : ""} analyzed${archetype ? ` · leaning ${archetype}` : ""}${personalitySummary}`;

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
      // Clear related caches so they refresh with new data
      if (userId) {
        storage.clearUserCache(userId, "mythology");
        storage.clearUserCache(userId, "forecast");
      }

      // --- Echo detection ---
      try {
        if (userId) {
          const modes = storage.getIdentityModes(userId);
          if (modes.length > 0 && req.body.self_vec) {
            const DIMS = ["focus", "calm", "discipline", "health", "social", "creativity", "exploration", "ambition"];
            const currentVec = JSON.parse(req.body.self_vec);
            const currentArr = DIMS.map(d => currentVec[d] || 50);

            // Compare against each mode centroid
            for (const mode of modes) {
              const centroid = JSON.parse(mode.centroid_vec);
              const centroidArr = DIMS.map(d => centroid[d] || 50);

              // Cosine similarity
              let dot = 0, magA = 0, magB = 0;
              for (let i = 0; i < currentArr.length; i++) {
                dot += currentArr[i] * centroidArr[i];
                magA += currentArr[i] * currentArr[i];
                magB += centroidArr[i] * centroidArr[i];
              }
              const sim = magA === 0 || magB === 0 ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB));
              const simPct = Math.round(sim * 100);

              if (simPct >= 85) {
                storage.saveIdentityEcho({
                  user_id: userId,
                  mode_id: mode.id,
                  detected_at: new Date().toISOString(),
                  similarity_score: simPct,
                  current_vec: req.body.self_vec,
                });
                break; // Only record one echo per check-in
              }
            }
          }
        }
      } catch (echoErr) {
        console.error("Echo detection error:", echoErr);
      }

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

      // Only log tracks when explicitly requested (manual refresh, not auto-query on page load)
      const shouldLog = req.query.log === "true";
      let logged = false;
      if (shouldLog && playing && trackId) {
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

      // Smart import of recently played tracks (only on manual refresh)
      if (shouldLog) {
      const existingListens = storage.getSpotifyListens(userId, 1);
      const latestTimestamp = existingListens.length > 0 ? existingListens[0].timestamp : "1970-01-01T00:00:00.000Z";

      for (const item of recentTracks) {
        const track = item.track;
        if (!track?.id || !item.played_at) continue;
        // Only import if this play happened after our last recorded entry
        if (item.played_at <= latestTimestamp) continue;
        const features = audioFeaturesMap.get(track.id);
        const albumImages = track.album?.images || [];
        try {
          storage.logSpotifyListen({
            user_id: userId,
            timestamp: item.played_at,
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
      } // end shouldLog

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

  // ===================== HELPER: gather user data context =====================

  function gatherUserContext(userId: number, tz: string = "UTC") {
    const allCheckins = storage.getCheckins(userId);
    const checkinSlice = allCheckins.slice(0, 15);
    const allWritings = storage.getWritings(15, userId);
    const spotifyListensAll = storage.getSpotifyListens(userId, 50);
    const spotifyStats = storage.getSpotifyStats(userId);

    const checkinSummary = checkinSlice.map(c => {
      return `${c.timestamp.slice(0,10)}: self=${c.self_archetype}, data=${c.data_archetype || "n/a"}, feeling="${c.feeling_text || ""}"`;
    }).join("\n");

    const writingSummary = allWritings.map(w => {
      const a = w.analysis ? JSON.parse(w.analysis) : null;
      return `${w.timestamp.slice(0,10)}: "${w.title || "untitled"}" - archetype=${a?.archetype_lean || "?"}, mbti=${a?.mbti?.type || "?"}, themes=${a?.word_themes?.join(",") || "?"}, emotions=${a?.emotions ? JSON.stringify(a.emotions) : "?"}${a?.political_compass ? `, compass=${JSON.stringify(a.political_compass)}` : ""}`;
    }).join("\n");

    const musicSummary = `${spotifyStats.totalTracks} tracks, avg energy ${spotifyStats.avgEnergy}%, avg valence ${spotifyStats.avgValence}%, avg danceability ${spotifyStats.avgDanceability}%, top artists: ${spotifyStats.topArtists.map((a: any) => `${a.name} (${a.count})`).join(", ")}`;

    // Temporal patterns: timestamps of listening — converted to user's local timezone
    const listenTimestamps = spotifyListensAll.slice(0, 30).map(t => {
      return `${t.track_name} by ${t.artist_name} at ${formatTimestampLocal(t.timestamp, tz)} (energy:${t.energy}, valence:${t.valence}, dance:${t.danceability}, acoustic:${t.acousticness})`;
    }).join("\n");

    // Archetype timeline for state transitions
    const archetypeTimeline = checkinSlice.map(c =>
      `${c.timestamp.slice(0,10)}: self=${c.self_archetype}, data=${c.data_archetype || "n/a"}`
    ).join("\n");

    // Writing volume / frequency
    const writingDates = allWritings.map(w => w.timestamp.slice(0,10));
    const uniqueWritingDays = [...new Set(writingDates)].length;
    const writingVolume = allWritings.reduce((sum, w) => sum + (w.content?.length || 0), 0);

    const hasData = checkinSlice.length > 0 || allWritings.length > 0 || spotifyListensAll.length > 0;

    return {
      allCheckins, checkinSlice, allWritings, spotifyListensAll, spotifyStats,
      checkinSummary, writingSummary, musicSummary, listenTimestamps,
      archetypeTimeline, uniqueWritingDays, writingVolume, hasData
    };
  }

  // ===================== PROFILE (VARIANT + IDENTITY ENGINE) =====================

  app.get("/api/profile", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ variant: null });

    // Check cache first
    const cachedProfile = storage.getCachedResponse(userId, "profile", 120);
    if (cachedProfile) {
      try { return res.json(JSON.parse(cachedProfile)); } catch {}
    }

    const tz = getUserTimezone(req);
    const ctx = gatherUserContext(userId, tz);
    if (!ctx.hasData) return res.json({ variant: null, hasData: false });

    if (!anthropic) return res.json({ variant: null, error: "LLM unavailable" });

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: `You are the Parallax identity engine. The 5 base archetypes are Observer, Builder, Explorer, Dissenter, and Seeker. Your job is to derive an EMERGENT VARIANT — a unique, evocative identity pattern that goes beyond the base archetypes.

Variants are NOT limited to the 5 base archetypes. They are synthesized FROM the user's actual behavioral data. Think of archetypes as primary colors — variants are the infinite shades mixed from them.

Examples of variants (for inspiration, never copy these exactly):
- "The Night Cartographer" — an Explorer who maps through late-night writing and solo music discovery
- "The Quiet Architect" — a Builder who constructs internally through reflection rather than external output
- "The Emotional Seismologist" — an Observer who detects emotional patterns before they surface consciously
- "The Reluctant Oracle" — a Seeker who discovers truth through resistance rather than pursuit
- "The Signal Drifter" — an Explorer-Observer hybrid who follows data patterns like a current

User data:

CHECK-INS:
${ctx.checkinSummary || "No check-ins yet"}

WRITING ANALYSIS:
${ctx.writingSummary || "No writings yet"}

MUSIC PATTERNS:
${ctx.musicSummary || "No music data"}

LISTENING TIMESTAMPS & FEATURES:
${ctx.listenTimestamps || "None"}

WRITING VOLUME: ${ctx.writingVolume} chars across ${ctx.uniqueWritingDays} unique days

Based on ALL available signals, synthesize:

1. A VARIANT NAME — 2-4 word evocative title ("The [Adjective] [Noun]"). Must feel personal and specific, not generic.
2. The PRIMARY ARCHETYPE it derives from (one of the 5 base)
3. A SECONDARY ARCHETYPE influence (if any)
4. 3-4 EXPLORATION CHANNELS — specific ways this user explores (e.g., "music discovery", "late-night writing", "solo exercise")
5. 4-6 EMERGENT TRAITS — short behavioral labels derived from data (e.g., "Night Thinker", "Creative After Movement", "Solitary Processor", "Pattern Sensitive")
6. A 2-3 sentence DESCRIPTION of this variant — what makes it unique, how it manifests

Return ONLY valid JSON:
{
  "variant_name": "The Night Cartographer",
  "primary_archetype": "explorer",
  "secondary_archetype": "observer",
  "exploration_channels": ["music discovery", "late-night writing", "solo exercise"],
  "emergent_traits": ["Night Thinker", "Creative After Movement", "Solitary Processor", "Pattern Sensitive"],
  "description": "You explore primarily through solitary, late-night channels..."
}`
        }],
      });

      const text = message.content[0].type === "text" ? message.content[0].text : "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return res.json({ variant: null, hasData: true });
      const parsed = JSON.parse(match[0]);
      const profileResponseData = { variant: parsed, hasData: true };
      storage.setCachedResponse(userId, "profile", JSON.stringify(profileResponseData));
      return res.json(profileResponseData);
    } catch (err: any) {
      console.error("Profile variant error:", err);
      return res.json({ variant: null, hasData: true, error: err.message });
    }
  });

  // ===================== DISCOVER (INSIGHT ENGINE) =====================

  app.get("/api/discover", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ insights: [] });

    // Check cache first (skip if force=true)
    if (req.query.force !== "true") {
      const cached = storage.getCachedResponse(userId, "discover", 60);
      if (cached) {
        try { return res.json(JSON.parse(cached)); } catch {}
      }
    }

    const tz = getUserTimezone(req);
    const ctx = gatherUserContext(userId, tz);
    if (!ctx.hasData) return res.json({ insights: [], hasData: false });

    if (!anthropic) return res.json({ insights: [], error: "LLM unavailable" });

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        messages: [{
          role: "user",
          content: `You are the Parallax insight engine — a personal pattern recognition system for the psyche. You analyze behavioral data to reveal hidden patterns, identity signals, and psychological blind spots.

The 5 base archetypes are Observer, Builder, Explorer, Dissenter, and Seeker.

User data:

CHECK-INS (self-report + data-driven archetype):
${ctx.checkinSummary || "No check-ins yet"}

ARCHETYPE TIMELINE:
${ctx.archetypeTimeline || "No timeline"}

WRITING ANALYSIS (Inner Mirror):
${ctx.writingSummary || "No writings yet"}

MUSIC PATTERNS:
${ctx.musicSummary || "No music data"}

LISTENING TIMESTAMPS & FEATURES:
${ctx.listenTimestamps || "None"}

WRITING VOLUME: ${ctx.writingVolume} chars across ${ctx.uniqueWritingDays} unique days

Generate exactly 7 insights. Each MUST be a different type. Types:

1. "observation" — A pattern connecting multiple data sources. Thoughtful, slightly poetic.
2. "blind_spot" — A contradiction between self-perception and behavioral data.
3. "creative_signal" — Conditions that correlate with the user's most expressive output.
4. "trajectory" — Direction current patterns suggest, framed as identity progression.
5. "emotional_anomaly" — When emotional tone diverges from normal signals. Detect contradictions (e.g., writing becomes more reflective while music gets more energetic). Include bullet points of specific signal observations.
6. "creative_surge" — When creative output spikes relative to baseline. Note the conditions (later sleep, more instrumental music, reduced social activity, etc.).
7. "state_transition" — When archetype modes shift rapidly. Note which archetypes shifted and what this consolidation/expansion might mean.

For types 5-7, use this format in the body:
- Start with a bold signal statement
- Follow with bullet points of specific observations (use • character)
- End with a "Possible interpretation:" line

Return ONLY valid JSON:
{
  "insights": [
    { "type": "observation", "title": "...", "body": "..." },
    { "type": "blind_spot", "title": "...", "body": "..." },
    { "type": "creative_signal", "title": "...", "body": "..." },
    { "type": "trajectory", "title": "...", "body": "..." },
    { "type": "emotional_anomaly", "title": "Signal Deviation Detected", "body": "Your recent writing tone is significantly more reflective than your usual baseline.\n\nHowever:\n• music selection became more energetic\n• activity levels increased\n\nPossible interpretation: You may be processing something internally while maintaining external momentum." },
    { "type": "creative_surge", "title": "Creative Surge", "body": "Your writing volume increased significantly this period.\n\nCommon conditions during these periods:\n• later activity schedule\n• more instrumental music\n• reduced social signals\n\nThis pattern has preceded your most reflective sessions." },
    { "type": "state_transition", "title": "Rapid Mode Shift", "body": "Explorer mode dropped sharply while Builder mode increased.\n\nThis shift often occurs when you begin consolidating ideas after periods of discovery." }
  ]
}`
        }],
      });

      const text = message.content[0].type === "text" ? message.content[0].text : "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return res.json({ insights: [], hasData: true });
      const parsed = JSON.parse(match[0]);
      const discoverResponseData = { ...parsed, hasData: true };
      storage.setCachedResponse(userId, "discover", JSON.stringify(discoverResponseData));
      return res.json(discoverResponseData);
    } catch (err) {
      console.error("Discover error:", err);
      return res.json({ insights: [], hasData: true, error: "Could not generate insights" });
    }
  });

  // ===================== SIGNAL FORECAST =====================

  app.get("/api/forecast", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ forecast: null });

    // Check cache first
    const cachedForecast = storage.getCachedResponse(userId, "forecast", 30);
    if (cachedForecast) {
      try { return res.json(JSON.parse(cachedForecast)); } catch {}
    }

    const tz = getUserTimezone(req);
    const ctx = gatherUserContext(userId, tz);
    if (!ctx.hasData) return res.json({ forecast: null, hasData: false });

    if (!anthropic) return res.json({ forecast: null, error: "LLM unavailable" });

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `You are the Parallax signal forecast engine. Based on the user's recent behavioral data, generate a "Today's Signal Forecast" — a prediction of what kind of day this is shaping up to be, what modes are rising/falling, and what activities are likely to be most productive.

The 5 archetypes are: Observer (understanding), Builder (structure), Explorer (novelty), Dissenter (autonomy), Seeker (meaning).

User data:

CHECK-INS (recent):
${ctx.checkinSummary || "No check-ins"}

MUSIC (recent):
${ctx.musicSummary || "No music data"}
${ctx.listenTimestamps ? `\nRecent listening:\n${ctx.listenTimestamps}` : ""}

WRITING:
${ctx.writingSummary || "No writings"}
Volume: ${ctx.writingVolume} chars across ${ctx.uniqueWritingDays} days

Based on current patterns, generate:

1. archetype_signals: For each of the 5 archetypes, assign a signal level: "rising", "elevated", "stable", "low", or "dormant". Based on recent trajectory.
2. dominant_mode: Which archetype is strongest right now (key name)
3. good_conditions: An array of 3-5 activities the user is well-positioned for today based on their current signals (e.g., "writing", "planning", "solo work", "creative exploration", "structured tasks", "social connection", "deep reading", "physical activity")
4. forecast_narrative: 1-2 sentence poetic forecast of the day's energy
5. operating_rules: 2-3 "personal operating rules" — behavioral sequences that tend to produce good outcomes for this user based on their data. Format: "[trigger] → [action] → [result]". Example: "Exercise → instrumental music → deep writing (appears in 70%+ of high-quality sessions)"
6. rare_pattern: If there's an unusual or uncommon behavioral combination detected, describe it in 1-2 sentences. If nothing unusual, set to null.

Return ONLY valid JSON:
{
  "archetype_signals": {
    "observer": "stable",
    "builder": "rising",
    "explorer": "elevated",
    "dissenter": "low",
    "seeker": "dormant"
  },
  "dominant_mode": "explorer",
  "good_conditions": ["writing", "planning", "solo work"],
  "forecast_narrative": "Explorer energy is elevated today...",
  "operating_rules": [
    "Exercise → instrumental music → writing (appears in your most reflective sessions)",
    "Late-night solitude → creative surge → pattern-sensitive output"
  ],
  "rare_pattern": "High writing complexity during reduced music listening — an uncommon combination for you that often precedes breakthrough insights."
}`
        }],
      });

      const text = message.content[0].type === "text" ? message.content[0].text : "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return res.json({ forecast: null, hasData: true });
      const parsed = JSON.parse(match[0]);
      const forecastResponseData = { forecast: parsed, hasData: true };
      storage.setCachedResponse(userId, "forecast", JSON.stringify(forecastResponseData));
      return res.json(forecastResponseData);
    } catch (err: any) {
      console.error("Forecast error:", err);
      return res.json({ forecast: null, hasData: true, error: err.message });
    }
  });

  // ===================== IDENTITY TIMELINE =====================

  app.get("/api/timeline", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ events: [] });

    // Build timeline from actual data events
    const allCheckins = storage.getCheckins(userId);
    const allWritings = storage.getWritings(50, userId);
    const spotifyListens = storage.getSpotifyListens(userId, 200);

    type TimelineEvent = {
      date: string;
      type: "checkin" | "writing" | "creative_surge" | "state_transition" | "archetype_shift" | "music_milestone";
      title: string;
      detail: string;
      archetype?: string;
    };

    const events: TimelineEvent[] = [];

    // Add check-in events — detect archetype shifts
    let prevArchetype: string | null = null;
    for (const c of [...allCheckins].reverse()) {
      const arch = c.self_archetype;
      if (prevArchetype && arch !== prevArchetype) {
        const archDef = ARCHETYPE_MAP[arch];
        events.push({
          date: c.timestamp.slice(0, 10),
          type: "state_transition",
          title: `${ARCHETYPE_MAP[prevArchetype]?.name || prevArchetype} → ${archDef?.name || arch}`,
          detail: `Shifted from ${prevArchetype} to ${arch} mode`,
          archetype: arch,
        });
      }
      prevArchetype = arch;
    }

    // Add writing events — detect surges (multiple writings in short periods)
    const writingByDate: Record<string, number> = {};
    for (const w of allWritings) {
      const date = w.timestamp.slice(0, 10);
      writingByDate[date] = (writingByDate[date] || 0) + 1;
    }
    for (const [date, count] of Object.entries(writingByDate)) {
      if (count >= 2) {
        events.push({
          date,
          type: "creative_surge",
          title: "Creative Surge",
          detail: `${count} writings submitted in a single day`,
        });
      }
    }

    // Add significant writing analysis events
    for (const w of allWritings) {
      const analysis = w.analysis ? JSON.parse(w.analysis) : null;
      if (analysis?.archetype_lean) {
        events.push({
          date: w.timestamp.slice(0, 10),
          type: "writing",
          title: `${analysis.archetype_lean.charAt(0).toUpperCase() + analysis.archetype_lean.slice(1)} Writing`,
          detail: analysis.narrative || `"${w.title || 'Untitled'}" analyzed`,
          archetype: analysis.archetype_lean,
        });
      }
    }

    // Add music milestones (first listen, every 25th track)
    const sortedListens = [...spotifyListens].reverse();
    if (sortedListens.length > 0) {
      events.push({
        date: sortedListens[0].timestamp.slice(0, 10),
        type: "music_milestone",
        title: "First Track Logged",
        detail: `"${sortedListens[0].track_name}" by ${sortedListens[0].artist_name}`,
      });
    }
    for (let i = 24; i < sortedListens.length; i += 25) {
      events.push({
        date: sortedListens[i].timestamp.slice(0, 10),
        type: "music_milestone",
        title: `${i + 1} Tracks Logged`,
        detail: `Milestone: ${i + 1} tracks in your sonic profile`,
      });
    }

    // Add identity echo events
    const echoes = storage.getIdentityEchoes(userId, 20);
    const modes = storage.getIdentityModes(userId);
    const modeMap = new Map(modes.map(m => [m.id, m]));

    for (const echo of echoes) {
      const mode = modeMap.get(echo.mode_id);
      if (mode) {
        events.push({
          date: echo.detected_at.slice(0, 10),
          type: "echo" as any,
          title: `${mode.mode_name} (Echo)`,
          detail: `Identity echo detected — ${echo.similarity_score}% match with a previously observed mode`,
          archetype: mode.dominant_archetype,
        });
      }
    }

    // Sort events by date (newest first) and deduplicate
    events.sort((a, b) => b.date.localeCompare(a.date));

    // If we have enough data, ask the LLM to generate interpretive labels
    if (events.length > 0 && anthropic) {
      try {
        const eventSummary = events.slice(0, 20).map(e =>
          `${e.date}: [${e.type}] ${e.title} — ${e.detail}`
        ).join("\n");

        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{
            role: "user",
            content: `You are the Parallax timeline narrator. Given these behavioral events, identify the 5-8 most significant moments and give each a narrative phase label.

Events:
${eventSummary}

For each significant moment, provide:
- date: the event date
- type: one of "creative_surge", "state_transition", "archetype_shift", "milestone", "consolidation", "emergence"
- title: A short evocative phase name (2-4 words, e.g., "Creative Surge", "Catalyst Phase", "Architect Consolidation", "Signal Awakening")
- detail: 1 sentence about what this moment meant
- archetype: the relevant archetype key (observer/builder/explorer/dissenter/seeker) if applicable, or null

Return ONLY valid JSON:
{ "events": [ { "date": "2026-03-03", "type": "...", "title": "...", "detail": "...", "archetype": "..." } ] }`
          }],
        });

        const text = message.content[0].type === "text" ? message.content[0].text : "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          return res.json({ events: parsed.events || [], hasData: true });
        }
      } catch (err) {
        console.error("Timeline LLM error:", err);
      }
    }

    // Fallback: return raw events (limited to 15)
    return res.json({ events: events.slice(0, 15), hasData: events.length > 0 });
  });

  // ===================== PARALLAX MIRROR (one-liner synopsis) =====================

  app.get("/api/mirror-line", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ line: null });

    // Check cache first
    const cachedMirror = storage.getCachedResponse(userId, "mirror-line", 120);
    if (cachedMirror) {
      try { return res.json(JSON.parse(cachedMirror)); } catch {}
    }

    const writings = storage.getWritings(5, userId);
    if (writings.length === 0) return res.json({ line: null });

    // Find the latest mirror moment
    let mirrorLine: string | null = null;
    let mirrorInterp: string | null = null;
    let archLean: string | null = null;
    for (const w of writings) {
      if (!w.analysis) continue;
      try {
        const a = JSON.parse(w.analysis);
        if (a.mirror_moment?.line) {
          mirrorLine = a.mirror_moment.line;
          mirrorInterp = a.mirror_moment.interpretation;
          archLean = a.archetype_lean || null;
          break;
        }
      } catch {}
    }

    if (!mirrorLine) return res.json({ line: null });

    // If no LLM, return a truncated version of the interpretation
    if (!anthropic) {
      return res.json({ line: mirrorInterp?.split(".")[0] + "." || null });
    }

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        messages: [{
          role: "user",
          content: `You are the Parallax Mirror. Given this mirror moment from someone's writing, distill it into a single evocative line that feels like a personal revelation — something the user would want to screenshot and share.

Mirror moment line: "${mirrorLine}"
Interpretation: ${mirrorInterp}
Archetype lean: ${archLean || "unknown"}

Rules:
- One sentence, under 15 words
- Start with "You" 
- Should feel like someone just described you perfectly
- Poetic but grounded, not flowery
- Format: "You [verb] like someone who [insight]."

Examples:
- "You write like someone who builds their freedom in private."
- "You listen like someone preparing to leave."
- "You think in spirals, not lines."

Return ONLY the single line, no quotes, no explanation.`
        }],
      });

      const text = (message.content[0].type === "text" ? message.content[0].text : "").trim();
      // Strip any surrounding quotes
      const clean = text.replace(/^["']|["']$/g, "").trim();
      const mirrorResponseData = { line: clean || null };
      storage.setCachedResponse(userId, "mirror-line", JSON.stringify(mirrorResponseData));
      return res.json(mirrorResponseData);
    } catch (err) {
      console.error("Mirror line error:", err);
      return res.json({ line: null });
    }
  });

  // ===================== HOLISTIC OVERVIEW =====================

  app.get("/api/holistic", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ hasData: false });

    const allCheckins = storage.getCheckins(userId);
    const allWritings = storage.getWritings(50, userId);
    const spotifyListens = storage.getSpotifyListens(userId, 100);
    const spotifyStats = storage.getSpotifyStats(userId);

    const hasData = allCheckins.length > 0 || allWritings.length > 0 || spotifyListens.length > 0;
    if (!hasData) return res.json({ hasData: false });

    // Compute cumulative dimension vectors (same logic as CharacterApp)
    const selfDims: Record<string, number> = {};
    const dataDims: Record<string, number> = {};
    let selfWeight = 0;
    let dataWeight = 0;

    for (let i = 0; i < allCheckins.length; i++) {
      const c = allCheckins[i];
      const weight = 1 + (2 * i / Math.max(allCheckins.length - 1, 1));
      if (c.self_vec) {
        try {
          const sv = JSON.parse(c.self_vec);
          for (const dim of DIMENSIONS) {
            selfDims[dim] = (selfDims[dim] || 0) + (sv[dim] || 50) * weight;
          }
          selfWeight += weight;
        } catch {}
      }
      if (c.data_vec) {
        try {
          const dv = JSON.parse(c.data_vec);
          for (const dim of DIMENSIONS) {
            dataDims[dim] = (dataDims[dim] || 0) + (dv[dim] || 50) * weight;
          }
          dataWeight += weight;
        } catch {}
      }
    }

    const selfVec: Record<string, number> = {};
    const dataVec: Record<string, number> = {};
    for (const dim of DIMENSIONS) {
      selfVec[dim] = selfWeight > 0 ? Math.round((selfDims[dim] || 0) / selfWeight) : 50;
      dataVec[dim] = dataWeight > 0 ? Math.round((dataDims[dim] || 0) / dataWeight) : 50;
    }

    // Archetype distribution
    const archDist: Record<string, number> = {};
    for (const c of allCheckins) {
      archDist[c.self_archetype] = (archDist[c.self_archetype] || 0) + 1;
    }

    // Writing themes
    const allThemes: string[] = [];
    const writingArchetypes: Record<string, number> = {};
    for (const w of allWritings) {
      if (w.analysis) {
        try {
          const a = JSON.parse(w.analysis);
          if (a.word_themes) allThemes.push(...a.word_themes);
          if (a.archetype_lean) writingArchetypes[a.archetype_lean] = (writingArchetypes[a.archetype_lean] || 0) + 1;
        } catch {}
      }
    }

    // Top themes by frequency
    const themeCounts: Record<string, number> = {};
    for (const t of allThemes) {
      themeCounts[t] = (themeCounts[t] || 0) + 1;
    }
    const topThemes = Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([theme]) => theme);

    // Source activity counts
    const sources = {
      checkins: allCheckins.length,
      writings: allWritings.length,
      tracks: spotifyListens.length,
    };

    return res.json({
      hasData: true,
      selfVec,
      dataVec: dataWeight > 0 ? dataVec : null,
      archetypeDistribution: archDist,
      writingArchetypes,
      topThemes,
      sources,
      spotifyStats: {
        avgEnergy: spotifyStats.avgEnergy,
        avgValence: spotifyStats.avgValence,
        avgDanceability: spotifyStats.avgDanceability,
        topArtists: spotifyStats.topArtists.slice(0, 5),
      },
      latestArchetype: allCheckins.length > 0 ? allCheckins[0].self_archetype : null,
      latestDataArchetype: allCheckins.length > 0 ? allCheckins[0].data_archetype : null,
    });
  });

  // GET /api/spotify/patterns — mood clusters, temporal patterns, discovery ratio
  app.get("/api/spotify/patterns", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ hasData: false });

    const listens = storage.getSpotifyListens(userId, 500);
    if (listens.length === 0) return res.json({ hasData: false });

    const tz = getUserTimezone(req);

    // Mood clustering (rule-based from audio features)
    const clusters: Record<string, number> = {
      ambient: 0,
      energetic: 0,
      melancholic: 0,
      rhythmic: 0,
      acoustic: 0,
      experimental: 0,
    };
    let clusterTotal = 0;

    for (const t of listens) {
      const energy = (t.energy || 50) / 100;
      const valence = (t.valence || 50) / 100;
      const dance = (t.danceability || 50) / 100;
      const acoustic = (t.acousticness || 50) / 100;
      const instrumental = (t.instrumentalness || 0) / 100;
      const tempo = (t.tempo || 120) / 200; // normalize tempo to 0-1 range

      // Score each cluster
      clusters.ambient += acoustic * (1 - energy) * (1 - dance) * 1.5;
      clusters.energetic += energy * tempo * (1 - acoustic) * 1.5;
      clusters.melancholic += (1 - valence) * (1 - dance) * 0.7 * 1.5;
      clusters.rhythmic += dance * energy * valence * 1.5;
      clusters.acoustic += acoustic * (0.3 + valence * 0.7) * (1 - tempo * 0.5) * 1.5;
      clusters.experimental += instrumental * (1 - valence) * 1.5;
      clusterTotal++;
    }

    // Normalize to percentages
    const moodClusters: Record<string, number> = {};
    if (clusterTotal > 0) {
      const maxVal = Math.max(...Object.values(clusters));
      for (const [key, val] of Object.entries(clusters)) {
        moodClusters[key] = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
      }
    }

    // Temporal patterns: hour-of-day distribution
    const hourCounts: Record<number, { count: number; avgEnergy: number; avgValence: number }> = {};
    for (const t of listens) {
      const d = new Date(t.timestamp);
      let hour: number;
      try {
        hour = parseInt(d.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: tz }));
      } catch {
        hour = d.getUTCHours();
      }
      if (!hourCounts[hour]) hourCounts[hour] = { count: 0, avgEnergy: 0, avgValence: 0 };
      hourCounts[hour].count++;
      hourCounts[hour].avgEnergy += (t.energy || 50);
      hourCounts[hour].avgValence += (t.valence || 50);
    }
    // Average the energy/valence per hour
    const hourlyPatterns = Object.entries(hourCounts).map(([hour, data]) => ({
      hour: parseInt(hour),
      count: data.count,
      avgEnergy: Math.round(data.avgEnergy / data.count),
      avgValence: Math.round(data.avgValence / data.count),
    })).sort((a, b) => a.hour - b.hour);

    // Discovery ratio: unique tracks / total listens
    const uniqueTracks = new Set(listens.map(t => t.track_id)).size;
    const uniqueArtists = new Set(listens.map(t => t.artist_name)).size;
    const discoveryRatio = listens.length > 0 ? Math.round((uniqueTracks / listens.length) * 100) : 0;

    // Recent trend: compare last 7 days avg energy/valence to overall
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentListens = listens.filter(t => t.timestamp >= sevenDaysAgo);
    const overallAvgEnergy = listens.reduce((s, t) => s + (t.energy || 50), 0) / listens.length;
    const overallAvgValence = listens.reduce((s, t) => s + (t.valence || 50), 0) / listens.length;
    const recentAvgEnergy = recentListens.length > 0
      ? recentListens.reduce((s, t) => s + (t.energy || 50), 0) / recentListens.length
      : overallAvgEnergy;
    const recentAvgValence = recentListens.length > 0
      ? recentListens.reduce((s, t) => s + (t.valence || 50), 0) / recentListens.length
      : overallAvgValence;

    return res.json({
      hasData: true,
      moodClusters,
      hourlyPatterns,
      discoveryRatio,
      uniqueTracks,
      uniqueArtists,
      totalListens: listens.length,
      trend: {
        recentEnergy: Math.round(recentAvgEnergy),
        recentValence: Math.round(recentAvgValence),
        overallEnergy: Math.round(overallAvgEnergy),
        overallValence: Math.round(overallAvgValence),
        energyDelta: Math.round(recentAvgEnergy - overallAvgEnergy),
        valenceDelta: Math.round(recentAvgValence - overallAvgValence),
      },
    });
  });

  // ===================== IDENTITY CONSTELLATIONS =====================

  app.get("/api/constellations", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ modes: [], ready: false });

    // Check cache first (recompute every 6 hours)
    const cached = storage.getCachedResponse(userId, "constellations", 360);
    if (cached && req.query.force !== "true") {
      try { return res.json(JSON.parse(cached)); } catch {}
    }

    const allCheckins = storage.getCheckins(userId);

    // Minimum threshold: 15 check-ins over 14+ days
    if (allCheckins.length < 15) {
      return res.json({ modes: [], ready: false, reason: `Need ${15 - allCheckins.length} more check-ins` });
    }

    const dates = allCheckins.map(c => c.timestamp.slice(0, 10));
    const uniqueDays = new Set(dates).size;
    const firstDate = new Date(allCheckins[allCheckins.length - 1].timestamp);
    const daySpan = Math.floor((Date.now() - firstDate.getTime()) / (24 * 60 * 60 * 1000));

    if (daySpan < 14) {
      return res.json({ modes: [], ready: false, reason: `Need ${14 - daySpan} more days of data` });
    }

    // Parse check-in vectors
    const DIMS = ["focus", "calm", "discipline", "health", "social", "creativity", "exploration", "ambition"];
    const vectors: { id: number; vec: number[]; archetype: string; timestamp: string }[] = [];

    for (const c of allCheckins) {
      if (!c.self_vec) continue;
      try {
        const sv = JSON.parse(c.self_vec);
        const vec = DIMS.map(d => sv[d] || 50);
        vectors.push({ id: c.id, vec, archetype: c.self_archetype, timestamp: c.timestamp });
      } catch {}
    }

    if (vectors.length < 15) {
      return res.json({ modes: [], ready: false, reason: "Not enough valid check-in data" });
    }

    // Cosine similarity between two vectors
    function cosSim(a: number[], b: number[]): number {
      let dot = 0, magA = 0, magB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
      }
      return magA === 0 || magB === 0 ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB));
    }

    // Simple k-means clustering
    function kmeans(data: number[][], k: number, maxIter: number = 20): { assignments: number[]; centroids: number[][] } {
      const n = data.length;
      const dim = data[0].length;

      // Initialize centroids by picking k random data points
      const indices = Array.from({ length: n }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      let centroids = indices.slice(0, k).map(i => [...data[i]]);
      let assignments = new Array(n).fill(0);

      for (let iter = 0; iter < maxIter; iter++) {
        // Assign each point to nearest centroid
        const newAssignments = data.map(point => {
          let bestK = 0, bestSim = -1;
          for (let ki = 0; ki < k; ki++) {
            const sim = cosSim(point, centroids[ki]);
            if (sim > bestSim) { bestSim = sim; bestK = ki; }
          }
          return bestK;
        });

        // Check convergence
        const changed = newAssignments.some((a, i) => a !== assignments[i]);
        assignments = newAssignments;
        if (!changed) break;

        // Recompute centroids
        centroids = Array.from({ length: k }, () => new Array(dim).fill(0));
        const counts = new Array(k).fill(0);
        for (let i = 0; i < n; i++) {
          const cluster = assignments[i];
          counts[cluster]++;
          for (let d = 0; d < dim; d++) {
            centroids[cluster][d] += data[i][d];
          }
        }
        for (let ki = 0; ki < k; ki++) {
          if (counts[ki] > 0) {
            for (let d = 0; d < dim; d++) centroids[ki][d] /= counts[ki];
          }
        }
      }

      return { assignments, centroids };
    }

    // Try k from 3 to min(6, floor(n/3)) and pick best
    const dataVecs = vectors.map(v => v.vec);
    let bestK = 3;
    let bestResult = kmeans(dataVecs, 3);

    const maxK = Math.min(6, Math.floor(vectors.length / 3));
    for (let k = 3; k <= maxK; k++) {
      const result = kmeans(dataVecs, k);
      // Check all clusters have >= 3 members
      const clusterCounts = new Array(k).fill(0);
      result.assignments.forEach(a => clusterCounts[a]++);
      const allValid = clusterCounts.every(c => c >= 3);
      if (allValid) {
        bestK = k;
        bestResult = result;
      }
    }

    const { assignments, centroids } = bestResult;

    // Build cluster data
    interface ClusterInfo {
      centroid: number[];
      checkinIds: number[];
      archetypes: Record<string, number>;
      timestamps: string[];
      dominantArchetype: string;
    }

    const clusters: ClusterInfo[] = Array.from({ length: bestK }, () => ({
      centroid: [], checkinIds: [], archetypes: {}, timestamps: [], dominantArchetype: ""
    }));

    for (let i = 0; i < vectors.length; i++) {
      const ci = assignments[i];
      clusters[ci].checkinIds.push(vectors[i].id);
      clusters[ci].timestamps.push(vectors[i].timestamp);
      const arch = vectors[i].archetype;
      clusters[ci].archetypes[arch] = (clusters[ci].archetypes[arch] || 0) + 1;
    }

    for (let ki = 0; ki < bestK; ki++) {
      clusters[ki].centroid = centroids[ki].map(v => Math.round(v));
      // Dominant archetype
      const archEntries = Object.entries(clusters[ki].archetypes);
      archEntries.sort((a, b) => b[1] - a[1]);
      clusters[ki].dominantArchetype = archEntries[0]?.[0] || "observer";
    }

    // Filter out tiny clusters
    const validClusters = clusters.filter(c => c.checkinIds.length >= 3);

    // Name the clusters with LLM
    let modeNames: string[] = validClusters.map((c, i) => `Mode ${i + 1}`);

    if (anthropic && validClusters.length > 0) {
      try {
        const clusterDescriptions = validClusters.map((c, i) => {
          const dimVec: Record<string, number> = {};
          DIMS.forEach((d, di) => { dimVec[d] = c.centroid[di]; });
          return `Cluster ${i + 1}: dominant=${c.dominantArchetype}, dimensions=${JSON.stringify(dimVec)}, count=${c.checkinIds.length}`;
        }).join("\n");

        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          system: "You MUST respond with ONLY valid JSON. No markdown, no explanation.",
          messages: [{
            role: "user",
            content: `Name these identity mode clusters for a personal pattern recognition system. Each name should be 2-3 words, evocative, and start with an adjective. The 5 archetypes are Observer, Builder, Explorer, Dissenter, Seeker.\n\n${clusterDescriptions}\n\nReturn JSON: {"names": ["Quiet Architect", "Night Explorer", ...]}`
          }]
        });

        const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
        const match = raw.replace(/```json?\s*/i, "").replace(/```/i, "").match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed.names)) {
            modeNames = parsed.names.slice(0, validClusters.length);
          }
        }
      } catch (e) {
        console.error("Constellation naming error:", e);
      }
    }

    // Save modes to DB
    const modesToSave: InsertIdentityMode[] = validClusters.map((c, i) => {
      const dimVec: Record<string, number> = {};
      DIMS.forEach((d, di) => { dimVec[d] = c.centroid[di]; });

      // Compute archetype distribution as percentages
      const totalArch = Object.values(c.archetypes).reduce((s, v) => s + v, 0);
      const archDist: Record<string, number> = {};
      for (const [k, v] of Object.entries(c.archetypes)) {
        archDist[k] = Math.round((v / totalArch) * 100);
      }

      return {
        user_id: userId,
        mode_name: modeNames[i] || `Mode ${i + 1}`,
        centroid_vec: JSON.stringify(dimVec),
        archetype_distribution: JSON.stringify(archDist),
        dominant_archetype: c.dominantArchetype,
        conditions: null,
        first_seen: c.timestamps[c.timestamps.length - 1],
        last_seen: c.timestamps[0],
        occurrence_count: c.checkinIds.length,
        checkin_ids: JSON.stringify(c.checkinIds),
      };
    });

    storage.saveIdentityModes(userId, modesToSave);

    // Return response
    const responseData = {
      modes: modesToSave.map((m, i) => ({
        id: i + 1,
        name: m.mode_name,
        dominantArchetype: m.dominant_archetype,
        archetypeDistribution: JSON.parse(m.archetype_distribution),
        centroidVec: JSON.parse(m.centroid_vec),
        occurrenceCount: m.occurrence_count,
        firstSeen: m.first_seen,
        lastSeen: m.last_seen,
      })),
      ready: true,
      totalCheckins: allCheckins.length,
      daySpan,
    };

    storage.setCachedResponse(userId, "constellations", JSON.stringify(responseData));
    return res.json(responseData);
  });

  // ===================== IDENTITY ECHO =====================

  app.get("/api/echo", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ active: null, history: [] });

    const activeEcho = storage.getActiveEcho(userId);
    const echoHistory = storage.getIdentityEchoes(userId, 20);

    // Enrich history with mode names
    const modes = storage.getIdentityModes(userId);
    const modeMap = new Map(modes.map(m => [m.id, m]));

    const enrichedHistory = echoHistory.map(e => {
      const mode = modeMap.get(e.mode_id);
      return {
        id: e.id,
        modeName: mode?.mode_name || "Unknown Mode",
        dominantArchetype: mode?.dominant_archetype || "observer",
        similarityScore: e.similarity_score,
        detectedAt: e.detected_at,
      };
    });

    return res.json({
      active: activeEcho ? {
        modeName: activeEcho.mode_name,
        dominantArchetype: activeEcho.dominant_archetype,
        similarityScore: activeEcho.similarity_score,
        detectedAt: activeEcho.detected_at,
      } : null,
      history: enrichedHistory,
    });
  });

  return httpServer;
}
