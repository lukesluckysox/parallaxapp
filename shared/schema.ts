import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  display_name: text("display_name"),
  created_at: text("created_at").notNull(),
  age: text("age"),
  gender: text("gender"),
  location: text("location"),
});

export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id"),
  timestamp: text("timestamp").notNull(),
  self_vec: text("self_vec").notNull(), // JSON string of {focus, calm, ...}
  data_vec: text("data_vec"), // JSON string of {focus, calm, ...} or null
  self_archetype: text("self_archetype").notNull(),
  data_archetype: text("data_archetype"),
  feeling_text: text("feeling_text"),
  spotify_summary: text("spotify_summary"),
  fitness_summary: text("fitness_summary"),
  llm_narrative: text("llm_narrative"),
});

export const decisions = sqliteTable("decisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id"),
  checkin_id: integer("checkin_id"),
  timestamp: text("timestamp").notNull(),
  decision_text: text("decision_text").notNull(),
  impact_vec: text("impact_vec").notNull(), // JSON string of {focus: -50..50, ...}
  target_archetype: text("target_archetype"),
  verdict: text("verdict"), // "do" | "skip" | "neutral"
  alignment_before: integer("alignment_before"),
  alignment_after: integer("alignment_after"),
});

export const writings = sqliteTable("writings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id"),
  timestamp: text("timestamp").notNull(),
  title: text("title"),
  content: text("content").notNull(),
  date_written: text("date_written"),
  analysis: text("analysis"), // JSON: {emotions, dimensions, archetype_lean, word_frequencies, narrative}
  nudges: text("nudges"), // JSON: dimension nudges computed from this writing
  status: text("status"), // "pending", "processing", "complete", "failed"
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertCheckinSchema = createInsertSchema(checkins).omit({ id: true });
export const insertDecisionSchema = createInsertSchema(decisions).omit({ id: true });
export const spotifyListens = sqliteTable("spotify_listens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id"),
  timestamp: text("timestamp").notNull(),
  track_id: text("track_id").notNull(),
  track_name: text("track_name").notNull(),
  artist_name: text("artist_name").notNull(),
  album_name: text("album_name"),
  album_art_url: text("album_art_url"),
  duration_ms: integer("duration_ms"),
  // Audio features stored as 0-100 integers
  energy: integer("energy"),
  valence: integer("valence"),
  danceability: integer("danceability"),
  acousticness: integer("acousticness"),
  instrumentalness: integer("instrumentalness"),
  tempo: integer("tempo"),
});

export const spotifyTokens = sqliteTable("spotify_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull().unique(),
  access_token: text("access_token").notNull(),
  refresh_token: text("refresh_token").notNull(),
  expires_at: text("expires_at").notNull(), // ISO timestamp
  spotify_user_id: text("spotify_user_id"),
  spotify_display_name: text("spotify_display_name"),
});

export const cachedResponses = sqliteTable("cached_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull(),
  cache_key: text("cache_key").notNull(), // e.g. "discover", "forecast", "profile", "mirror-line", "mythology"
  response_json: text("response_json").notNull(),
  created_at: text("created_at").notNull(), // ISO timestamp
});

export const identityModes = sqliteTable("identity_modes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull(),
  mode_name: text("mode_name").notNull(),
  centroid_vec: text("centroid_vec").notNull(), // JSON: {focus, calm, discipline, health, social, creativity, exploration, ambition}
  archetype_distribution: text("archetype_distribution").notNull(), // JSON: {observer: 25, builder: 30, ...}
  dominant_archetype: text("dominant_archetype").notNull(),
  conditions: text("conditions"), // JSON: {timeOfDay, musicEnergy, writingTone, etc.}
  first_seen: text("first_seen").notNull(),
  last_seen: text("last_seen").notNull(),
  occurrence_count: integer("occurrence_count").notNull(),
  checkin_ids: text("checkin_ids").notNull(), // JSON array of check-in IDs in this cluster
});

export const identityEchoes = sqliteTable("identity_echoes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull(),
  mode_id: integer("mode_id").notNull(),
  detected_at: text("detected_at").notNull(),
  similarity_score: integer("similarity_score").notNull(), // 0-100
  current_vec: text("current_vec").notNull(), // JSON
});

export const insertIdentityModeSchema = createInsertSchema(identityModes).omit({ id: true });
export const insertIdentityEchoSchema = createInsertSchema(identityEchoes).omit({ id: true });

export type InsertIdentityMode = z.infer<typeof insertIdentityModeSchema>;
export type IdentityMode = typeof identityModes.$inferSelect;
export type InsertIdentityEcho = z.infer<typeof insertIdentityEchoSchema>;
export type IdentityEcho = typeof identityEchoes.$inferSelect;

export const insertWritingSchema = createInsertSchema(writings).omit({ id: true });
export const insertSpotifyListenSchema = createInsertSchema(spotifyListens).omit({ id: true });
export const insertSpotifyTokenSchema = createInsertSchema(spotifyTokens).omit({ id: true });
export const insertCachedResponseSchema = createInsertSchema(cachedResponses).omit({ id: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertCheckin = z.infer<typeof insertCheckinSchema>;
export type Checkin = typeof checkins.$inferSelect;
export type InsertDecision = z.infer<typeof insertDecisionSchema>;
export type Decision = typeof decisions.$inferSelect;
export type InsertWriting = z.infer<typeof insertWritingSchema>;
export type Writing = typeof writings.$inferSelect;
export type InsertSpotifyListen = z.infer<typeof insertSpotifyListenSchema>;
export type SpotifyListen = typeof spotifyListens.$inferSelect;
export type InsertSpotifyToken = z.infer<typeof insertSpotifyTokenSchema>;
export type SpotifyToken = typeof spotifyTokens.$inferSelect;
export type InsertCachedResponse = z.infer<typeof insertCachedResponseSchema>;
export type CachedResponse = typeof cachedResponses.$inferSelect;
