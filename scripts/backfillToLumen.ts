// scripts/backfillToLumen.ts
// Reads all existing Parallax records and POSTs batches to Lumen's backfill endpoint.
// Usage: npx tsx scripts/backfillToLumen.ts

import Database from "better-sqlite3";

const LUMEN_API_URL = process.env.LUMEN_API_URL;
const LUMEN_INTERNAL_TOKEN = process.env.LUMEN_INTERNAL_TOKEN;

if (!LUMEN_API_URL || !LUMEN_INTERNAL_TOKEN) {
  console.error("Missing LUMEN_API_URL or LUMEN_INTERNAL_TOKEN env vars");
  process.exit(1);
}

const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/parallax.db`
  : "data.db";

const sqlite = new Database(dbPath);

interface UserRow {
  id: number;
  username: string;
  lumen_user_id: string | null;
}

interface RecordRow {
  id: number;
  user_id: number;
  timestamp: string;
  [key: string]: any;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function backfill() {
  const users = sqlite.prepare("SELECT id, username, lumen_user_id FROM users WHERE lumen_user_id IS NOT NULL").all() as UserRow[];
  console.log(`[backfill] Found ${users.length} users with lumen_user_id`);

  if (users.length === 0) {
    console.log("[backfill] No users with lumen_user_id — nothing to backfill.");
    return;
  }

  const userMap = new Map<number, string>();
  for (const u of users) {
    if (u.lumen_user_id) userMap.set(u.id, u.lumen_user_id);
  }

  // Gather all records by user
  const checkins = sqlite.prepare("SELECT * FROM checkins ORDER BY id").all() as RecordRow[];
  const decisions = sqlite.prepare("SELECT * FROM decisions ORDER BY id").all() as RecordRow[];
  const writings = sqlite.prepare("SELECT * FROM writings ORDER BY id").all() as RecordRow[];

  console.log(`[backfill] Records: ${checkins.length} checkins, ${decisions.length} decisions, ${writings.length} writings`);

  // Group all records by lumen user
  const byUser = new Map<string, any[]>();

  for (const c of checkins) {
    const luid = c.user_id ? userMap.get(c.user_id) : null;
    if (!luid) continue;
    if (!byUser.has(luid)) byUser.set(luid, []);
    byUser.get(luid)!.push({
      id: String(c.id),
      type: "checkin",
      label: c.self_archetype || "checkin",
      description: c.feeling_text || "",
      frequency: 1,
      contextCount: 1,
      createdAt: c.timestamp,
    });
  }

  for (const d of decisions) {
    const luid = d.user_id ? userMap.get(d.user_id) : null;
    if (!luid) continue;
    if (!byUser.has(luid)) byUser.set(luid, []);
    byUser.get(luid)!.push({
      id: String(d.id),
      type: "decision",
      label: d.decision_text || "decision",
      description: d.decision_text || "",
      frequency: 1,
      contextCount: 1,
      trigger: d.verdict || null,
      createdAt: d.timestamp,
    });
  }

  for (const w of writings) {
    const luid = w.user_id ? userMap.get(w.user_id) : null;
    if (!luid) continue;
    if (!byUser.has(luid)) byUser.set(luid, []);
    byUser.get(luid)!.push({
      id: String(w.id),
      type: "writing",
      label: w.title || "writing",
      description: (w.content || "").slice(0, 500),
      frequency: 1,
      contextCount: 1,
      createdAt: w.timestamp,
    });
  }

  let totalSent = 0;
  for (const [lumenUserId, records] of byUser.entries()) {
    const batches = chunk(records, 50);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const resp = await fetch(`${LUMEN_API_URL}/api/epistemic/backfill/parallax`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-lumen-internal-token": LUMEN_INTERNAL_TOKEN!,
          },
          body: JSON.stringify({
            userId: lumenUserId,
            records: batch,
          }),
        });
        totalSent += batch.length;
        console.log(`[backfill] User ${lumenUserId} batch ${i + 1}/${batches.length}: ${resp.status} (${batch.length} records)`);
      } catch (err) {
        console.error(`[backfill] User ${lumenUserId} batch ${i + 1} failed:`, err);
      }
    }
  }

  console.log(`[backfill] Complete. Sent ${totalSent} records for ${byUser.size} users.`);
}

backfill().catch((err) => {
  console.error("[backfill] Fatal error:", err);
  process.exit(1);
});
