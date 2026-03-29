import {
  type Checkin, type InsertCheckin, checkins,
  type Decision, type InsertDecision, decisions,
  type Writing, type InsertWriting, writings,
  type User, type InsertUser, users,
  type SpotifyListen, type InsertSpotifyListen, spotifyListens,
  type SpotifyToken, type InsertSpotifyToken, spotifyTokens,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, gte, sql, count } from "drizzle-orm";

const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/parallax.db`
  : "data.db";
const sqlite = new Database(dbPath);
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
    `);

    // Add user_id column to existing tables if they don't have it
    try { sqlite.exec("ALTER TABLE checkins ADD COLUMN user_id INTEGER"); } catch { /* column already exists */ }
    try { sqlite.exec("ALTER TABLE decisions ADD COLUMN user_id INTEGER"); } catch { /* column already exists */ }
    try { sqlite.exec("ALTER TABLE writings ADD COLUMN user_id INTEGER"); } catch { /* column already exists */ }
  }

  // ---- User methods ----
  getUserByUsername(username: string): User | undefined {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  getUserById(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  createUser(data: InsertUser): User {
    return db.insert(users).values(data).returning().get();
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

  // ---- Spotify Listens ----
  logSpotifyListen(data: InsertSpotifyListen): SpotifyListen | null {
    // Dedup: skip if the most recent entry for this user is the same track
    const userId = data.user_id;
    let lastListen: SpotifyListen | undefined;
    if (userId) {
      lastListen = db.select().from(spotifyListens)
        .where(eq(spotifyListens.user_id, userId))
        .orderBy(desc(spotifyListens.id))
        .limit(1)
        .get();
    } else {
      lastListen = db.select().from(spotifyListens)
        .orderBy(desc(spotifyListens.id))
        .limit(1)
        .get();
    }
    // If the last logged track is the same song, skip it
    if (lastListen && lastListen.track_id === data.track_id) {
      return null;
    }

    return db.insert(spotifyListens).values(data).returning().get();
  }

  getSpotifyListens(userId?: number | null, limit: number = 50): SpotifyListen[] {
    if (userId) {
      return db.select().from(spotifyListens)
        .where(eq(spotifyListens.user_id, userId))
        .orderBy(desc(spotifyListens.id))
        .limit(limit)
        .all();
    }
    return db.select().from(spotifyListens)
      .orderBy(desc(spotifyListens.id))
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
      if (listen.energy !== null && listen.energy !== undefined) {
        energySum += listen.energy;
        valenceSum += (listen.valence || 0);
        danceSum += (listen.danceability || 0);
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
}

export const storage = new DatabaseStorage();
