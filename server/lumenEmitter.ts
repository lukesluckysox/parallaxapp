// server/lumenEmitter.ts

const LUMEN_API_URL = process.env.LUMEN_API_URL;
const LUMEN_INTERNAL_TOKEN = process.env.LUMEN_INTERNAL_TOKEN;

export interface ParallaxLumenEvent {
  userId: string;
  sourceRecordId: string;
  eventType: "pattern_candidate" | "identity_discrepancy" | "hypothesis_candidate" | "belief_candidate";
  confidence: number;
  salience: number;
  domain?: string;
  tags?: string[];
  evidence?: string[];
  payload?: Record<string, unknown>;
  ingestionMode?: "live" | "backfill";
  createdAt?: string;
}

export async function emitLumenEvent(event: ParallaxLumenEvent): Promise<void> {
  if (!LUMEN_API_URL || !LUMEN_INTERNAL_TOKEN) return;
  try {
    await fetch(`${LUMEN_API_URL}/api/epistemic/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-lumen-internal-token": LUMEN_INTERNAL_TOKEN },
      body: JSON.stringify({ ...event, sourceApp: "parallax" }),
    });
  } catch (e) {
    console.error("[LumenEmitter:Parallax] Failed:", e);
    // Never throw
  }
}

type EmittableEventType = "pattern_candidate" | "identity_discrepancy" | "hypothesis_candidate" | "belief_candidate";

// Pattern signal classifier — enriches records with higher-signal event types.
// All sensitivity gating happens on Lumen's side (processEvent / epistemicPromotion).
// This classifier just tags what the record looks like; Lumen decides what to promote.
export function classifyParallaxRecord(record: any): Array<{ eventType: EmittableEventType; confidence: number; salience: number; payload: any }> {
  const results: Array<{ eventType: EmittableEventType; confidence: number; salience: number; payload: any }> = [];

  // Pattern candidate: repeated occurrence across contexts
  const frequency = record.frequency ?? record.count ?? record.occurrences ?? 1;
  const contextCount = record.contextCount ?? record.contexts?.length ?? 1;
  if (frequency >= 2) {
    const conf = Math.min(0.4 + (frequency / 10) + (contextCount >= 2 ? 0.2 : 0), 1.0);
    results.push({
      eventType: "pattern_candidate" as const,
      confidence: conf,
      salience: conf,
      payload: { frequency, contextCount, patternDescription: record.label ?? record.title ?? record.description ?? "" }
    });
  }

  // Identity discrepancy: stated self-model vs observed behavior
  const hasDiscrepancy = record.discrepancy || record.inconsistency || record.gap ||
    (record.stated && record.observed && record.stated !== record.observed);
  if (hasDiscrepancy) {
    results.push({
      eventType: "identity_discrepancy" as const,
      confidence: 0.7,
      salience: 0.9,
      payload: { discrepancyNote: record.discrepancy ?? `stated: ${record.stated}, observed: ${record.observed}` }
    });
  }

  // Hypothesis candidate: manipulable lever detected
  const levers = ["timing","environment","friction","sleep","accountability","novelty","social","routine","diet","exercise","stress","energy"];
  const lever = levers.find(l => JSON.stringify(record).toLowerCase().includes(l));
  if (lever && frequency >= 2) {
    results.push({
      eventType: "hypothesis_candidate" as const,
      confidence: 0.55,
      salience: 0.7,
      payload: { lever, frequency, contextCount, causalStructure: true }
    });
  }

  // No confidence filter here — Lumen's processEvent applies user sensitivity thresholds
  return results;
}
