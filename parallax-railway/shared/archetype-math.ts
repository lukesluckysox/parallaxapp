import { DIMENSIONS, ARCHETYPES, type DimensionVec, type Dimension } from "./archetypes";

/** Cosine similarity between two dimension vectors (0-1 range) */
export function similarity(a: DimensionVec, b: DimensionVec): number {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  for (const dim of DIMENSIONS) {
    const va = a[dim] || 0;
    const vb = b[dim] || 0;
    dotProduct += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** Returns the percentage match for each archetype, normalized to sum to 100 */
export function computeMixture(vec: DimensionVec): Record<string, number> {
  const sims: Record<string, number> = {};
  let total = 0;
  for (const arch of ARCHETYPES) {
    const s = Math.max(0, similarity(vec, arch.target));
    sims[arch.key] = s;
    total += s;
  }
  const result: Record<string, number> = {};
  for (const arch of ARCHETYPES) {
    result[arch.key] = total > 0 ? Math.round((sims[arch.key] / total) * 100) : 0;
  }
  return result;
}

/** Returns archetypes sorted by highest percentage match */
export function topArchetype(vec: DimensionVec): Array<{ key: string; pct: number }> {
  const mix = computeMixture(vec);
  return Object.entries(mix)
    .map(([key, pct]) => ({ key, pct }))
    .sort((a, b) => b.pct - a.pct);
}

/** Apply impact vector to base dimensions, clamping to 0-100 */
export function applyImpact(base: DimensionVec, impact: Partial<DimensionVec>): DimensionVec {
  const result = { ...base };
  for (const dim of DIMENSIONS) {
    if (impact[dim] !== undefined) {
      result[dim] = Math.max(0, Math.min(100, (result[dim] || 50) + (impact[dim] || 0)));
    }
  }
  return result;
}

/** Merge two dimension vectors by averaging */
export function mergeVecs(a: DimensionVec, b: DimensionVec): DimensionVec {
  const result = {} as DimensionVec;
  for (const dim of DIMENSIONS) {
    result[dim] = Math.round(((a[dim] || 0) + (b[dim] || 0)) / 2);
  }
  return result;
}

/** Create a default dimension vector with all values at 50 */
export function defaultVec(): DimensionVec {
  const result = {} as DimensionVec;
  for (const dim of DIMENSIONS) {
    result[dim] = 50;
  }
  return result;
}

/** Apply nudges to a base vector (nudges can be positive or negative) */
export function applyNudges(base: DimensionVec, nudges: Partial<DimensionVec>): DimensionVec {
  const result = { ...base };
  for (const dim of DIMENSIONS) {
    if (nudges[dim] !== undefined) {
      result[dim] = Math.max(0, Math.min(100, (result[dim] || 50) + (nudges[dim] || 0)));
    }
  }
  return result;
}
