import { DIMENSIONS, type DimensionVec } from "./archetypes";
import { topArchetype } from "./archetype-math";

/** Invert a dimension vector across the 0–100 scale: ghost = 100 - x */
export function invertVec(vec: DimensionVec): DimensionVec {
  const ghost = {} as DimensionVec;
  for (const dim of DIMENSIONS) {
    ghost[dim] = 100 - (vec[dim] ?? 50);
  }
  return ghost;
}

/** Derive full ghost profile metadata from a current dimension vector */
export function deriveGhostProfile(currentVec: DimensionVec) {
  const ghostVec = invertVec(currentVec);
  const ranked = topArchetype(ghostVec);
  const dominant = ranked[0];
  const secondary = ranked.length > 1 ? ranked[1] : null;

  return {
    ghostVec,
    dominantArchetype: dominant.key,
    dominantPct: dominant.pct,
    secondaryArchetype: secondary ? secondary.key : null,
    secondaryPct: secondary ? secondary.pct : null,
    ranked,
  };
}
