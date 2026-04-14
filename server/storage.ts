import {
  type Checkin, type InsertCheckin, checkins,
  type Decision, type InsertDecision, decisions,
  type Writing, type InsertWriting, writings,
  type User, type InsertUser, users,
  type SpotifyListen, type InsertSpotifyListen, spotifyListens,
  type SpotifyToken, type InsertSpotifyToken, spotifyTokens,
  cachedResponses,
  type IdentityMode, type InsertIdentityMode, identityModes,
  type IdentityEcho, type InsertIdentityEcho, identityEchoes,
  type SpotifyWhitelist, type InsertSpotifyWhitelist, spotifyWhitelistQueue,
  type LiminalSession, type InsertLiminalSession, liminalSessions,
  type RecommendationFeedback, type InsertRecommendationFeedback, recommendationFeedback,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, gte, sql, count } from "drizzle-orm";
import path from "path";
import fs from "fs";

const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/parallax.db`
  : path.resolve(process.cwd(), "data.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const volumeSet = !!process.env.RAILWAY_VOLUME_MOUNT_PATH;
console.log(`[parallax/db] SQLite path: ${dbPath}`);
console.log(`[parallax/db] RAILWAY_VOLUME_MOUNT_PATH: ${process.env.RAILWAY_VOLUME_MOUNT_PATH ?? '(NOT SET)'}`);
console.log(`[parallax/db] Persistent volume: ${volumeSet ? 'YES' : 'NO \u2014 data will be lost on redeploy'}`);
if (!volumeSet) {
  console.warn('[parallax/db] \u26a0\ufe0f  Set RAILWAY_VOLUME_MOUNT_PATH in Railway Variables to persist data across deploys.');
}
const dbExists = fs.existsSync(dbPath);
console.log(`[parallax/db] DB file exists: ${dbExists}${dbExists ? ` (${(fs.statSync(dbPath).size / 1024).toFixed(1)} KB)` : ' \u2014 will create fresh'}`);

export const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  // User methods
  getUserByUsername(username: string): User | undefined;
  getUserById(id: number): User | undefined;
  createUser(data: InsertUser): User;

  // Data methods — all support optional userId filtering
  getCheckins(userId?: number | null): Checkin[];
  createCheckin(checkin: InsertCheckin): Checkin;
  getDecisions(userId?: number | null): Decision[];
  createDecision(decision: InsertDecision): Decision;
  getWritings(limit?: number, userId?: number | null): Writing[];
  createWriting(data: InsertWriting): Writing;
  getWritingById(id: number): Writing | undefined;
  deleteWriting(id: number, userId: number): boolean;

  // Spotify methods
  logSpotifyListen(data: InsertSpotifyListen): SpotifyListen | null;
  getSpotifyListens(userId?: number | null, limit?: number): SpotifyListen[];
  getSpotifyListensByDay(userId?: number | null, days?: number): { date: string; tracks: SpotifyListen[]; totalMinutes: number; trackCount: number }[];
  getSpotifyStats(userId?: number | null): {
    totalTracks: number;
    totalMinutes: number;
    uniqueArtists: number;
    avgEnergy: number;
    avgValence: number;
    avgDanceability: number;
    topArtists: { name: string; count: number }[];
  };

  // Spotify token methods
  getSpotifyToken(userId: number): SpotifyToken | undefined;
  saveSpotifyToken(data: InsertSpotifyToken): SpotifyToken;
  deleteSpotifyToken(userId: number): void;

  // Cache methods
  getCachedResponse(userId: number, cacheKey: string, maxAgeMinutes: number): string | null;
  setCachedResponse(userId: number, cacheKey: string, responseJson: string): void;
  clearUserCache(userId: number, cacheKey?: string): void;

  // Writing update method
  updateWritingAnalysis(id: number, analysis: string, nudges: string, status: string): void;

  // Identity mode methods
  getIdentityModes(userId: number): IdentityMode[];
  saveIdentityModes(userId: number, modes: InsertIdentityMode[]): void;
  getIdentityEchoes(userId: number, limit?: number): IdentityEcho[];
  saveIdentityEcho(data: InsertIdentityEcho): IdentityEcho;
  getActiveEcho(userId: number): (IdentityEcho & { mode_name: string; dominant_archetype: string }) | null;

  // Account deletion
  deleteUserAndData(userId: number): void;

  // Spotify whitelist queue
  addWhitelistRequest(data: InsertSpotifyWhitelist): SpotifyWhitelist;
  getWhitelistQueue(): SpotifyWhitelist[];
  deleteWhitelistRequest(id: number): void;
  getWhitelistRequestByEmail(email: string): SpotifyWhitelist | undefined;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Ensure tables exist
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        timestamp TEXT NOT NULL,
        self_vec TEXT NOT NULL,
        data_vec TEXT,
        self_archetype TEXT NOT NULL,
        data_archetype TEXT,
        feeling_text TEXT,
        spotify_summary TEXT,
        fitness_summary TEXT,
        llm_narrative TEXT
      );
      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        checkin_id INTEGER,
        timestamp TEXT NOT NULL,
        decision_text TEXT NOT NULL,
        impact_vec TEXT NOT NULL,
        target_archetype TEXT,
        verdict TEXT,
        alignment_before INTEGER,
        alignment_after INTEGER
      );
      CREATE TABLE IF NOT EXISTS writings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        timestamp TEXT NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        date_written TEXT,
        analysis TEXT,
        nudges TEXT
      );
      CREATE TABLE IF NOT EXISTS spotify_listens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        timestamp TEXT NOT NULL,
        track_id TEXT NOT NULL,
        track_name TEXT NOT NULL,
        artist_name TEXT NOT NULL,
        album_name TEXT,
        album_art_url TEXT,
        duration_ms INTEGER,
        energy INTEGER,
        valence INTEGER,
        danceability INTEGER,
        acousticness INTEGER,
        instrumentalness INTEGER,
        tempo INTEGER
      );
      CREATE TABLE IF NOT EXISTS spotify_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        spotify_user_id TEXT,
        spotify_display_name TEXT
      );
      CREATE TABLE IF NOT EXISTS cached_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        cache_key TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS identity_modes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        mode_name TEXT NOT NULL,
        centroid_vec TEXT NOT NULL,
        archetype_distribution TEXT NOT NULL,
        dominant_archetype TEXT NOT NULL,
        conditions TEXT,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        occurrence_count INTEGER NOT NULL,
        checkin_ids TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS spotify_whitelist_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        username TEXT NOT NULL,
        requested_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS identity_echoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        mode_id INTEGER NOT NULL,
        detected_at TEXT NOT NULL,
        similarity_score INTEGER NOT NULL,
        current_vec TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS variant_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        variant_name TEXT NOT NULL,
        primary_archetype TEXT NOT NULL,
        secondary_archetype TEXT,
        description TEXT,
        emergent_traits TEXT,
        exploration_channels TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT
      );
      CREATE TABLE IF NOT EXISTS liminal_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        liminal_session_id TEXT NOT NULL,
        tool_slug TEXT NOT NULL,
        input_text TEXT,
        structured_output TEXT,
        summary TEXT,
        dimension_nudges TEXT,
        checkin_id INTEGER,
        writing_id INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recommendation_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        section TEXT NOT NULL,
        item_id TEXT NOT NULL,
        feedback_type TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // Migrate dimension names: discipline→agency, health→vitality, ambition→drive
    try {
      const KEY_MAP: Record<string, string> = { discipline: "agency", health: "vitality", ambition: "drive" };
      const migrateVec = (json: string): string => {
        try {
          const obj = JSON.parse(json);
          let changed = false;
          for (const [oldKey, newKey] of Object.entries(KEY_MAP)) {
            if (oldKey in obj && !(newKey in obj)) {
              obj[newKey] = obj[oldKey];
              delete obj[oldKey];
              changed = true;
            }
          }
          return changed ? JSON.stringify(obj) : json;
        } catch { return json; }
      };
      // Migrate checkins
      const checkins = sqlite.prepare("SELECT id, self_vec, data_vec FROM checkins").all() as any[];
      const updateStmt = sqlite.prepare("UPDATE checkins SET self_vec = ?, data_vec = ? WHERE id = ?");
      for (const c of checkins) {
        const newSelf = c.self_vec ? migrateVec(c.self_vec) : c.self_vec;
        const newData = c.data_vec ? migrateVec(c.data_vec) : c.data_vec;
        if (newSelf !== c.self_vec || newData !== c.data_vec) {
          updateStmt.run(newSelf, newData, c.id);
        }
      }
      // Migrate identity_modes centroids
      const modes = sqlite.prepare("SELECT id, centroid_vec FROM identity_modes").all() as any[];
      const updateMode = sqlite.prepare("UPDATE identity_modes SET centroid_vec = ? WHERE id = ?");
      for (const m of modes) {
        const newVec = m.centroid_vec ? migrateVec(m.centroid_vec) : m.centroid_vec;
        if (newVec !== m.centroid_vec) updateMode.run(newVec, m.id);
      }
      console.log(`[migration] Dimension rename: checked ${checkins.length} checkins, ${modes.length} modes`);
    } catch (e) {
      console.error("Dimension migration error (non-fatal):", e);
    }

    // Add user_id column to existing tables if they don't have it
    try { sqlite.exec("ALTER TABLE checkins ADD COLUMN user_id INTEGER"); } catch { /* column already exists */ }
    try { sqlite.exec("ALTER TABLE decisions ADD COLUMN user_id INTEGER"); } catch { /* column already exists */ }
    try { sqlite.exec("ALTER TABLE writings ADD COLUMN user_id INTEGER"); } catch { /* column already exists */ }
    try { sqlite.exec("ALTER TABLE writings ADD COLUMN status TEXT DEFAULT 'complete'"); } catch { /* column already exists */ }
    try { sqlite.exec("ALTER TABLE users ADD COLUMN age TEXT"); } catch { /* already exists */ }
    try { sqlite.exec("ALTER TABLE users ADD COLUMN gender TEXT"); } catch { /* already exists */ }
    try { sqlite.exec("ALTER TABLE users ADD COLUMN location TEXT"); } catch { /* already exists */ }
    try {
      sqlite.exec("ALTER TABLE users ADD COLUMN calibrated INTEGER DEFAULT 0");
      sqlite.exec("UPDATE users SET calibrated = 1 WHERE calibrated = 0 AND id IN (SELECT DISTINCT user_id FROM checkins)");
    } catch { /* already exists */ }
    try { sqlite.exec("ALTER TABLE users ADD COLUMN email TEXT"); } catch { /* already exists */ }
    try { sqlite.exec("ALTER TABLE users ADD COLUMN pro INTEGER DEFAULT 0"); } catch { /* already exists */ }
    try { sqlite.exec("ALTER TABLE users ADD COLUMN lumen_user_id TEXT"); } catch { /* already exists */ }
  }

  // ---- User methods ----
  // Use raw SQLite for user lookups because `pro` and `calibrated` columns
  // were added via ALTER TABLE and Drizzle's schema doesn't know about them.
  getUserByUsername(username: string): User | undefined {
    const row = sqlite.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    if (!row) return undefined;
    return { ...row, pro: !!row.pro, calibrated: !!row.calibrated } as User;
  }

  getUserById(id: number): User | undefined {
    const row = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    if (!row) return undefined;
    return { ...row, pro: !!row.pro, calibrated: !!row.calibrated } as User;
  }

  createUser(data: InsertUser): User {
    return db.insert(users).values(data).returning().get();
  }

  setLumenUserId(userId: number, lumenUserId: string): void {
    sqlite.prepare("UPDATE users SET lumen_user_id = ? WHERE id = ?").run(lumenUserId, userId);
  }

  getAllUsers(): any[] {
    return sqlite.prepare("SELECT * FROM users").all() as any[];
  }

  getAllCheckins(): any[] {
    return sqlite.prepare("SELECT * FROM checkins ORDER BY id").all() as any[];
  }

  getAllDecisions(): any[] {
    return sqlite.prepare("SELECT * FROM decisions ORDER BY id").all() as any[];
  }

  getAllWritings(): any[] {
    return sqlite.prepare("SELECT * FROM writings ORDER BY id").all() as any[];
  }

  // ---- Checkins ----
  getCheckins(userId?: number | null): Checkin[] {
    if (userId) {
      return db.select().from(checkins).where(eq(checkins.user_id, userId)).orderBy(desc(checkins.id)).limit(50).all();
    }
    return db.select().from(checkins).orderBy(desc(checkins.id)).limit(50).all();
  }

  createCheckin(checkin: InsertCheckin): Checkin {
    return db.insert(checkins).values(checkin).returning().get();
  }

  // ---- Decisions ----
  getDecisions(userId?: number | null): Decision[] {
    if (userId) {
      return db.select().from(decisions).where(eq(decisions.user_id, userId)).orderBy(desc(decisions.id)).limit(50).all();
    }
    return db.select().from(decisions).orderBy(desc(decisions.id)).limit(50).all();
  }

  createDecision(decision: InsertDecision): Decision {
    return db.insert(decisions).values(decision).returning().get();
  }

  // ---- Writings ----
  getWritings(limit: number = 50, userId?: number | null): Writing[] {
    if (userId) {
      return db.select().from(writings).where(eq(writings.user_id, userId)).orderBy(desc(writings.id)).limit(limit).all();
    }
    return db.select().from(writings).orderBy(desc(writings.id)).limit(limit).all();
  }

  createWriting(data: InsertWriting): Writing {
    return db.insert(writings).values(data).returning().get();
  }

  getWritingById(id: number): Writing | undefined {
    return db.select().from(writings).where(eq(writings.id, id)).get();
  }

  deleteWriting(id: number, userId: number): boolean {
    const writing = db.select().from(writings).where(eq(writings.id, id)).get();
    if (!writing || writing.user_id !== userId) return false;
    db.delete(writings).where(eq(writings.id, id)).run();
    return true;
  }

  // ---- Spotify Listens ----
  logSpotifyListen(data: InsertSpotifyListen): SpotifyListen | null {
    // Dedup: skip if this exact track_id was logged for this user in the last 30 minutes
    const userId = data.user_id;
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    if (userId) {
      const recent = db.select().from(spotifyListens)
        .where(and(
          eq(spotifyListens.user_id, userId),
          eq(spotifyListens.track_id, data.track_id),
          gte(spotifyListens.timestamp, thirtyMinAgo)
        ))
        .get();
      if (recent) return null;
    } else {
      const recent = db.select().from(spotifyListens)
        .where(and(
          eq(spotifyListens.track_id, data.track_id),
          gte(spotifyListens.timestamp, thirtyMinAgo)
        ))
        .get();
      if (recent) return null;
    }

    return db.insert(spotifyListens).values(data).returning().get();
  }

  getSpotifyListens(userId?: number | null, limit: number = 50): SpotifyListen[] {
    if (userId) {
      return db.select().from(spotifyListens)
        .where(eq(spotifyListens.user_id, userId))
        .orderBy(desc(spotifyListens.timestamp))
        .limit(limit)
        .all();
    }
    return db.select().from(spotifyListens)
      .orderBy(desc(spotifyListens.timestamp))
      .limit(limit)
      .all();
  }

  getSpotifyListensByDay(userId?: number | null, days: number = 7): { date: string; tracks: SpotifyListen[]; totalMinutes: number; trackCount: number }[] {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    let listens: SpotifyListen[];
    if (userId) {
      listens = db.select().from(spotifyListens)
        .where(and(eq(spotifyListens.user_id, userId), gte(spotifyListens.timestamp, cutoff)))
        .orderBy(desc(spotifyListens.timestamp))
        .all();
    } else {
      listens = db.select().from(spotifyListens)
        .where(gte(spotifyListens.timestamp, cutoff))
        .orderBy(desc(spotifyListens.timestamp))
        .all();
    }

    // Group by day
    const groups: Map<string, SpotifyListen[]> = new Map();
    for (const listen of listens) {
      const date = listen.timestamp.substring(0, 10); // YYYY-MM-DD
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)!.push(listen);
    }

    return Array.from(groups.entries()).map(([date, tracks]) => ({
      date,
      tracks,
      totalMinutes: Math.round(tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0) / 60000),
      trackCount: tracks.length,
    }));
  }

  getSpotifyStats(userId?: number | null): {
    totalTracks: number;
    totalMinutes: number;
    uniqueArtists: number;
    avgEnergy: number;
    avgValence: number;
    avgDanceability: number;
    topArtists: { name: string; count: number }[];
  } {
    let listens: SpotifyListen[];
    if (userId) {
      listens = db.select().from(spotifyListens)
        .where(eq(spotifyListens.user_id, userId))
        .all();
    } else {
      listens = db.select().from(spotifyListens).all();
    }

    if (listens.length === 0) {
      return { totalTracks: 0, totalMinutes: 0, uniqueArtists: 0, avgEnergy: 0, avgValence: 0, avgDanceability: 0, topArtists: [] };
    }

    const totalMinutes = Math.round(listens.reduce((sum, t) => sum + (t.duration_ms || 0), 0) / 60000);
    const artistCounts: Map<string, number> = new Map();
    let energySum = 0, valenceSum = 0, danceSum = 0;
    let featureCount = 0;

    for (const listen of listens) {
      artistCounts.set(listen.artist_name, (artistCounts.get(listen.artist_name) || 0) + 1);
      // Energy is stored as 0-100 integer, check for truthy (0 is valid but rare)
      const e = listen.energy;
      if (e !== null && e !== undefined && typeof e === "number" && e >= 0) {
        energySum += e;
        valenceSum += (listen.valence ?? 0);
        danceSum += (listen.danceability ?? 0);
        featureCount++;
      }
    }

    const topArtists = Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return {
      totalTracks: listens.length,
      totalMinutes,
      uniqueArtists: artistCounts.size,
      avgEnergy: featureCount > 0 ? Math.round(energySum / featureCount) : 0,
      avgValence: featureCount > 0 ? Math.round(valenceSum / featureCount) : 0,
      avgDanceability: featureCount > 0 ? Math.round(danceSum / featureCount) : 0,
      topArtists,
    };
  }

  // ---- Spotify Token Methods ----
  getSpotifyToken(userId: number): SpotifyToken | undefined {
    return db.select().from(spotifyTokens).where(eq(spotifyTokens.user_id, userId)).get();
  }

  saveSpotifyToken(data: InsertSpotifyToken): SpotifyToken {
    // Upsert: try update first, then insert
    const existing = db.select().from(spotifyTokens).where(eq(spotifyTokens.user_id, data.user_id)).get();
    if (existing) {
      db.update(spotifyTokens)
        .set({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
          spotify_user_id: data.spotify_user_id ?? existing.spotify_user_id,
          spotify_display_name: data.spotify_display_name ?? existing.spotify_display_name,
        })
        .where(eq(spotifyTokens.user_id, data.user_id))
        .run();
      return db.select().from(spotifyTokens).where(eq(spotifyTokens.user_id, data.user_id)).get()!;
    }
    return db.insert(spotifyTokens).values(data).returning().get();
  }

  deleteSpotifyToken(userId: number): void {
    db.delete(spotifyTokens).where(eq(spotifyTokens.user_id, userId)).run();
  }

  // ---- Cache Methods ----
  getCachedResponse(userId: number, cacheKey: string, maxAgeMinutes: number): string | null {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
    const row = db.select().from(cachedResponses)
      .where(and(
        eq(cachedResponses.user_id, userId),
        eq(cachedResponses.cache_key, cacheKey),
        gte(cachedResponses.created_at, cutoff)
      ))
      .orderBy(desc(cachedResponses.created_at))
      .get();
    return row?.response_json || null;
  }

  setCachedResponse(userId: number, cacheKey: string, responseJson: string): void {
    // Delete old entries for this user+key
    db.delete(cachedResponses).where(
      and(eq(cachedResponses.user_id, userId), eq(cachedResponses.cache_key, cacheKey))
    ).run();
    // Insert new
    db.insert(cachedResponses).values({
      user_id: userId,
      cache_key: cacheKey,
      response_json: responseJson,
      created_at: new Date().toISOString(),
    }).run();
  }

  clearUserCache(userId: number, cacheKey?: string): void {
    if (cacheKey) {
      db.delete(cachedResponses).where(
        and(eq(cachedResponses.user_id, userId), eq(cachedResponses.cache_key, cacheKey))
      ).run();
    } else {
      db.delete(cachedResponses).where(eq(cachedResponses.user_id, userId)).run();
    }
  }

  // ---- Writing Analysis Update ----
  updateWritingAnalysis(id: number, analysis: string, nudges: string, status: string): void {
    db.update(writings)
      .set({ analysis, nudges, status })
      .where(eq(writings.id, id))
      .run();
  }

  // ---- Identity Mode Methods ----
  getIdentityModes(userId: number): IdentityMode[] {
    return db.select().from(identityModes)
      .where(eq(identityModes.user_id, userId))
      .orderBy(desc(identityModes.occurrence_count))
      .all();
  }

  saveIdentityModes(userId: number, modes: InsertIdentityMode[]): void {
    // Clear existing modes for this user
    db.delete(identityModes).where(eq(identityModes.user_id, userId)).run();
    // Insert new modes
    for (const mode of modes) {
      db.insert(identityModes).values(mode).run();
    }
  }

  getIdentityEchoes(userId: number, limit: number = 20): IdentityEcho[] {
    return db.select().from(identityEchoes)
      .where(eq(identityEchoes.user_id, userId))
      .orderBy(desc(identityEchoes.detected_at))
      .limit(limit)
      .all();
  }

  saveIdentityEcho(data: InsertIdentityEcho): IdentityEcho {
    return db.insert(identityEchoes).values(data).returning().get();
  }

  getActiveEcho(userId: number): (IdentityEcho & { mode_name: string; dominant_archetype: string }) | null {
    // Get most recent echo from the last 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const echo = db.select().from(identityEchoes)
      .where(and(eq(identityEchoes.user_id, userId), gte(identityEchoes.detected_at, cutoff)))
      .orderBy(desc(identityEchoes.detected_at))
      .get();
    if (!echo) return null;

    const mode = db.select().from(identityModes)
      .where(eq(identityModes.id, echo.mode_id))
      .get();
    if (!mode) return null;

    return { ...echo, mode_name: mode.mode_name, dominant_archetype: mode.dominant_archetype };
  }

  // ---- Admin Stats ----
  getAllUsersWithStats(): any[] {
    const rows = sqlite.prepare(`
      SELECT 
        u.id, u.username, u.display_name, u.created_at, u.age, u.gender, u.location, u.pro,
        (SELECT COUNT(*) FROM checkins WHERE user_id = u.id) as checkin_count,
        (SELECT COUNT(*) FROM writings WHERE user_id = u.id) as writing_count,
        (SELECT COUNT(*) FROM spotify_listens WHERE user_id = u.id) as listen_count,
        (SELECT COUNT(*) FROM spotify_tokens WHERE user_id = u.id) as spotify_connected,
        (SELECT MAX(timestamp) FROM checkins WHERE user_id = u.id) as last_checkin,
        (SELECT MAX(timestamp) FROM writings WHERE user_id = u.id) as last_writing
      FROM users u
      ORDER BY u.created_at DESC
    `).all();
    return rows;
  }

  getAggregateStats(): { totalUsers: number; totalCheckins: number; totalWritings: number; totalListens: number } {
    const totalUsers = (sqlite.prepare("SELECT COUNT(*) as c FROM users").get() as any)?.c || 0;
    const totalCheckins = (sqlite.prepare("SELECT COUNT(*) as c FROM checkins").get() as any)?.c || 0;
    const totalWritings = (sqlite.prepare("SELECT COUNT(*) as c FROM writings").get() as any)?.c || 0;
    const totalListens = (sqlite.prepare("SELECT COUNT(*) as c FROM spotify_listens").get() as any)?.c || 0;
    return { totalUsers, totalCheckins, totalWritings, totalListens };
  }

  // ---- Spotify Whitelist Queue ----
  addWhitelistRequest(data: InsertSpotifyWhitelist): SpotifyWhitelist {
    return db.insert(spotifyWhitelistQueue).values(data).returning().get();
  }

  getWhitelistQueue(): SpotifyWhitelist[] {
    return db.select().from(spotifyWhitelistQueue).orderBy(desc(spotifyWhitelistQueue.requested_at)).all();
  }

  deleteWhitelistRequest(id: number): void {
    db.delete(spotifyWhitelistQueue).where(eq(spotifyWhitelistQueue.id, id)).run();
  }

  getWhitelistRequestByEmail(email: string): SpotifyWhitelist | undefined {
    return db.select().from(spotifyWhitelistQueue).where(eq(spotifyWhitelistQueue.email, email)).get();
  }

  // ---- Variant History Methods ----
  getVariantHistory(userId: number): any[] {
    return sqlite.prepare(
      "SELECT * FROM variant_history WHERE user_id = ? ORDER BY started_at DESC"
    ).all(userId) as any[];
  }

  logVariant(userId: number, variant: {
    variant_name: string;
    primary_archetype: string;
    secondary_archetype?: string | null;
    description?: string;
    emergent_traits?: string[];
    exploration_channels?: string[];
  }): void {
    // End the previous active variant (where ended_at IS NULL)
    const now = new Date().toISOString();
    sqlite.prepare(
      "UPDATE variant_history SET ended_at = ? WHERE user_id = ? AND ended_at IS NULL"
    ).run(now, userId);
    // Insert the new variant
    sqlite.prepare(
      `INSERT INTO variant_history (user_id, variant_name, primary_archetype, secondary_archetype, description, emergent_traits, exploration_channels, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      variant.variant_name,
      variant.primary_archetype,
      variant.secondary_archetype || null,
      variant.description || null,
      variant.emergent_traits ? JSON.stringify(variant.emergent_traits) : null,
      variant.exploration_channels ? JSON.stringify(variant.exploration_channels) : null,
      now
    );
  }

  getLastVariant(userId: number): any | null {
    return sqlite.prepare(
      "SELECT * FROM variant_history WHERE user_id = ? ORDER BY started_at DESC LIMIT 1"
    ).get(userId) as any | null;
  }

  // ---- Liminal Sessions ----
  createLiminalSession(data: InsertLiminalSession): LiminalSession {
    return db.insert(liminalSessions).values(data).returning().get();
  }

  getLiminalSessions(userId: number, limit: number = 50): LiminalSession[] {
    return db.select().from(liminalSessions)
      .where(eq(liminalSessions.user_id, userId))
      .orderBy(desc(liminalSessions.created_at))
      .limit(limit)
      .all();
  }

  updateLiminalSessionIds(id: number, checkinId: number, writingId: number): void {
    sqlite.prepare("UPDATE liminal_sessions SET checkin_id = ?, writing_id = ? WHERE id = ?")
      .run(checkinId, writingId, id);
  }

  // ---- Recommendation Feedback ----
  logRecommendationFeedback(data: InsertRecommendationFeedback): RecommendationFeedback {
    return db.insert(recommendationFeedback).values(data).returning().get();
  }

  getRecommendationFeedback(userId: number): RecommendationFeedback[] {
    return db.select().from(recommendationFeedback)
      .where(eq(recommendationFeedback.user_id, userId))
      .orderBy(desc(recommendationFeedback.created_at))
      .limit(100)
      .all();
  }

  // ---- Account Deletion ----
  deleteUserAndData(userId: number): void {
    sqlite.exec(`DELETE FROM checkins WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM writings WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM decisions WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM spotify_listens WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM spotify_tokens WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM cached_responses WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM identity_modes WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM identity_echoes WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM variant_history WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM liminal_sessions WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM recommendation_feedback WHERE user_id = ${userId}`);
    sqlite.exec(`DELETE FROM users WHERE id = ${userId}`);
  }
}

export const storage = new DatabaseStorage();
