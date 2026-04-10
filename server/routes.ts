import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage, db, sqlite } from "./storage";
import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import { DIMENSIONS, ARCHETYPE_MAP } from "@shared/archetypes";
import bcrypt from "bcryptjs";
import { getAuthUrl, exchangeCode, refreshAccessToken, spotifyApi } from "./spotify-auth";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import type { InsertIdentityMode } from "@shared/schema";
import { emitLumenEvent, classifyParallaxRecord, emitToPraxis } from "./lumenEmitter";
import { decisions as decisionsTable, checkins as checkinsTable, users as usersTable } from "@shared/schema";
import { computeMixture, topArchetype } from "@shared/archetype-math";
import { eq, and } from "drizzle-orm";

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
    } catch { /* invalid token */ }
  }
  // Try cookie
  const cookieHeader = req.headers.cookie || "";
  const tokenMatch = cookieHeader.match(/parallax_token=([^;]+)/);
  if (tokenMatch) {
    try {
      const decoded = jwt.verify(tokenMatch[1], JWT_SECRET) as { userId: number };
      return decoded.userId;
    } catch { /* invalid token */ }
  }
  // No fallback — JWT only
  return null;
}

// Fire-and-forget: emit a base Lumen event for every record, plus enriched signals
function emitForRecord(userId: number, recordId: number, record: any, recordType: string = "record") {
  try {
    const user = storage.getUserById(userId) as any;
    const lumenUserId = user?.lumen_user_id;
    if (!lumenUserId) return;

    const now = new Date().toISOString();
    const ts = record.timestamp || now;
    const description = record.label || record.title || record.description || record.content || record.feeling_text || record.decision_text || record.feeling || record.mood || record.context || "";
    const descSnippet = typeof description === "string" ? description.slice(0, 200) : "";

    // Namespace sourceRecordId by type so checkin#1 and writing#1 don't collide
    const nsRecordId = `${recordType}:${recordId}`;

    // 1. Always emit a base event so every record shows in Lumen's activity feed
    emitLumenEvent({
      userId: lumenUserId,
      sourceRecordId: nsRecordId,
      eventType: "belief_candidate",
      confidence: 0.5,
      salience: 0.5,
      payload: { description: descSnippet, createdAt: ts, historical: false },
      ingestionMode: "live",
      createdAt: now,
    }).catch(() => {});

    // 2. Emit any enriched signals from classification (pattern, discrepancy, hypothesis)
    const signals = classifyParallaxRecord(record);
    for (const signal of signals) {
      emitLumenEvent({
        userId: lumenUserId,
        sourceRecordId: nsRecordId + ":" + signal.eventType,
        eventType: signal.eventType,
        confidence: signal.confidence,
        salience: signal.salience,
        payload: { ...signal.payload, createdAt: ts, historical: false },
        ingestionMode: "live",
        createdAt: now,
      }).catch(() => {});
    }

    // 3. Direct push: hypothesis_candidates go straight to Praxis (in addition to Lumen pipeline)
    emitToPraxis(lumenUserId, record, signals);
  } catch {
    // Never throw from emitter
  }
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

  // ===================== BUILD DIAGNOSTICS =====================
  const BUILD_TIMESTAMP = new Date().toISOString();
  app.get("/api/build-info", (_req, res) => {
    res.json({
      app: "Parallax",
      version: "1.0.0-docker",
      buildTimestamp: BUILD_TIMESTAMP,
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      hasVolume: !!process.env.RAILWAY_VOLUME_MOUNT_PATH,
      lumenApiUrl: process.env.LUMEN_API_URL ? process.env.LUMEN_API_URL.replace(/\/\/(.{3}).*@/, '//$1***@') : null,
      hasLumenToken: !!process.env.LUMEN_INTERNAL_TOKEN,
      lumenTokenLen: process.env.LUMEN_INTERNAL_TOKEN?.length ?? 0,
    });
  });

  // Diagnostic: test the Lumen emitter pipeline end-to-end
  app.get("/api/diag/lumen-emit", async (_req, res) => {
    const LUMEN_API_URL = (process.env.LUMEN_API_URL || '').replace(/\/+$/, '');
    const LUMEN_INTERNAL_TOKEN = process.env.LUMEN_INTERNAL_TOKEN;

    const diag: any = {
      step1_env: {
        LUMEN_API_URL: LUMEN_API_URL || "NOT SET",
        LUMEN_INTERNAL_TOKEN_set: !!LUMEN_INTERNAL_TOKEN,
        LUMEN_INTERNAL_TOKEN_len: LUMEN_INTERNAL_TOKEN?.length ?? 0,
      },
      step2_would_emit: !!(LUMEN_API_URL && LUMEN_INTERNAL_TOKEN),
    };

    if (LUMEN_API_URL && LUMEN_INTERNAL_TOKEN) {
      // Actually try a test POST
      const testBody = {
        userId: "diag-test",
        sourceApp: "parallax",
        sourceRecordId: `diag:${Date.now()}`,
        eventType: "belief_candidate",
        confidence: 0.1,
        salience: 0.1,
        payload: { title: "[DIAGNOSTIC] Pipeline test event" },
        ingestionMode: "live",
      };
      try {
        const url = `${LUMEN_API_URL}/api/epistemic/events`;
        diag.step3_target_url = url;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-lumen-internal-token": LUMEN_INTERNAL_TOKEN,
          },
          body: JSON.stringify(testBody),
        });
        const text = await resp.text();
        diag.step4_response = { status: resp.status, body: text.slice(0, 500) };
      } catch (e: any) {
        diag.step4_response = { error: e.message };
      }
    }

    // Also check a real user's lumen_user_id
    try {
      const firstUser = sqlite.prepare("SELECT id, username, lumen_user_id FROM users LIMIT 5").all();
      diag.step5_sample_users = firstUser;
    } catch (e: any) {
      diag.step5_sample_users = { error: e.message };
    }

    res.json(diag);
  });

  // ===================== AUTH ROUTES =====================

  // POST /api/auth/register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, displayName, age, gender, location } = req.body;

      // Validate username: 3+ chars, alphanumeric + underscore
      if (!username || typeof username !== "string" || username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: "Username must be 3+ characters (letters, numbers, underscores)" });
      }

      // Validate password: 6+ chars
      if (!password || typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      // Validate registration fields
      if (!age || !gender || !location) {
        return res.status(400).json({ error: "Age, gender, and location are required" });
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
        age: age || null,
        gender: gender || null,
        location: location || null,
      });

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.cookie("parallax_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: "/",
      });
      return res.json({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        pro: false,
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
      res.cookie("parallax_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: "/",
      });
      return res.json({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        pro: !!(user as any).pro,
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
    if (!userId) return res.json(null);
    const user = storage.getUserById(userId);
    if (!user) return res.json(null);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
    return res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      calibrated: !!(user as any).calibrated,
      pro: !!(user as any).pro,
      token,
    });
  });

  // POST /api/auth/calibrate — save first-time calibration and seed initial check-in
  app.post("/api/auth/calibrate", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { choices, motivation } = req.body;
    // choices is array of 5 strings like ["freedom", "mystery", "connection", "expression", "meaning"]
    // Map word choices to archetype leanings and dimension seeds
    const dimScores: Record<string, number> = {
      focus: 50, calm: 50, agency: 50, vitality: 50,
      social: 50, creativity: 50, exploration: 50, drive: 50,
    };

    const archetypeLean: Record<string, number> = {
      observer: 0, builder: 0, explorer: 0, dissenter: 0, seeker: 0,
    };

    // Word-pair → archetype/dimension mappings
    const wordMap: Record<string, { arch: string; dims: Record<string, number> }> = {
      structure: { arch: "builder", dims: { agency: 12, focus: 8 } },
      freedom: { arch: "explorer", dims: { exploration: 12, creativity: 8 } },
      clarity: { arch: "observer", dims: { focus: 12, calm: 8 } },
      mystery: { arch: "seeker", dims: { creativity: 10, exploration: 8 } },
      solitude: { arch: "observer", dims: { calm: 10, focus: 6 } },
      connection: { arch: "builder", dims: { social: 12, vitality: 6 } },
      expression: { arch: "dissenter", dims: { creativity: 12, agency: 8 } },
      restraint: { arch: "observer", dims: { agency: 10, calm: 8 } },
      action: { arch: "builder", dims: { drive: 12, agency: 8 } },
      reflection: { arch: "seeker", dims: { calm: 10, creativity: 6 } },
    };

    if (Array.isArray(choices)) {
      for (const word of choices) {
        const mapping = wordMap[word.toLowerCase()];
        if (mapping) {
          archetypeLean[mapping.arch] = (archetypeLean[mapping.arch] || 0) + 1;
          for (const [dim, val] of Object.entries(mapping.dims)) {
            dimScores[dim] = (dimScores[dim] || 50) + val;
          }
        }
      }
    }

    // Clamp dimensions to 0-100
    for (const dim of Object.keys(dimScores)) {
      dimScores[dim] = Math.max(0, Math.min(100, dimScores[dim]));
    }

    // Determine seed archetype
    const topArch = Object.entries(archetypeLean).sort((a, b) => b[1] - a[1])[0][0];

    // Save a seed check-in
    storage.createCheckin({
      user_id: userId,
      timestamp: new Date().toISOString(),
      self_vec: JSON.stringify(dimScores),
      data_vec: null,
      self_archetype: topArch,
      data_archetype: null,
      feeling_text: "Identity calibration",
      spotify_summary: null,
      fitness_summary: null,
      llm_narrative: null,
    });

    // Mark user as calibrated
    sqlite.prepare("UPDATE users SET calibrated = 1 WHERE id = ?").run(userId);

    return res.json({
      success: true,
      seedArchetype: topArch,
      seedDimensions: dimScores,
    });
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", (req, res) => {
    res.cookie("parallax_token", "", { httpOnly: true, maxAge: 0, path: "/" });
    return res.json({ ok: true });
  });

  // GET /api/auth/sso — Lumen SSO token exchange
  // Verifies the short-lived Lumen SSO token, finds/creates the user,
  // sets a parallax_token cookie, then redirects to the app root.
  app.get("/api/auth/sso", async (req, res) => {
    const token = req.query.token as string;
    if (!token) return res.status(400).send("Missing SSO token");

    try {
      const payload = jwt.verify(token, JWT_SECRET) as {
        userId: number;
        username: string;
        email?: string;
        sso: boolean;
      };

      if (!payload.sso || !payload.username) {
        return res.status(400).send("Invalid SSO token");
      }

      // Find existing Parallax user — try username first, then email
      let user = storage.getUserByUsername(payload.username);
      if (!user) {
        // Create a shadow account — no real password needed for SSO users
        const randomHash = await bcrypt.hash(randomUUID(), 10);
        user = storage.createUser({
          username: payload.username,
          password_hash: randomHash,
          display_name: payload.username,
          created_at: new Date().toISOString(),
        });
      }

      // Store the Lumen userId for epistemic event emission
      if (payload.userId) {
        storage.setLumenUserId(user.id, String(payload.userId));
      }

      // Issue a 30-day parallax_token cookie
      const sessionToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.cookie("parallax_token", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      return res.redirect("/");
    } catch (err) {
      console.error("[sso] token verification failed:", err);
      return res.status(401).send("SSO token expired or invalid. Please return to Lumen and try again.");
    }
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

          if (avgEnergy > 0.7) { nudges.drive = (nudges.drive || 0) + 10; nudges.vitality = (nudges.vitality || 0) + 6; }
          else if (avgEnergy > 0.55) { nudges.drive = (nudges.drive || 0) + 4; }
          else if (avgEnergy < 0.3) { nudges.calm = (nudges.calm || 0) + 10; nudges.focus = (nudges.focus || 0) + 6; }

          if (avgValence > 0.7) { nudges.social = (nudges.social || 0) + 8; nudges.exploration = (nudges.exploration || 0) + 5; }
          else if (avgValence < 0.3) { nudges.creativity = (nudges.creativity || 0) + 10; nudges.calm = (nudges.calm || 0) - 5; }

          if (avgDance > 0.7) { nudges.social = (nudges.social || 0) + 6; nudges.exploration = (nudges.exploration || 0) + 4; }
          else if (avgDance < 0.3) { nudges.focus = (nudges.focus || 0) + 5; nudges.agency = (nudges.agency || 0) + 3; }

          if (avgAcoustic > 0.6) { nudges.calm = (nudges.calm || 0) + 6; nudges.focus = (nudges.focus || 0) + 4; }
          if (avgInstrumental > 0.4) { nudges.focus = (nudges.focus || 0) + 10; nudges.creativity = (nudges.creativity || 0) + 5; nudges.agency = (nudges.agency || 0) + 5; }

          if (avgTempo > 140) { nudges.drive = (nudges.drive || 0) + 4; nudges.vitality = (nudges.vitality || 0) + 3; }
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
        if (energy > 0.75) { nudges.drive = 10; nudges.vitality = 6; }
        if (energy < 0.3) { nudges.calm = 10; nudges.focus = 6; }
        if (valence > 0.7) { nudges.social = 8; nudges.exploration = 5; }
        if (valence < 0.3) { nudges.creativity = 10; nudges.calm = (nudges.calm || 0) - 5; }
        if (danceability > 0.75) { nudges.social = (nudges.social || 0) + 6; nudges.exploration = (nudges.exploration || 0) + 4; }
        if (acousticness > 0.65) { nudges.calm = (nudges.calm || 0) + 6; nudges.focus = (nudges.focus || 0) + 4; }
        if (instrumentalness > 0.5) { nudges.focus = (nudges.focus || 0) + 10; nudges.creativity = (nudges.creativity || 0) + 5; nudges.agency = 5; }
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

      if (steps > 10000) { nudges.vitality = (nudges.vitality || 0) + 10; nudges.agency = (nudges.agency || 0) + 5; }
      else if (steps > 7000) { nudges.vitality = (nudges.vitality || 0) + 5; }
      else if (steps < 3000) { nudges.vitality = (nudges.vitality || 0) - 5; }

      if (sleepHours >= 7.5) { nudges.calm = (nudges.calm || 0) + 8; nudges.focus = (nudges.focus || 0) + 6; }
      else if (sleepHours < 6) { nudges.calm = (nudges.calm || 0) - 8; nudges.focus = (nudges.focus || 0) - 5; }

      if (exerciseMinutes > 30) { nudges.vitality = (nudges.vitality || 0) + 8; nudges.drive = (nudges.drive || 0) + 5; nudges.agency = (nudges.agency || 0) + 5; }

      if (hrv > 50) { nudges.calm = (nudges.calm || 0) + 6; nudges.vitality = (nudges.vitality || 0) + 4; }
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

The 8 identity dimensions are:
- focus: mental clarity and ability to direct attention (0-100)
- calm: inner stillness, emotional regulation, groundedness (0-100)
- agency: sense of autonomy, self-determination, feeling in control of choices (0-100)
- vitality: physical and mental energy, aliveness, feeling embodied (0-100)
- social: connection to others, relational engagement, community pull (0-100)
- creativity: generative impulse, novel thinking, expressive output (0-100)
- exploration: openness to new experience, curiosity, willingness to wander (0-100)
- drive: forward momentum, internal motivation, purposeful energy (0-100)

The 5 meta-archetypes are: observer (understanding patterns), builder (creating structure), explorer (novelty and expression), dissenter (autonomy and resistance), seeker (meaning and transformation).

Respond ONLY with valid JSON:
{"dimensions":{"focus":N,"calm":N,"agency":N,"vitality":N,"social":N,"creativity":N,"exploration":N,"drive":N},"narrative":"...","archetype_lean":"observer|builder|explorer|dissenter|seeker"}`
        }],
      });

      const responseText = message.content[0].type === "text" ? message.content[0].text : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(500).json({ error: "Could not process the response. Please try again." });
      }

      const parsed = JSON.parse(jsonMatch[0]);
      // Clamp all dimensions to 0-100
      if (parsed.dimensions) {
        for (const dim of DIMENSIONS) {
          if (typeof parsed.dimensions[dim] === "number") {
            parsed.dimensions[dim] = Math.max(0, Math.min(100, Math.round(parsed.dimensions[dim])));
          }
        }
      }
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
focus, calm, agency, vitality, social, creativity, exploration, drive.

Also provide:
- reasoning: 2-3 sentences explaining the decision's impact
- quick_take: 1 sentence summary
- predicted_shift: which archetype the user is currently closest to ("from"), which they'd move toward after this decision ("to"), and confidence (0-1)
- risk_factors: array of 2-4 short risk phrases
- potential_gains: array of 2-4 short gain phrases
- narrative: A short narrative sentence framing this as identity progression (e.g. "This decision moves you from observation into active exploration — trading certainty for discovery.")

Respond ONLY with valid JSON:
{"impacts":{"focus":N,"calm":N,"agency":N,"vitality":N,"social":N,"creativity":N,"exploration":N,"drive":N},"reasoning":"...","quick_take":"...","predicted_shift":{"from":"archetype","to":"archetype","confidence":0.0},"risk_factors":["..."],"potential_gains":["..."],"narrative":"..."}`
        }],
      });

      const responseText = message.content[0].type === "text" ? message.content[0].text : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(500).json({ error: "Could not process the response. Please try again." });
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
        return res.status(500).json({ error: "Could not process the response. Please try again." });
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
        return res.status(503).json({ error: "Analysis is temporarily unavailable. Please try again later." });
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

      // Lumen epistemic emission (fire-and-forget)
      if (userId) emitForRecord(userId, writing.id, { title, content, timestamp: writing.timestamp }, "writing");

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
              `Analyze this writing:${writingBlock}\n\nReturn JSON with these exact keys:\n- dimensions: {focus, calm, agency, vitality, social, creativity, exploration, drive} each 0-100\n- nudges: {focus, calm, agency, vitality, social, creativity, exploration, drive} each -15 to +15\n- quotes: array of 5 objects {"text": "quote", "author": "name"} from real well-known authors relevant to this writing\n- recommended_reading: array of 3 objects {"title": "book", "author": "name", "reason": "one sentence"}`,
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
            // Thinking → focus, agency (Builder signals)
            if (feeling < 40) { averaged.focus = (averaged.focus || 0) + 2; averaged.agency = (averaged.agency || 0) + 3; }
            // Perceiving → exploration, creativity
            if (perceiving > 60) { averaged.exploration = (averaged.exploration || 0) + 3; averaged.creativity = (averaged.creativity || 0) + 2; }
            // Judging → agency, drive (Builder signals)
            if (perceiving < 40) { averaged.agency = (averaged.agency || 0) + 3; averaged.drive = (averaged.drive || 0) + 2; }
          }

          // Political compass influence
          if (analysis.political_compass) {
            const { economic = 0, social: socialAxis = 0 } = analysis.political_compass;
            // Libertarian lean → exploration, creativity (Dissenter/Explorer signals)
            if (socialAxis < -3) { averaged.exploration = (averaged.exploration || 0) + 3; averaged.creativity = (averaged.creativity || 0) + 2; }
            // Authoritarian lean → discipline, ambition (Builder signals)
            if (socialAxis > 3) { averaged.agency = (averaged.agency || 0) + 2; averaged.drive = (averaged.drive || 0) + 2; }
          }

          // Moral foundations influence
          if (analysis.moral_foundations) {
            const { care = 0, fairness = 0, liberty = 0, authority = 0 } = analysis.moral_foundations;
            // High care → social, calm (Seeker signals)
            if (care > 0.7) { averaged.social = (averaged.social || 0) + 2; averaged.calm = (averaged.calm || 0) + 2; }
            // High liberty → exploration (Dissenter signals)
            if (liberty > 0.7) { averaged.exploration = (averaged.exploration || 0) + 3; }
            // High authority → discipline (Builder signals)
            if (authority > 0.7) { averaged.agency = (averaged.agency || 0) + 3; }
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
      // Clamp dimension vectors before saving
      const body = { ...req.body, user_id: userId };
      if (body.self_vec) {
        try {
          const sv = JSON.parse(body.self_vec);
          for (const dim of DIMENSIONS) {
            if (typeof sv[dim] === "number") sv[dim] = Math.max(0, Math.min(100, Math.round(sv[dim])));
          }
          body.self_vec = JSON.stringify(sv);
        } catch {}
      }
      if (body.data_vec) {
        try {
          const dv = JSON.parse(body.data_vec);
          for (const dim of DIMENSIONS) {
            if (typeof dv[dim] === "number") dv[dim] = Math.max(0, Math.min(100, Math.round(dv[dim])));
          }
          body.data_vec = JSON.stringify(dv);
        } catch {}
      }
      const checkin = storage.createCheckin(body);
      // Clear related caches so they refresh with new data
      if (userId) {
        storage.clearUserCache(userId, "mythology");
        storage.clearUserCache(userId, "forecast");
        storage.clearUserCache(userId, "daily-reading");
        storage.clearUserCache(userId, "profile");
      }

      // --- Echo detection ---
      try {
        if (userId) {
          const modes = storage.getIdentityModes(userId);
          if (modes.length > 0 && req.body.self_vec) {
            const DIMS = DIMENSIONS as unknown as string[];
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

      // Lumen epistemic emission (fire-and-forget)
      if (userId) emitForRecord(userId, checkin.id, { ...body, timestamp: checkin.timestamp }, "checkin");

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

      // Lumen epistemic emission (fire-and-forget)
      if (userId) emitForRecord(userId, decision.id, { ...req.body, timestamp: decision.timestamp }, "decision");

      return res.json(decision);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/decision-suggestions — LLM generates decision prompts based on current state
  app.post("/api/decision-suggestions", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      if (!anthropic) return res.json({ suggestions: [] });

      const tz = getUserTimezone(req);
      const ctx = gatherUserContext(userId, tz);
      if (!ctx.hasData) return res.json({ suggestions: ["Should I start a new creative project?", "Should I prioritize rest or push through today?", "Should I reach out to someone I\'ve been thinking about?"] });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `Based on this user's identity data, generate 4 thought-provoking decisions they might be facing right now. Make them personal, specific to their patterns, and genuinely useful — not generic self-help.

User context:
Archetype: ${ctx.dominantArchetype || "unknown"}
Recent check-ins: ${ctx.checkinSummary || "none"}
Music: ${ctx.musicSummary || "none"}
Writing themes: ${ctx.writingSummary || "none"}

Return ONLY a JSON array of 4 strings, each starting with "Should I...". Example:
["Should I take a break from structured work and explore something random?", "Should I write about the tension I\'ve been avoiding?", "Should I change my evening routine?", "Should I say no to that commitment?"]`
        }],
      });

      const text = message.content[0].type === "text" ? message.content[0].text : "";
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return res.json({ suggestions: parsed });
      }
      return res.json({ suggestions: [] });
    } catch (err: any) {
      console.error("Decision suggestions error:", err);
      return res.json({ suggestions: [] });
    }
  });

  // DELETE /api/decisions/:id — delete a decision
  app.delete("/api/decisions/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      db.delete(decisionsTable).where(and(eq(decisionsTable.id, id), eq(decisionsTable.user_id, userId))).run();
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/checkins/:id — delete a check-in
  app.delete("/api/checkins/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      db.delete(checkinsTable).where(and(eq(checkinsTable.id, id), eq(checkinsTable.user_id, userId))).run();
      return res.json({ success: true });
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

      // Smart import: only on explicit ?log=true (first connection only)
      // This uses Spotify's played_at timestamps, NOT server time
      const shouldLog = req.query.log === "true";
      let logged = false;
      if (shouldLog) {
        const existingListens = storage.getSpotifyListens(userId, 1);
        const latestTimestamp = existingListens.length > 0 ? existingListens[0].timestamp : "1970-01-01T00:00:00.000Z";

        for (const item of recentTracks) {
          const track = item.track;
          if (!track?.id || !item.played_at) continue;
          // Only import tracks played AFTER our last recorded entry
          if (item.played_at <= latestTimestamp) continue;
          const features = audioFeaturesMap.get(track.id);
          const albumImages = track.album?.images || [];
          try {
            const result = storage.logSpotifyListen({
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
            if (result) logged = true;
          } catch (e) { /* dedup or error, skip */ }
        }
      }

      // Compute nudges
      const nudges: Record<string, number> = {};
      if (audioFeatures) {
        const { energy = 0.5, valence = 0.5, danceability = 0.5, acousticness = 0.3, instrumentalness = 0 } = audioFeatures;
        if (energy > 0.75) { nudges.drive = (nudges.drive || 0) + 10; nudges.vitality = (nudges.vitality || 0) + 6; }
        if (energy < 0.3) { nudges.calm = (nudges.calm || 0) + 10; nudges.focus = (nudges.focus || 0) + 6; }
        if (valence > 0.7) { nudges.social = (nudges.social || 0) + 8; nudges.exploration = (nudges.exploration || 0) + 5; }
        if (valence < 0.3) { nudges.creativity = (nudges.creativity || 0) + 10; nudges.calm = (nudges.calm || 0) - 5; }
        if (danceability > 0.75) { nudges.social = (nudges.social || 0) + 6; nudges.exploration = (nudges.exploration || 0) + 4; }
        if (acousticness > 0.65) { nudges.calm = (nudges.calm || 0) + 6; nudges.focus = (nudges.focus || 0) + 4; }
        if (instrumentalness > 0.5) { nudges.focus = (nudges.focus || 0) + 10; nudges.creativity = (nudges.creativity || 0) + 5; nudges.agency = (nudges.agency || 0) + 5; }
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

      // Just the 20 most recent listens
      const listens = storage.getSpotifyListens(userId, 20);
      const stats = storage.getSpotifyStats(userId);

      return res.json({ listens, stats });
    } catch (err: any) {
      console.error("Spotify history error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ===================== HELPER: gather user data context =====================

  function gatherUserContext(userId: number, tz: string = "UTC") {
    const allCheckins = storage.getCheckins(userId);
    // Recent window: last 15 check-ins for LLM context (covers ~1-2 weeks)
    const checkinSlice = allCheckins.slice(0, 15);
    // Recent writings: last 15 entries
    const allWritings = storage.getWritings(15, userId);
    const spotifyListensAll = storage.getSpotifyListens(userId, 50);
    const spotifyStats = storage.getSpotifyStats(userId);

    const checkinSummary = `[Recent check-ins, newest first — last ~1-2 weeks]\n` + checkinSlice.map(c => {
      return `${c.timestamp.slice(0,10)}: self=${c.self_archetype}, data=${c.data_archetype || "n/a"}, feeling="${c.feeling_text || ""}"`;
    }).join("\n");

    const writingSummary = `[Recent writings, newest first]\n` + allWritings.map(w => {
      const a = w.analysis ? JSON.parse(w.analysis) : null;
      return `${w.timestamp.slice(0,10)}: "${w.title || "untitled"}" - archetype=${a?.archetype_lean || "?"}, mbti=${a?.mbti?.type || "?"}, themes=${a?.word_themes?.join(",") || "?"}, emotions=${a?.emotions ? JSON.stringify(a.emotions) : "?"}${a?.political_compass ? `, compass=${JSON.stringify(a.political_compass)}` : ""}`;
    }).join("\n");

    const musicSummary = `[Listening patterns — recent sessions]\n${spotifyStats.totalTracks} tracks, avg energy ${spotifyStats.avgEnergy}%, avg valence ${spotifyStats.avgValence}%, avg danceability ${spotifyStats.avgDanceability}%, top artists: ${spotifyStats.topArtists.map((a: any) => `${a.name} (${a.count})`).join(", ")}`;

    // Temporal patterns: timestamps of listening — converted to user's local timezone
    const listenTimestamps = spotifyListensAll.slice(0, 30).map(t => {
      return `${t.track_name} by ${t.artist_name} at ${formatTimestampLocal(t.timestamp, tz)} (energy:${t.energy}, valence:${t.valence}, dance:${t.danceability}, acoustic:${t.acousticness})`;
    }).join("\n");

    // Archetype timeline for state transitions
    const archetypeTimeline = `[Archetype shifts over time, newest first]\n` + checkinSlice.map(c =>
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
      try {
        const cached = JSON.parse(cachedProfile);
        // Seed variant history from cached profile if not yet logged
        if (cached.variant && cached.variant.variant_name) {
          try {
            const lastV = storage.getLastVariant(userId);
            if (!lastV || lastV.variant_name !== cached.variant.variant_name) {
              storage.logVariant(userId, cached.variant);
            }
          } catch { /* non-critical */ }
        }
        return res.json(cached);
      } catch {}
    }

    const tz = getUserTimezone(req);
    const ctx = gatherUserContext(userId, tz);
    if (!ctx.hasData) return res.json({ variant: null, hasData: false });

    if (!anthropic) return res.json({ variant: null, error: "Analysis is temporarily unavailable" });

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

      // Log variant change to history if the variant name differs from the last logged one
      try {
        const lastVariant = storage.getLastVariant(userId);
        if (!lastVariant || lastVariant.variant_name !== parsed.variant_name) {
          storage.logVariant(userId, {
            variant_name: parsed.variant_name,
            primary_archetype: parsed.primary_archetype,
            secondary_archetype: parsed.secondary_archetype,
            description: parsed.description,
            emergent_traits: parsed.emergent_traits,
            exploration_channels: parsed.exploration_channels,
          });
        }
      } catch (histErr) {
        console.error("Variant history logging error:", histErr);
      }

      return res.json(profileResponseData);
    } catch (err: any) {
      console.error("Profile variant error:", err);
      return res.json({ variant: null, hasData: true, error: err.message });
    }
  });

  // ===================== VARIANT HISTORY =====================

  app.get("/api/variant-history", (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ history: [] });
    try {
      const history = storage.getVariantHistory(userId);
      // Parse JSON fields for the client
      const parsed = history.map((h: any) => ({
        ...h,
        emergent_traits: h.emergent_traits ? JSON.parse(h.emergent_traits) : [],
        exploration_channels: h.exploration_channels ? JSON.parse(h.exploration_channels) : [],
      }));
      return res.json({ history: parsed });
    } catch (err: any) {
      console.error("Variant history error:", err);
      return res.json({ history: [] });
    }
  });

  // ===================== TIME CAPSULE (HISTORICAL ECHOES) =====================

  app.get("/api/time-capsule", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ echoes: [] });

    try {
      // Check cache first (120 min)
      const cached = storage.getCachedResponse(userId, "time_capsule", 120);
      if (cached) {
        try { return res.json(JSON.parse(cached)); } catch {}
      }

      const tz = getUserTimezone(req);
      const ctx = gatherUserContext(userId, tz);
      if (!ctx.hasData) return res.json({ echoes: [] });

      // Fetch variant history for richer context
      const variantHistory = storage.getVariantHistory(userId);
      const variantSummary = variantHistory.slice(0, 10).map((v: any) =>
        `${v.started_at.slice(0,10)}: "${v.variant_name}" (${v.primary_archetype}/${v.secondary_archetype || "none"})`
      ).join("\n") || "No variant history yet.";

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `You are the Parallax identity system's historian module. Based on the user's identity signals, generate 3 "historical echoes" — short, symbolic parallels between the user's current identity patterns and historical/mythological/cultural figures or archetypes.

IMPORTANT FRAMING RULES:
- Cycle between these opener styles across the 3 echoes: "You would've been…", "This echoes…", "Your pattern rhymes with…" (use one of each, in any order)
- Keep it symbolic and poetic, never literal or political
- Ground each echo in the user's actual data (archetypes, traits, music, writing)
- Use soft language: "echoes", "parallels", "rhymes with", never "you are" or definitive claims
- Each echo should feel like discovering a surprising but resonant connection

User's recent check-in archetypes & feelings:
${ctx.checkinSummary}

Writing themes:
${ctx.writingSummary || "No writings yet."}

Music profile:
${ctx.musicSummary}

Variant history (identity shifts over time):
${variantSummary}

The 5 meta-archetypes: observer (understanding patterns), builder (creating structure), explorer (novelty/expression), dissenter (autonomy/resistance), seeker (meaning/transformation).

Generate exactly 3 echoes. Each must have:
- "title": The echo headline (8-15 words, using one of the three opener styles)
- "body": 1-2 sentences grounding the parallel in the user's actual signals

Return ONLY valid JSON:
{"echoes":[{"title":"...","body":"..."},{"title":"...","body":"..."},{"title":"...","body":"..."}]}`
        }],
      });

      const responseText = message.content[0].type === "text" ? message.content[0].text : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.json({ echoes: [] });

      const parsed = JSON.parse(jsonMatch[0]);
      storage.setCachedResponse(userId, "time_capsule", JSON.stringify(parsed));
      return res.json(parsed);
    } catch (err: any) {
      console.error("Time capsule error:", err);
      return res.json({ echoes: [] });
    }
  });

  // ===================== REFRACTIONS (CONDITIONS + RECOVERY) =====================

  app.get("/api/refractions/conditions", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ conditions: [] });

    try {
      const cached = storage.getCachedResponse(userId, "refractions_conditions", 120);
      if (cached) {
        try { return res.json(JSON.parse(cached)); } catch {}
      }

      const tz = getUserTimezone(req);
      const ctx = gatherUserContext(userId, tz);
      if (!ctx.hasData) return res.json({ conditions: [] });

      const variantHistory = storage.getVariantHistory(userId);
      const variantSummary = variantHistory.slice(0, 10).map((v: any) =>
        `${v.started_at.slice(0,10)}: "${v.variant_name}" (${v.primary_archetype}/${v.secondary_archetype || "none"})`
      ).join("\n") || "No variant history yet.";

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `You are the Parallax identity system's conditions analyst. Based on the user's behavioral signals, identify what environments, behaviors, or contexts tend to bring out certain archetypal expressions.

IMPORTANT FRAMING:
- Use soft probabilistic language: "tends to", "often coincides with", "appears stronger when", "may emerge under"
- Never use definitive claims like "you are" or "this causes"
- Ground observations in the user's actual data patterns
- Each condition should name a specific archetype it amplifies

User's check-in history:
${ctx.checkinSummary}

Writing themes:
${ctx.writingSummary || "No writings yet."}

Music profile:
${ctx.musicSummary}

Variant history:
${variantSummary}

The 5 archetypes: observer, builder, explorer, dissenter, seeker.

Generate 3-4 condition observations. Each must have:
- "condition": A short phrase describing the context/behavior (e.g. "solitary mornings with acoustic music")
- "amplifies": Which archetype this tends to strengthen (one of the 5)
- "observation": 1 sentence explaining the pattern using soft language

Return ONLY valid JSON:
{"conditions":[{"condition":"...","amplifies":"...","observation":"..."}]}`
        }],
      });

      const responseText = message.content[0].type === "text" ? message.content[0].text : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.json({ conditions: [] });

      const parsed = JSON.parse(jsonMatch[0]);
      storage.setCachedResponse(userId, "refractions_conditions", JSON.stringify(parsed));
      return res.json(parsed);
    } catch (err: any) {
      console.error("Refractions conditions error:", err);
      return res.json({ conditions: [] });
    }
  });

  app.get("/api/refractions/recovery", (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ recovery: null });

    try {
      const cached = storage.getCachedResponse(userId, "refractions_recovery", 60);
      if (cached) {
        try { return res.json(JSON.parse(cached)); } catch {}
      }

      // Get all checkins for volatility analysis
      const checkins = sqlite.prepare(
        "SELECT self_vec, timestamp FROM checkins WHERE user_id = ? ORDER BY timestamp ASC"
      ).all(userId) as any[];

      if (checkins.length < 8) return res.json({ recovery: null });

      // Parse dimension vectors
      const vecs = checkins.map((c: any) => {
        try { return { vec: JSON.parse(c.self_vec), date: c.timestamp }; }
        catch { return null; }
      }).filter(Boolean) as { vec: Record<string, number>; date: string }[];

      if (vecs.length < 8) return res.json({ recovery: null });

      const dims = DIMENSIONS as unknown as string[];

      // Calculate volatility in sliding windows of 4
      const windowSize = 4;
      const windows: number[] = [];
      for (let i = 0; i <= vecs.length - windowSize; i++) {
        const windowVecs = vecs.slice(i, i + windowSize);
        let totalVar = 0;
        for (const dim of dims) {
          const vals = windowVecs.map(v => v.vec[dim] || 50);
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const variance = vals.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / vals.length;
          totalVar += variance;
        }
        windows.push(Math.sqrt(totalVar / dims.length));
      }

      // Current vs historical volatility
      const recentVol = windows.length >= 2 ? windows.slice(-2).reduce((a, b) => a + b, 0) / 2 : windows[windows.length - 1];
      const historicalVol = windows.reduce((a, b) => a + b, 0) / windows.length;
      const maxVol = Math.max(...windows);

      // Stability score 0-1 (1 = very stable)
      const stability = Math.max(0, Math.min(1, 1 - (recentVol / (maxVol || 1))));

      // Trend
      let trend: "stabilizing" | "drifting" | "stable" | "volatile" = "stable";
      if (recentVol < historicalVol * 0.7) trend = "stabilizing";
      else if (recentVol > historicalVol * 1.3) trend = "drifting";
      else if (recentVol > 15) trend = "volatile";

      // Find baseline archetype (most common in first third of checkins)
      const firstThird = vecs.slice(0, Math.max(3, Math.floor(vecs.length / 3)));
      const archCounts: Record<string, number> = {};
      for (const v of firstThird) {
        const topDim = Object.entries(v.vec).sort((a, b) => b[1] - a[1])[0]?.[0] || "focus";
        archCounts[topDim] = (archCounts[topDim] || 0) + 1;
      }

      const result = {
        recovery: {
          stability: Math.round(stability * 100) / 100,
          trend,
          recent_volatility: Math.round(recentVol * 10) / 10,
          historical_volatility: Math.round(historicalVol * 10) / 10,
          data_points: vecs.length,
        }
      };

      storage.setCachedResponse(userId, "refractions_recovery", JSON.stringify(result));
      return res.json(result);
    } catch (err: any) {
      console.error("Refractions recovery error:", err);
      return res.json({ recovery: null });
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

    if (!anthropic) return res.json({ insights: [], error: "Analysis is temporarily unavailable" });

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

    if (!anthropic) return res.json({ forecast: null, error: "Analysis is temporarily unavailable" });

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

    // ── Micro→Macro hierarchy ──
    // Home page selfVec = last 3-5 days ("this week" lens)
    // Home page dataVec = recency-weighted last 10 data vecs
    // Home page allTimeVec = all check-ins equal weight (for archetype distribution)

    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();

    // Filter check-ins from last 5 days for selfVec
    const recentWindow = allCheckins.filter((c: any) => {
      try { return c.timestamp >= fiveDaysAgo; } catch { return false; }
    });
    // Fall back to last 5 check-ins if window is too small
    const windowCheckins = recentWindow.length >= 2 ? recentWindow : allCheckins.slice(0, 5);

    const selfDims: Record<string, number> = {};
    let selfWeight = 0;
    const decay = 0.75;

    for (let i = 0; i < windowCheckins.length; i++) {
      const c = windowCheckins[i];
      const weight = Math.pow(decay, i); // i=0 is newest
      if (c.self_vec) {
        try {
          const sv = JSON.parse(c.self_vec);
          for (const dim of DIMENSIONS) {
            selfDims[dim] = (selfDims[dim] || 0) + (sv[dim] || 50) * weight;
          }
          selfWeight += weight;
        } catch {}
      }
    }

    // Data vec: recency-weighted last 10 data vecs (running behavioral read)
    const recentForData = allCheckins.slice(0, 10);
    const dataDims: Record<string, number> = {};
    let dataWeight = 0;

    for (let i = 0; i < recentForData.length; i++) {
      const c = recentForData[i];
      const weight = Math.pow(decay, i);
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

    // All-time vec: equal weight across ALL check-ins (macro view for arch distribution)
    const allTimeDims: Record<string, number> = {};
    let allTimeCount = 0;
    for (const c of allCheckins) {
      if (c.self_vec) {
        try {
          const sv = JSON.parse(c.self_vec);
          for (const dim of DIMENSIONS) {
            allTimeDims[dim] = (allTimeDims[dim] || 0) + (sv[dim] || 50);
          }
          allTimeCount++;
        } catch {}
      }
    }

    // Count unique active days for signal strength
    const daySet = new Set<string>();
    for (const c of allCheckins) {
      try { daySet.add(new Date(c.timestamp).toISOString().slice(0, 10)); } catch {}
    }

    // Recent dimension history for sparklines (last 10, newest first)
    const dimHistory: Record<string, number[]> = {};
    for (const dim of DIMENSIONS) dimHistory[dim] = [];
    for (const c of allCheckins.slice(0, 10)) {
      if (c.self_vec) {
        try {
          const sv = JSON.parse(c.self_vec);
          for (const dim of DIMENSIONS) {
            dimHistory[dim].push(sv[dim] || 50);
          }
        } catch {}
      }
    }
    // Reverse so oldest is first (left of sparkline) → newest is last (right)
    for (const dim of DIMENSIONS) dimHistory[dim].reverse();

    const selfVec: Record<string, number> = {};
    const dataVec: Record<string, number> = {};
    const allTimeVec: Record<string, number> = {};
    for (const dim of DIMENSIONS) {
      selfVec[dim] = selfWeight > 0 ? Math.round((selfDims[dim] || 0) / selfWeight) : 50;
      dataVec[dim] = dataWeight > 0 ? Math.round((dataDims[dim] || 0) / dataWeight) : 50;
      allTimeVec[dim] = allTimeCount > 0 ? Math.round((allTimeDims[dim] || 0) / allTimeCount) : 50;
    }

    // Archetype distribution — computed from all-time vec (macro view)
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
      allTimeVec,
      archetypeDistribution: archDist,
      writingArchetypes,
      topThemes,
      sources,
      checkinCount: allCheckins.length,
      uniqueDays: daySet.size,
      hasSpotify: spotifyListens.length > 0,
      dimHistory,
      spotifyStats: {
        avgEnergy: spotifyStats.avgEnergy,
        avgValence: spotifyStats.avgValence,
        avgDanceability: spotifyStats.avgDanceability,
        topArtists: spotifyStats.topArtists.slice(0, 5),
      },
      latestArchetype: allCheckins.length > 0 ? allCheckins[0].self_archetype : null,
      latestDataArchetype: allCheckins.length > 0 ? allCheckins[0].data_archetype : null,
      lastCheckinAt: allCheckins.length > 0 ? allCheckins[0].timestamp : null,
    });
  });

  // GET /api/spotify/patterns — mood clusters, temporal patterns, discovery ratio
  app.get("/api/spotify/patterns", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ hasData: false });

    const listens = storage.getSpotifyListens(userId, 500);
    if (listens.length === 0) return res.json({ hasData: false });

    const tz = getUserTimezone(req);

    // Mood clustering (improved: recency-weighted, percentage-of-total normalization)
    const clusters: Record<string, number> = {
      ambient: 0,
      energetic: 0,
      melancholic: 0,
      rhythmic: 0,
      introspective: 0,
      uplifting: 0,
    };
    let weightTotal = 0;
    const now = Date.now();

    for (const t of listens) {
      const energy = (t.energy || 50) / 100;
      const valence = (t.valence || 50) / 100;
      const dance = (t.danceability || 50) / 100;
      const acoustic = (t.acousticness || 50) / 100;
      const instrumental = (t.instrumentalness || 0) / 100;
      const tempo = Math.min((t.tempo || 120) / 180, 1); // cap at 180bpm

      // Recency weight: tracks from today count 3x, 7+ days ago count 1x
      const ageMs = now - new Date(t.timestamp).getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      const recency = Math.max(1, 3 - ageDays * 0.3);

      // Each track distributes points across clusters — a track can be partially multiple things
      // Ambient: quiet, acoustic, slow, not danceable
      const ambientScore = acoustic * (1 - energy) * (1 - dance) * (1 - tempo * 0.5);
      // Energetic: high energy, fast, not acoustic
      const energeticScore = energy * tempo * (1 - acoustic * 0.7);
      // Melancholic: low valence, low dance, moderate energy ok
      const melancholicScore = (1 - valence) * (1 - dance * 0.6) * (0.4 + energy * 0.3);
      // Rhythmic: high danceability, moderate-high energy
      const rhythmicScore = dance * (0.5 + energy * 0.5) * tempo;
      // Introspective: low energy, acoustic or instrumental, slower
      const introspectiveScore = (1 - energy * 0.7) * (acoustic * 0.6 + instrumental * 0.4) * (1 - dance);
      // Uplifting: high valence, high energy, danceable
      const upliftingScore = valence * energy * (0.4 + dance * 0.6);

      clusters.ambient += ambientScore * recency;
      clusters.energetic += energeticScore * recency;
      clusters.melancholic += melancholicScore * recency;
      clusters.rhythmic += rhythmicScore * recency;
      clusters.introspective += introspectiveScore * recency;
      clusters.uplifting += upliftingScore * recency;
      weightTotal += recency;
    }

    // Normalize to percentages of total (not relative to max)
    const moodClusters: Record<string, number> = {};
    if (weightTotal > 0) {
      const totalScore = Object.values(clusters).reduce((s, v) => s + v, 0);
      for (const [key, val] of Object.entries(clusters)) {
        moodClusters[key] = totalScore > 0 ? Math.round((val / totalScore) * 100) : 0;
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
    const DIMS = DIMENSIONS as unknown as string[];
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

  // ===================== DAILY READING (merged mythology + forecast) =====================

  app.get("/api/daily-reading", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.json({ reading: null });

    // Check cache (30 min)
    const cached = storage.getCachedResponse(userId, "daily-reading", 30);
    if (cached) {
      try { return res.json(JSON.parse(cached)); } catch {}
    }

    const tz = getUserTimezone(req);
    const ctx = gatherUserContext(userId, tz);
    
    const allCheckins = storage.getCheckins(userId);
    if (allCheckins.length === 0) {
      return res.json({ reading: null, empty: true });
    }

    if (!anthropic) return res.json({ reading: null, error: "Analysis is temporarily unavailable" });

    const checkinArchetypes = allCheckins.slice(0, 10).map(c => c.self_archetype).join(", ");
    const latestFeeling = allCheckins[0]?.feeling_text || "";

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: "You MUST respond with ONLY valid JSON. No markdown, no explanation.",
        messages: [{
          role: "user",
          content: `You are the Parallax daily reading engine — a personal behavioral forecast system. Combine narrative identity interpretation with practical signal forecasting into ONE unified reading.

The 5 archetypes: Observer (understanding), Builder (structure), Explorer (novelty), Dissenter (autonomy), Seeker (meaning).

User data:
CHECK-INS (recent archetypes): ${checkinArchetypes}
Latest feeling: "${latestFeeling}"

${ctx.hasData ? `MUSIC: ${ctx.musicSummary}
WRITING: ${ctx.writingSummary}
Listening: ${ctx.listenTimestamps || "None"}` : "Limited data available."}

Generate a DAILY READING with these exact JSON keys:
- arc_name: Short evocative name for current phase (2-3 words, e.g., "The Threshold", "The Forge")
- narrative: 2-3 sentences describing where the user is in their journey AND what today looks like. Combine mythological interpretation with practical forecast. Second person, slightly poetic.
- archetype_signals: For each archetype, a signal level: "rising", "elevated", "stable", "low", or "dormant"
  Format: {"observer": "stable", "builder": "rising", "explorer": "elevated", "dissenter": "low", "seeker": "dormant"}
- dominant_mode: Which archetype key is strongest right now
- good_conditions: Array of 3 activities well-suited for today
- operating_rules: Array of 2 personal behavioral patterns (e.g., "Solo mornings → deep focus → strongest output")
- observation: One poetic sentence connecting behavior, emotion, and identity. The "how did it know?" moment.

Return ONLY valid JSON:
{"arc_name":"...","narrative":"...","archetype_signals":{"observer":"...","builder":"...","explorer":"...","dissenter":"...","seeker":"..."},"dominant_mode":"...","good_conditions":["..."],"operating_rules":["..."],"observation":"..."}`
        }],
      });

      const raw = message.content[0].type === "text" ? message.content[0].text : "";
      let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return res.json({ reading: null });

      let parsed;
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        const fixed = match[0].replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
        try { parsed = JSON.parse(fixed); } catch { return res.json({ reading: null }); }
      }

      const responseData = { reading: parsed };
      storage.setCachedResponse(userId, "daily-reading", JSON.stringify(responseData));
      return res.json(responseData);
    } catch (err: any) {
      console.error("Daily reading error:", err?.message || err);
      return res.json({ reading: null, error: err.message });
    }
  });

  // GET /api/export — export all user data as JSON
  app.get("/api/export", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const user = storage.getUserById(userId);
    const checkins = storage.getCheckins(userId);
    const writings = storage.getWritings(1000, userId);
    const listens = storage.getSpotifyListens(userId, 10000);
    const decisions = storage.getDecisions(userId);

    const exportData = {
      exported_at: new Date().toISOString(),
      user: { username: user?.username, displayName: user?.display_name },
      checkins: checkins.map(c => ({ ...c, password_hash: undefined })),
      writings: writings.map(w => ({ id: w.id, title: w.title, content: w.content, timestamp: w.timestamp, analysis: w.analysis ? JSON.parse(w.analysis) : null })),
      spotify_listens: listens,
      decisions,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="parallax-export-${user?.username || "data"}.json"`);
    return res.json(exportData);
  });

  // DELETE /api/auth/account — delete account and all data
  app.delete("/api/auth/account", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    try {
      storage.deleteUserAndData(userId);
      res.cookie("parallax_token", "", { httpOnly: true, maxAge: 0, path: "/" });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ===================== ADMIN (oracle only) =====================
  // Users with admin-level access to the oracle dashboard
  const ORACLE_USERNAMES = ["oracle", "lukesluckysox"];  
  function isOracle(username: string | undefined | null): boolean {
    return !!username && ORACLE_USERNAMES.includes(username);
  }

  app.get("/api/admin/stats", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const user = storage.getUserById(userId);
    if (!user || !isOracle(user.username)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const users = storage.getAllUsersWithStats();
    const aggregate = storage.getAggregateStats();

    // Demographics
    const genderCounts: Record<string, number> = {};
    const ageCounts: Record<string, number> = {};
    const locationCounts: Record<string, number> = {};

    for (const u of users) {
      if (u.gender) genderCounts[u.gender] = (genderCounts[u.gender] || 0) + 1;
      if (u.age) ageCounts[u.age] = (ageCounts[u.age] || 0) + 1;
      if (u.location) locationCounts[u.location] = (locationCounts[u.location] || 0) + 1;
    }

    return res.json({
      users: users.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        joinDate: u.created_at,
        age: u.age,
        gender: u.gender,
        location: u.location,
        checkins: u.checkin_count,
        writings: u.writing_count,
        listens: u.listen_count,
        spotifyConnected: u.spotify_connected > 0,
        pro: !!u.pro,
        lastActive: u.last_checkin || u.last_writing || u.created_at,
      })),
      aggregate,
      demographics: { genderCounts, ageCounts, locationCounts },
    });
  });

  // ===================== IDENTITY WRAPPED =====================

  app.get("/api/wrapped", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const allCheckins = storage.getCheckins(userId);
    const writings = storage.getWritings(100, userId);
    const listens = storage.getSpotifyListens(userId, 500);

    if (allCheckins.length < 3) {
      return res.json({ ready: false, reason: "Need at least 3 check-ins" });
    }

    // 1. Dominant archetype
    const archCounts: Record<string, number> = {};
    for (const c of allCheckins) {
      const a = c.self_archetype || "observer";
      archCounts[a] = (archCounts[a] || 0) + 1;
    }
    const totalCheckins = allCheckins.length;
    const sortedArchs = Object.entries(archCounts).sort((a, b) => b[1] - a[1]);
    const dominantArch = sortedArchs[0];
    const rarestArch = sortedArchs[sortedArchs.length - 1];

    // 2. Most volatile dimension
    const dimValues: Record<string, number[]> = {};
    for (const c of allCheckins) {
      try {
        const vec = JSON.parse(c.self_vec);
        for (const [dim, val] of Object.entries(vec)) {
          if (!dimValues[dim]) dimValues[dim] = [];
          dimValues[dim].push(val as number);
        }
      } catch {}
    }
    let mostVolatile = { dim: "creativity", range: 0, min: 50, max: 50 };
    for (const [dim, vals] of Object.entries(dimValues)) {
      if (vals.length < 2) continue;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const range = max - min;
      if (range > mostVolatile.range) {
        mostVolatile = { dim, range, min, max };
      }
    }

    // 3. Sonic identity — top artist during high-creativity check-ins
    let topSonicArtist = "";
    let sonicMoodProfile: Record<string, number> = {};
    if (listens.length > 0) {
      // Find artist most played overall
      const artistCounts: Record<string, number> = {};
      for (const l of listens) {
        artistCounts[l.artist_name] = (artistCounts[l.artist_name] || 0) + 1;
      }
      topSonicArtist = Object.entries(artistCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";

      // Mood profile of listening
      let totalE = 0, totalV = 0, totalD = 0, totalA = 0, count = 0;
      for (const l of listens) {
        totalE += (l.energy || 50);
        totalV += (l.valence || 50);
        totalD += (l.danceability || 50);
        totalA += (l.acousticness || 50);
        count++;
      }
      if (count > 0) {
        sonicMoodProfile = {
          energetic: Math.round(totalE / count),
          melancholic: Math.round(100 - totalV / count),
          rhythmic: Math.round(totalD / count),
          introspective: Math.round(totalA / count),
        };
      }
    }

    // 4. Mirror line — from most recent analyzed writing
    let mirrorLine = null;
    for (const w of writings) {
      if (!w.analysis) continue;
      try {
        const analysis = JSON.parse(w.analysis);
        if (analysis.mirror_moment?.line) {
          mirrorLine = analysis.mirror_moment.line;
          break;
        }
      } catch {}
    }

    // 5. Total stats
    const totalWritings = writings.length;
    const totalTracks = listens.length;

    return res.json({
      ready: true,
      dominant: {
        archetype: dominantArch[0],
        percentage: Math.round((dominantArch[1] / totalCheckins) * 100),
        count: dominantArch[1],
      },
      rarest: {
        archetype: rarestArch[0],
        percentage: Math.round((rarestArch[1] / totalCheckins) * 100),
        count: rarestArch[1],
      },
      volatile: mostVolatile,
      sonic: {
        topArtist: topSonicArtist,
        moodProfile: sonicMoodProfile,
        totalTracks,
      },
      mirrorLine,
      stats: {
        checkins: totalCheckins,
        writings: totalWritings,
        tracks: totalTracks,
      },
    });
  });

  // ===================== SPOTIFY WHITELIST QUEUE =====================

  // Any authenticated user can request whitelisting
  app.post("/api/spotify/whitelist-request", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const user = storage.getUserById(userId);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const { email } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email required" });
    }

    // Check if already requested
    const existing = storage.getWhitelistRequestByEmail(email.trim().toLowerCase());
    if (existing) {
      return res.json({ success: true, message: "Already in queue", alreadyQueued: true });
    }

    const entry = storage.addWhitelistRequest({
      email: email.trim().toLowerCase(),
      username: user.username,
      requested_at: new Date().toISOString(),
    });

    return res.json({ success: true, entry });
  });

  // Check if current user already has a pending request
  app.get("/api/spotify/whitelist-status", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const user = storage.getUserById(userId);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    // Check by username match in the queue
    const queue = storage.getWhitelistQueue();
    const myRequest = queue.find(q => q.username === user.username);
    return res.json({ requested: !!myRequest, entry: myRequest || null });
  });

  // Oracle-only: get full queue
  app.get("/api/admin/whitelist-queue", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const user = storage.getUserById(userId);
    if (!user || !isOracle(user.username)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const queue = storage.getWhitelistQueue();
    return res.json({ queue });
  });

  // Oracle-only: toggle pro status for a user
  app.post("/api/admin/users/:id/pro", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const user = storage.getUserById(userId);
    if (!user || !isOracle(user.username)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const targetId = parseInt(req.params.id);
    if (isNaN(targetId)) return res.status(400).json({ error: "Invalid id" });

    const target = storage.getUserById(targetId);
    if (!target) return res.status(404).json({ error: "User not found" });

    const newPro = (target as any).pro ? 0 : 1;
    sqlite.prepare("UPDATE users SET pro = ? WHERE id = ?").run(newPro, targetId);
    return res.json({ success: true, pro: !!newPro });
  });

  // Oracle-only: delete a user and all their data
  app.delete("/api/admin/users/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const user = storage.getUserById(userId);
    if (!user || !isOracle(user.username)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const targetId = parseInt(req.params.id);
    if (isNaN(targetId)) return res.status(400).json({ error: "Invalid id" });

    if (targetId === userId) {
      return res.status(400).json({ error: "Cannot delete your own account from admin" });
    }

    storage.deleteUserAndData(targetId);
    return res.json({ success: true });
  });

  // Oracle-only: delete from queue (after manually whitelisting)
  app.delete("/api/admin/whitelist-queue/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const user = storage.getUserById(userId);
    if (!user || !isOracle(user.username)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    storage.deleteWhitelistRequest(id);
    return res.json({ success: true });
  });

  // ===================== LUMEN INTERNAL ENDPOINTS =====================

  const LUMEN_INTERNAL_TOKEN = process.env.LUMEN_INTERNAL_TOKEN;

  function requireInternalToken(req: any, res: any): boolean {
    const token = req.headers["x-lumen-internal-token"];
    if (!LUMEN_INTERNAL_TOKEN || token !== LUMEN_INTERNAL_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
    return true;
  }

  // POST /api/internal/link-user — Lumen calls after login to set lumen_user_id
  // Finds or creates a Parallax user by username, then links the Lumen userId.
  app.post("/api/internal/link-user", async (req, res) => {
    if (!requireInternalToken(req, res)) return;

    const { username, lumenUserId, plan } = req.body ?? {};
    if (!username || !lumenUserId) {
      return res.status(400).json({ error: "username and lumenUserId are required" });
    }

    try {
      let user = storage.getUserByUsername(username);
      if (!user) {
        // Create a shadow account — SSO users don't need a real password
        const { randomUUID } = await import("crypto");
        const bcrypt = await import("bcryptjs");
        const randomHash = await bcrypt.hash(randomUUID(), 10);
        user = storage.createUser({
          username,
          password_hash: randomHash,
          display_name: username,
          created_at: new Date().toISOString(),
        });
      }

      storage.setLumenUserId(user.id, String(lumenUserId));

      // Sync plan from Lumen: free → pro=0, pro/founder → pro=1
      if (plan && ['free', 'pro', 'founder'].includes(plan)) {
        const newPro = plan === 'free' ? 0 : 1;
        sqlite.prepare("UPDATE users SET pro = ? WHERE id = ?").run(newPro, user.id);
      }

      return res.json({ ok: true, parallaxUserId: user.id, linked: true });
    } catch (err) {
      console.error("[internal/link-user]", err);
      return res.status(500).json({ error: "Failed to link user" });
    }
  });

  // GET /api/internal/export-records — Lumen pulls all records
  app.get("/api/internal/export-records", async (req, res) => {
    if (!requireInternalToken(req, res)) return;

    try {
      const users = storage.getAllUsers();
      const userMap = new Map<number, any>();
      for (const u of users) userMap.set(u.id, u);

      const checkins = storage.getAllCheckins();
      const decisions = storage.getAllDecisions();
      const writings = storage.getAllWritings();

      const records: any[] = [];

      for (const c of checkins) {
        const u = c.user_id ? userMap.get(c.user_id) : null;
        records.push({
          id: c.id,
          type: "checkin",
          userId: c.user_id,
          lumenUserId: u?.lumen_user_id || null,
          selfArchetype: c.self_archetype,
          selfVec: c.self_vec,
          dataVec: c.data_vec,
          feelingText: c.feeling_text,
          createdAt: c.timestamp,
        });
      }

      for (const d of decisions) {
        const u = d.user_id ? userMap.get(d.user_id) : null;
        records.push({
          id: d.id,
          type: "decision",
          userId: d.user_id,
          lumenUserId: u?.lumen_user_id || null,
          decisionText: d.decision_text,
          verdict: d.verdict,
          impactVec: d.impact_vec,
          createdAt: d.timestamp,
        });
      }

      for (const w of writings) {
        const u = w.user_id ? userMap.get(w.user_id) : null;
        records.push({
          id: w.id,
          type: "writing",
          userId: w.user_id,
          lumenUserId: u?.lumen_user_id || null,
          title: w.title,
          content: w.content,
          analysis: w.analysis,
          createdAt: w.timestamp,
        });
      }

      return res.json(records);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/internal/backfill-to-lumen — trigger backfill from within the app
  app.post("/api/internal/backfill-to-lumen", async (req, res) => {
    if (!requireInternalToken(req, res)) return;

    const LUMEN_API_URL = process.env.LUMEN_API_URL;
    if (!LUMEN_API_URL) {
      return res.status(500).json({ error: "LUMEN_API_URL not configured" });
    }

    try {
      const users = storage.getAllUsers();
      const userMap = new Map<number, string>();
      for (const u of users) {
        if (u.lumen_user_id) userMap.set(u.id, u.lumen_user_id);
      }

      if (userMap.size === 0) {
        return res.json({ message: "No users with lumen_user_id", sent: 0 });
      }

      const checkins = storage.getAllCheckins();
      const decisions = storage.getAllDecisions();
      const writings = storage.getAllWritings();

      const byUser = new Map<string, any[]>();

      // ── Aggregate checkins by self_archetype ───────────────────────────────
      // Individual checkins have no recurrence signal on their own.
      // Group by archetype so Lumen sees frequency >= 2 and can promote patterns.
      const checkinsByUser = new Map<string, typeof checkins>();
      for (const c of checkins) {
        const luid = c.user_id ? userMap.get(c.user_id) : null;
        if (!luid) continue;
        if (!checkinsByUser.has(luid)) checkinsByUser.set(luid, []);
        checkinsByUser.get(luid)!.push(c);
      }

      for (const luid of Array.from(checkinsByUser.keys())) {
        const userCheckins = checkinsByUser.get(luid)!;
        if (!byUser.has(luid)) byUser.set(luid, []);

        // Group by self_archetype
        const archetypeGroups = new Map<string, typeof checkins>();
        for (const c of userCheckins) {
          const arch = c.self_archetype || "unknown";
          if (!archetypeGroups.has(arch)) archetypeGroups.set(arch, []);
          archetypeGroups.get(arch)!.push(c);
        }

        for (const arch of Array.from(archetypeGroups.keys())) {
          const group = archetypeGroups.get(arch)!;

          // Parse selfVec averages
          const vecs = group.map(c => {
            try { return JSON.parse((c as any).self_vec || "{}" ); } catch { return {}; }
          }).filter((v: any) => Object.keys(v).length > 0);

          const avgVec: Record<string, number> = {};
          if (vecs.length > 0) {
            for (const key of Object.keys(vecs[0] as object)) {
              avgVec[key] = (vecs as any[]).reduce((s: number, v: any) => s + (v[key] || 0), 0) / vecs.length;
            }
          }

          const highDims = Object.entries(avgVec).filter(([, v]) => v >= 65).map(([k]) => k);
          const lowDims  = Object.entries(avgVec).filter(([, v]) => v <= 45).map(([k]) => k);

          // Detect self vs data discrepancy
          let discrepancy: string | null = null;
          const dataVecs = group.map(c => {
            try { return (c as any).data_vec ? JSON.parse((c as any).data_vec) : null; } catch { return null; }
          }).filter(Boolean);
          if (dataVecs.length > 0 && Object.keys(avgVec).length > 0) {
            const avgData: Record<string, number> = {};
            for (const key of Object.keys(dataVecs[0] as object)) {
              avgData[key] = (dataVecs as any[]).reduce((s: number, v: any) => s + (v[key] || 0), 0) / dataVecs.length;
            }
            const gapDims = Object.keys(avgVec).filter(k => avgData[k] !== undefined && Math.abs((avgVec[k] || 0) - (avgData[k] || 0)) > 15);
            if (gapDims.length > 0) {
              discrepancy = gapDims.map(d => `self rates ${d} at ${avgVec[d]?.toFixed(0)}, data shows ${avgData[d]?.toFixed(0)}`).join("; ");
            }
          }

          const uniqueDays = new Set(group.map(c => (c.timestamp || "").slice(0, 10))).size;
          byUser.get(luid)!.push({
            id: `archetype-pattern-${arch}-${luid}`,
            type: "checkin-pattern",
            label: `Identifies as ${arch}`,
            description: `Consistent ${arch} orientation across ${group.length} sessions over ${uniqueDays} days.` +
              (highDims.length ? ` Consistently high: ${highDims.join(", ")}.` : "") +
              (lowDims.length  ? ` Consistently low: ${lowDims.join(", ")}.`  : ""),
            frequency: group.length,
            contextCount: uniqueDays,
            discrepancy,
            selfArchetype: arch,
            avgVec,
            createdAt: group[0].timestamp || new Date().toISOString(),
          });
        }
      }

      // ── Decisions and writings — send individually (text-based) ───────────
      for (const d of decisions) {
        const luid = d.user_id ? userMap.get(d.user_id) : null;
        if (!luid) continue;
        if (!byUser.has(luid)) byUser.set(luid, []);
        byUser.get(luid)!.push({
          id: String(d.id), type: "decision", label: d.decision_text || "decision",
          description: d.decision_text || "", frequency: 1, contextCount: 1, createdAt: d.timestamp,
        });
      }

      for (const w of writings) {
        const luid = w.user_id ? userMap.get(w.user_id) : null;
        if (!luid) continue;
        if (!byUser.has(luid)) byUser.set(luid, []);
        byUser.get(luid)!.push({
          id: String(w.id), type: "writing", label: w.title || "writing",
          description: (w.content || "").slice(0, 500), frequency: 1, contextCount: 1, createdAt: w.timestamp,
        });
      }

      let totalSent = 0;
      const userEntries = Array.from(byUser.entries());
      for (const [lumenUserId, records] of userEntries) {
        // Send in batches of 50
        for (let i = 0; i < records.length; i += 50) {
          const batch = records.slice(i, i + 50);
          try {
            await fetch(`${LUMEN_API_URL}/api/epistemic/backfill/parallax`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-lumen-internal-token": LUMEN_INTERNAL_TOKEN!,
              },
              body: JSON.stringify({ userId: lumenUserId, records: batch }),
            });
            totalSent += batch.length;
          } catch (err) {
            console.error(`[backfill] User ${lumenUserId} batch failed:`, err);
          }
        }
      }

      return res.json({ message: "Backfill complete", sent: totalSent, users: userEntries.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/internal/from-liminal — ingest a completed Liminal session as a synthetic Parallax check-in
  app.post("/api/internal/from-liminal", async (req, res) => {
    if (!requireInternalToken(req, res)) return;

    try {
      const { lumenUserId, sessionId, toolSlug, inputText, structuredOutput, summary, createdAt } = req.body;

      if (!lumenUserId || !sessionId || !toolSlug) {
        return res.status(400).json({ error: "lumenUserId, sessionId, and toolSlug are required" });
      }

      // Find local Parallax user by lumen_user_id
      const allUsers = storage.getAllUsers();
      const user = allUsers.find((u: any) => u.lumen_user_id === lumenUserId);
      if (!user) {
        return res.status(404).json({ error: `No Parallax user found for lumenUserId: ${lumenUserId}` });
      }
      const userId: number = user.id;

      // ---- Compute dimension nudges ----
      // Scale factor: longer + richer text = stronger signal, capped at 1.0
      const textLength = (inputText || "").length;
      // Richness: count non-empty keys in structuredOutput
      const outputKeys = structuredOutput ? Object.keys(structuredOutput).length : 0;
      // Scale: 500 chars = 0.5, 2000+ chars = 1.0; outputKeys boosts up to 0.2
      const lengthScale = Math.min(1.0, textLength / 2000);
      const richnessBoost = Math.min(0.2, outputKeys * 0.03);
      const scale = Math.min(1.0, lengthScale + richnessBoost);

      // Base nudge values per tool (before scaling), max ±30
      // All base values are at ±20 so they can scale up to ±20 (well within ±30 cap)
      type NudgeMap = { focus?: number; calm?: number; agency?: number; vitality?: number; social?: number; creativity?: number; exploration?: number; drive?: number };
      const TOOL_BASE_NUDGES: Record<string, NudgeMap> = {
        "genealogist":     { agency: 20, exploration: 18, calm: -15 },
        "small-council":   { social: 20, focus: 16, calm: 18 },
        "interlocutor":    { focus: 20, drive: 18, calm: -16 },
        "fool":            { creativity: 20, exploration: 16, agency: -14 },
        "stoics-ledger":   { calm: 20, agency: 18, creativity: -14 },
        "interpreter":     { creativity: 20, exploration: 16, calm: 16 },
      };

      const baseNudges: NudgeMap = TOOL_BASE_NUDGES[toolSlug] || { exploration: 10 };

      // Apply scale and cap at ±30
      const scaledNudges: NudgeMap = {};
      for (const [dim, val] of Object.entries(baseNudges) as [keyof NudgeMap, number][]) {
        const scaled = val * scale;
        scaledNudges[dim] = Math.max(-30, Math.min(30, Math.round(scaled)));
      }

      // Build a full 8-dim data_vec starting from neutral (50) and applying nudges
      const baseVec = { focus: 50, calm: 50, agency: 50, vitality: 50, social: 50, creativity: 50, exploration: 50, drive: 50 };
      const dataVec = { ...baseVec };
      for (const [dim, nudge] of Object.entries(scaledNudges) as [keyof typeof baseVec, number][]) {
        dataVec[dim] = Math.max(0, Math.min(100, baseVec[dim] + nudge));
      }

      // Compute data_archetype from the data_vec using archetype math
      const mixture = computeMixture(dataVec);
      const dominantEntry = Object.entries(mixture).sort((a, b) => b[1] - a[1])[0];
      const dataArchetype = dominantEntry ? dominantEntry[0] : "seeker";

      // The self_vec is also neutral (this is a synthetic/external-signal check-in, no self-report)
      const selfVec = { ...baseVec };
      const selfArchetype = dataArchetype; // fallback — same as data

      const timestamp = createdAt || new Date().toISOString();

      // ---- Create the synthetic check-in ----
      const checkin = storage.createCheckin({
        user_id: userId,
        timestamp,
        self_vec: JSON.stringify(selfVec),
        data_vec: JSON.stringify(dataVec),
        self_archetype: selfArchetype,
        data_archetype: dataArchetype,
        feeling_text: summary ? `[Liminal: ${toolSlug}] ${summary}` : `[Liminal session: ${toolSlug}]`,
        spotify_summary: null,
        fitness_summary: `liminal:${toolSlug}`,
        llm_narrative: summary || null,
      });

      // ---- Create the writing record ----
      const writing = storage.createWriting({
        user_id: userId,
        timestamp,
        title: `Liminal Session — ${toolSlug} (${sessionId})`,
        content: inputText || "",
        date_written: timestamp.substring(0, 10),
        analysis: structuredOutput ? JSON.stringify(structuredOutput) : null,
        nudges: JSON.stringify(scaledNudges),
        status: "complete",
      });

      // ---- Store the liminal session record ----
      const liminalRecord = storage.createLiminalSession({
        user_id: userId,
        liminal_session_id: sessionId,
        tool_slug: toolSlug,
        input_text: inputText || null,
        structured_output: structuredOutput ? JSON.stringify(structuredOutput) : null,
        summary: summary || null,
        dimension_nudges: JSON.stringify(scaledNudges),
        checkin_id: checkin.id,
        writing_id: writing.id,
        created_at: timestamp,
      });

      // ---- Emit Lumen events (fire-and-forget) ----
      emitForRecord(userId, checkin.id, {
        label: `liminal-${toolSlug}`,
        timestamp,
        frequency: 2, // Liminal sessions always represent deliberate engagement (2+ implies recurrence signal)
        contextCount: outputKeys,
        ...(scaledNudges as any),
      }, "liminal-checkin");
      emitForRecord(userId, writing.id, {
        title: `Liminal: ${toolSlug}`,
        content: inputText || "",
        timestamp,
      }, "liminal-writing");

      // Clear relevant caches for this user
      storage.clearUserCache(userId, "discover");
      storage.clearUserCache(userId, "profile");
      storage.clearUserCache(userId, "mythology");
      storage.clearUserCache(userId, "forecast");

      return res.json({ success: true, checkinId: checkin.id, writingId: writing.id, liminalSessionId: liminalRecord.id });
    } catch (err: any) {
      console.error("[from-liminal] Error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/internal/patterns-for-lumen — export detected patterns for Praxis/Axiom
  app.get("/api/internal/patterns-for-lumen", async (req, res) => {
    if (!requireInternalToken(req, res)) return;

    try {
      const lumenUserId = req.query.lumenUserId as string;
      if (!lumenUserId) {
        return res.status(400).json({ error: "lumenUserId query param required" });
      }

      // Find local user
      const allUsers = storage.getAllUsers();
      const user = allUsers.find((u: any) => u.lumen_user_id === lumenUserId);
      if (!user) {
        return res.status(404).json({ error: `No Parallax user found for lumenUserId: ${lumenUserId}` });
      }
      const userId: number = user.id;

      // ---- Current vector: latest self_vec ----
      const recentCheckins = storage.getCheckins(userId);
      const latestCheckin = recentCheckins[0]; // already ordered desc
      let currentVector: Record<string, number> | null = null;
      if (latestCheckin?.self_vec) {
        try { currentVector = JSON.parse(latestCheckin.self_vec); } catch {}
      }

      // ---- Dominant archetype ----
      let dominantArchetype = "unknown";
      if (currentVector) {
        const arch = topArchetype(currentVector as any);
        if (arch.length > 0) dominantArchetype = arch[0].key;
      }

      // ---- Identity modes ----
      const identityModes = storage.getIdentityModes(userId);

      // ---- Recent insights (last 10 cached) ----
      let recentInsights: any[] = [];
      const discoverCache = storage.getCachedResponse(userId, "discover", 60 * 24); // last 24h
      if (discoverCache) {
        try {
          const parsed = JSON.parse(discoverCache);
          recentInsights = (parsed.insights || []).slice(0, 10);
        } catch {}
      }

      // ---- Archetype trajectory: last 30 days of archetype shifts ----
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const allCheckins = recentCheckins.filter((c: any) => c.timestamp >= thirtyDaysAgo);
      const archetypeTrajectory = allCheckins.map((c: any) => ({
        timestamp: c.timestamp,
        archetype: c.self_archetype,
        data_archetype: c.data_archetype || null,
      })).reverse(); // chronological order

      // ---- Pattern signals: analyze check-in history ----
      const patternSignals: Array<{
        type: string;
        description: string;
        confidence: number;
        firstSeen: string;
        lastSeen: string;
      }> = [];

      if (allCheckins.length >= 3) {
        // 1. Dimension trend signals: 3+ consecutive same-direction shifts
        const dims = ["focus", "calm", "agency", "vitality", "social", "creativity", "exploration", "drive"] as const;
        // Parse vectors in chronological order
        const chronCheckins = [...allCheckins].reverse();
        const parsedVecs: Array<{ ts: string; vec: Record<string, number> }> = [];
        for (const c of chronCheckins) {
          try {
            const v = JSON.parse(c.self_vec);
            parsedVecs.push({ ts: c.timestamp, vec: v });
          } catch {}
        }

        for (const dim of dims) {
          let streakDir = 0; // +1 or -1
          let streakLen = 0;
          let streakStart = 0;
          let maxStreak = 0;
          let maxStreakStart = 0;
          let maxStreakEnd = 0;

          for (let i = 1; i < parsedVecs.length; i++) {
            const prev = parsedVecs[i - 1].vec[dim] ?? 50;
            const curr = parsedVecs[i].vec[dim] ?? 50;
            const diff = curr - prev;
            const dir = diff > 1 ? 1 : diff < -1 ? -1 : 0;

            if (dir !== 0 && dir === streakDir) {
              streakLen++;
            } else if (dir !== 0) {
              streakDir = dir;
              streakLen = 1;
              streakStart = i;
            } else {
              streakLen = 0;
            }

            if (streakLen >= maxStreak) {
              maxStreak = streakLen;
              maxStreakStart = streakStart;
              maxStreakEnd = i;
            }
          }

          if (maxStreak >= 2) { // 3 consecutive data points = 2 consecutive shifts
            const direction = parsedVecs[maxStreakStart]?.vec[dim] > (parsedVecs[maxStreakStart > 0 ? maxStreakStart - 1 : 0]?.vec[dim] ?? 50) ? "rising" : "declining";
            const confidence = Math.min(0.9, 0.4 + maxStreak * 0.1);
            patternSignals.push({
              type: "dimension_trend",
              description: `${dim} consistently ${direction} over ${maxStreak + 1} consecutive sessions`,
              confidence,
              firstSeen: parsedVecs[maxStreakStart > 0 ? maxStreakStart - 1 : 0]?.ts || allCheckins[0].timestamp,
              lastSeen: parsedVecs[maxStreakEnd]?.ts || allCheckins[allCheckins.length - 1].timestamp,
            });
          }
        }

        // 2. Archetype oscillation: switching between 2+ archetypes
        const archetypeSeq = chronCheckins.map((c: any) => c.self_archetype).filter(Boolean);
        if (archetypeSeq.length >= 4) {
          const uniqueArchs = new Set(archetypeSeq);
          if (uniqueArchs.size >= 2) {
            // Count transitions
            let transitions = 0;
            for (let i = 1; i < archetypeSeq.length; i++) {
              if (archetypeSeq[i] !== archetypeSeq[i - 1]) transitions++;
            }
            const transitionRate = transitions / (archetypeSeq.length - 1);
            if (transitionRate >= 0.4) {
              const archList = Array.from(uniqueArchs).join(", ");
              patternSignals.push({
                type: "archetype_oscillation",
                description: `Oscillating between ${uniqueArchs.size} archetypes (${archList}) — transition rate ${Math.round(transitionRate * 100)}%`,
                confidence: Math.min(0.85, 0.3 + transitionRate * 0.7),
                firstSeen: chronCheckins[0].timestamp,
                lastSeen: chronCheckins[chronCheckins.length - 1].timestamp,
              });
            }
          }
        }

        // 3. Time-of-day correlations: group by morning/afternoon/evening/night
        const timeGroups: Record<string, { vecs: Record<string, number>[]; archetypes: string[] }> = {
          morning:   { vecs: [], archetypes: [] }, // 05-11
          afternoon: { vecs: [], archetypes: [] }, // 11-17
          evening:   { vecs: [], archetypes: [] }, // 17-22
          night:     { vecs: [], archetypes: [] }, // 22-05
        };
        for (const { ts, vec } of parsedVecs) {
          const hour = new Date(ts).getUTCHours();
          const slot = hour >= 5 && hour < 11 ? "morning"
            : hour >= 11 && hour < 17 ? "afternoon"
            : hour >= 17 && hour < 22 ? "evening"
            : "night";
          timeGroups[slot].vecs.push(vec);
          const matchC = chronCheckins.find((c: any) => c.timestamp === ts);
          if (matchC?.self_archetype) timeGroups[slot].archetypes.push(matchC.self_archetype);
        }

        for (const [slot, { vecs, archetypes }] of Object.entries(timeGroups)) {
          if (vecs.length < 2) continue;
          // Find dominant dim in this slot vs overall
          const slotAvg: Record<string, number> = {};
          for (const dim of dims) {
            slotAvg[dim] = vecs.reduce((s, v) => s + (v[dim] ?? 50), 0) / vecs.length;
          }
          // Find the dim with the highest deviation from 50
          const [topDim, topVal] = Object.entries(slotAvg).sort((a, b) => Math.abs(b[1] - 50) - Math.abs(a[1] - 50))[0];
          const deviation = topVal - 50;
          if (Math.abs(deviation) >= 8) {
            const dir = deviation > 0 ? "elevated" : "suppressed";
            // Find dominant archetype for this slot
            const archCounts: Record<string, number> = {};
            for (const a of archetypes) archCounts[a] = (archCounts[a] || 0) + 1;
            const dominantSlotArch = Object.entries(archCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
            patternSignals.push({
              type: "time_of_day_correlation",
              description: `${slot} sessions show ${dir} ${topDim} (avg ${Math.round(topVal)})${dominantSlotArch ? `, often as ${dominantSlotArch}` : ""}`,
              confidence: Math.min(0.8, 0.3 + vecs.length * 0.08),
              firstSeen: chronCheckins.find((c: any) => {
                const h = new Date(c.timestamp).getUTCHours();
                return slot === "morning" ? (h >= 5 && h < 11)
                  : slot === "afternoon" ? (h >= 11 && h < 17)
                  : slot === "evening" ? (h >= 17 && h < 22)
                  : (h >= 22 || h < 5);
              })?.timestamp || chronCheckins[0].timestamp,
              lastSeen: [...chronCheckins].reverse().find((c: any) => {
                const h = new Date(c.timestamp).getUTCHours();
                return slot === "morning" ? (h >= 5 && h < 11)
                  : slot === "afternoon" ? (h >= 11 && h < 17)
                  : slot === "evening" ? (h >= 17 && h < 22)
                  : (h >= 22 || h < 5);
              })?.timestamp || chronCheckins[chronCheckins.length - 1].timestamp,
            });
          }
        }
      }

      return res.json({
        currentVector,
        dominantArchetype,
        identityModes: identityModes.map((m: any) => ({
          id: m.id,
          mode_name: m.mode_name,
          dominant_archetype: m.dominant_archetype,
          centroid_vec: m.centroid_vec ? JSON.parse(m.centroid_vec) : null,
          archetype_distribution: m.archetype_distribution ? JSON.parse(m.archetype_distribution) : null,
          occurrence_count: m.occurrence_count,
          first_seen: m.first_seen,
          last_seen: m.last_seen,
        })),
        recentInsights,
        patternSignals,
        archetypeTrajectory,
      });
    } catch (err: any) {
      console.error("[patterns-for-lumen] Error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/internal/users — Oracle: list all registered users
  app.get("/api/internal/users", (req, res) => {
    if (!requireInternalToken(req, res)) return;
    try {
      const allUsers = storage.getAllUsers();
      return res.json({
        users: allUsers.map((u: any) => ({
          username:   u.username,
          createdAt:  u.created_at,
        })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/internal/sync-plan — Lumen Oracle: sync plan change
  // Maps Lumen canonical plan → Parallax pro field: free → 0, pro/founder → 1
  app.post("/api/internal/sync-plan", (req, res) => {
    if (!requireInternalToken(req, res)) return;
    try {
      const { username, email, plan } = req.body ?? {};
      if (!plan || !['free', 'pro', 'founder'].includes(plan)) {
        return res.status(400).json({ error: "Invalid plan" });
      }
      if (!username && !email) {
        return res.status(400).json({ error: "username or email required" });
      }

      // Find user by username (primary key in Parallax)
      let user: any = null;
      if (username) user = storage.getUserByUsername(username);
      // Fallback: search all users by lumen_user_id is not straightforward,
      // so username is the canonical lookup for Parallax

      if (!user) {
        return res.status(404).json({ ok: false, reason: "User not found in Parallax" });
      }

      const newPro = plan === 'free' ? 0 : 1;
      sqlite.prepare("UPDATE users SET pro = ? WHERE id = ?").run(newPro, user.id);

      console.log(`[sync-plan] Updated Parallax user ${user.username} to pro=${newPro} (from Lumen plan=${plan})`);
      return res.json({ ok: true, pro: !!newPro });
    } catch (err: any) {
      console.error("[sync-plan]", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/internal/delete-user — Lumen Oracle: delete user cascade
  app.post("/api/internal/delete-user", (req, res) => {
    if (!requireInternalToken(req, res)) return;
    try {
      const { username, email } = req.body ?? {};
      if (!username && !email) {
        return res.status(400).json({ error: "username or email required" });
      }

      let user: any = null;
      if (username) user = storage.getUserByUsername(username);

      if (!user) {
        return res.status(404).json({ ok: false, reason: "User not found in Parallax" });
      }

      storage.deleteUserAndData(user.id);
      console.log(`[delete-user] Deleted Parallax user ${user.username} (id=${user.id})`);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[delete-user]", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/loop-status — authenticated user: loop activity summary
  app.get("/api/loop-status", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const liminalSessions = storage.getLiminalSessions(userId, 50);
      const liminalToday = liminalSessions.filter((s: any) => s.created_at >= oneDayAgo);

      const lumenApiConfigured = !!(process.env.LUMEN_API_URL);
      // "patternsExported" is true when LUMEN_API_URL is set and there are any liminal sessions ever
      const patternsExported = lumenApiConfigured && liminalSessions.length > 0;
      // Downstream tools — infer from env vars if set
      const lastExportedTo: string[] = [];
      if (patternsExported) {
        if (process.env.PRAXIS_URL || lumenApiConfigured) lastExportedTo.push("praxis");
        if (process.env.AXIOM_URL || lumenApiConfigured) lastExportedTo.push("axiom");
      }

      return res.json({
        liminalSessionsToday: liminalToday.length,
        patternsExported,
        lastExportedTo,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
