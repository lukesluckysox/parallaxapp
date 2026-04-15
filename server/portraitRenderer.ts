import type { DimensionVec } from "@shared/archetypes";

interface RendererInput {
  dimensionVec: DimensionVec;
  dominantArchetype: string;
  secondaryArchetype: string | null;
  activeModes: string[];
  recentTensions: string[];
  motifKeywords: string[];
  spotifyEnergyProfile?: { energy: number; valence: number };
  previousReflection?: string;
}

interface GlyphElement {
  type: "circle" | "rect" | "arc" | "spiral" | "line" | "crack";
  cx: number;
  cy: number;
  size: number;
  color: string;
  opacity: number;
  rotation: number;
}

interface GlyphComposition {
  background: string;
  elements: GlyphElement[];
}

interface RendererOutput {
  symbolicDescription: string;
  palette: string[];
  glyphComposition: GlyphComposition;
  promptUsed: string;
  imagePrompt: string;
}

const ARCHETYPE_SHAPES: Record<string, GlyphElement["type"]> = {
  observer: "circle",
  builder: "rect",
  explorer: "spiral",
  dissenter: "crack",
  seeker: "arc",
};

const ARCHETYPE_TERRAIN: Record<string, string> = {
  observer: "elevated plateau overlooking a still lake, with wide vantage points across a quiet valley",
  builder: "terraced hillside with stone walls, cultivated fields, and distant structures",
  explorer: "vast desert frontier meeting an ocean edge, with unmapped territory stretching to the horizon",
  dissenter: "volcanic terrain with fractured landscape, exposed geology, and distant storm systems",
  seeker: "twilight forest bordering a winding river, a threshold between two distinct zones",
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generatePalette(vec: DimensionVec): string[] {
  const vitality = vec.vitality / 100;
  const calm = vec.calm / 100;
  const creativity = vec.creativity / 100;

  const baseHue = lerp(190, 40, vitality);
  const baseSat = lerp(25, 75, creativity);
  const baseLit = lerp(30, 55, (vitality + calm) / 2);

  const palette: string[] = [];
  const offsets = [0, 30, -25, 50, -45];
  for (let i = 0; i < 5; i++) {
    const h = (baseHue + offsets[i] + 360) % 360;
    const s = Math.min(100, baseSat + (i % 2 === 0 ? 5 : -10));
    const l = Math.min(80, Math.max(20, baseLit + (i * 6 - 12)));
    palette.push(hslToHex(h, s, l));
  }
  return palette;
}

function generateBackground(vec: DimensionVec): string {
  const calm = vec.calm / 100;
  const lightness = lerp(7, 12, 1 - calm);
  return hslToHex(222, 30, lightness);
}

function generateElements(
  input: RendererInput,
  palette: string[],
): GlyphElement[] {
  const { dimensionVec: vec, dominantArchetype, secondaryArchetype } = input;
  const rand = seededRandom(
    Math.abs(vec.focus * 1000 + vec.calm * 100 + vec.vitality * 10 + vec.drive),
  );
  const elements: GlyphElement[] = [];

  const domShape = ARCHETYPE_SHAPES[dominantArchetype.toLowerCase()] || "circle";
  const secShape = secondaryArchetype
    ? ARCHETYPE_SHAPES[secondaryArchetype.toLowerCase()] || "arc"
    : "arc";

  elements.push({
    type: domShape,
    cx: 50,
    cy: 50,
    size: lerp(25, 40, vec.drive / 100),
    color: palette[0],
    opacity: lerp(0.7, 1, vec.agency / 100),
    rotation: 0,
  });

  const secCount = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < secCount; i++) {
    const angle = (i / secCount) * Math.PI * 2 + rand() * 0.3;
    const dist = lerp(22, 35, rand());
    elements.push({
      type: secShape,
      cx: 50 + Math.cos(angle) * dist,
      cy: 50 + Math.sin(angle) * dist,
      size: lerp(8, 16, vec.exploration / 100),
      color: palette[1 + (i % 3)],
      opacity: lerp(0.4, 0.8, rand()),
      rotation: Math.round(rand() * 360),
    });
  }

  const scatterCount = 4 + Math.floor(vec.creativity / 25);
  const scatterTypes: GlyphElement["type"][] = ["circle", "line", "arc", "rect"];
  for (let i = 0; i < scatterCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = lerp(10, 45, rand());
    elements.push({
      type: scatterTypes[i % scatterTypes.length],
      cx: 50 + Math.cos(angle) * dist,
      cy: 50 + Math.sin(angle) * dist,
      size: lerp(3, 10, rand()),
      color: palette[Math.floor(rand() * palette.length)],
      opacity: lerp(0.2, 0.6, rand()),
      rotation: Math.round(rand() * 360),
    });
  }

  const tensionCount = Math.min(input.recentTensions.length, 3);
  for (let i = 0; i < tensionCount; i++) {
    elements.push({
      type: "crack",
      cx: lerp(15, 85, rand()),
      cy: lerp(15, 85, rand()),
      size: lerp(6, 14, rand()),
      color: palette[palette.length - 1],
      opacity: 0.35,
      rotation: Math.round(rand() * 180),
    });
  }

  return elements;
}

function getTimeOfDay(vec: DimensionVec, spotify?: { energy: number; valence: number }): string {
  if (spotify && spotify.energy > 0 && spotify.valence > 0) {
    const e = spotify.energy;
    const v = spotify.valence;
    if (e > 60 && v > 60) return "bright midday under a clear sky";
    if (e <= 40 && v <= 40) return "dusk under an overcast sky";
    if (e > 60 && v <= 40) return "high noon under dramatic stormy light";
    if (e <= 40 && v > 60) return "peaceful dawn with soft early light";
  }
  // Fall back to dimension-based time
  if (vec.vitality > 65) return "golden hour with warm amber light";
  if (vec.calm > 65) return "early morning with soft diffused light";
  if (vec.vitality < 35 && vec.calm < 35) return "late dusk with fading twilight";
  return "midday under shifting clouds";
}

function getDimensionAtmosphere(vec: DimensionVec): string[] {
  const details: string[] = [];

  // Vitality
  if (vec.vitality > 70) details.push("warm golden light bathes lush vegetation in amber tones");
  else if (vec.vitality < 40) details.push("an overcast muted palette with sparse ground cover");

  // Calm
  if (vec.calm > 70) details.push("still water reflects an open sky above gentle slopes");
  else if (vec.calm < 40) details.push("choppy water crashes against jagged rock under storm clouds");

  // Focus
  if (vec.focus > 70) details.push("clear atmosphere reveals sharp ridgelines and a single defined path");
  else if (vec.focus < 40) details.push("fog drifts through branching trails and dense undergrowth");

  // Creativity
  if (vec.creativity > 70) details.push("vivid saturated colors illuminate unusual rock formations");
  else if (vec.creativity < 40) details.push("a monochrome palette over simple terrain");

  // Exploration
  if (vec.exploration > 70) details.push("vast open space stretches toward a distant horizon with winding roads");
  else if (vec.exploration < 40) details.push("an enclosed valley with nearby walls and intimate scale");

  // Agency
  if (vec.agency > 70) details.push("an elevated position with shelter visible and a commanding view");
  else if (vec.agency < 40) details.push("low ground with no shelter offers a small perspective");

  // Social
  if (vec.social > 70) details.push("gathering clearings and bridges connect the landscape");
  else if (vec.social < 40) details.push("solitary terrain with no paths, only isolation");

  // Drive
  if (vec.drive > 70) details.push("steep upward terrain rises toward dramatic peaks");
  else if (vec.drive < 40) details.push("a flat plain stretches with no elevation change");

  return details;
}

function getTensionFeature(tensions: string[]): string {
  if (tensions.length === 0) return "";

  const tensionVisuals: Record<string, string> = {
    focus: "a river splits into divergent channels, one clear and one hidden in mist",
    calm: "where still water meets turbulent rapids at a sharp boundary",
    agency: "a path forks — one toward a high overlook, the other descending into shadow",
    vitality: "a green ridge drops abruptly into barren ground",
    social: "a single bridge spans between a crowded shoreline and a solitary island",
    creativity: "a formation of wild color erupts from otherwise monochrome stone",
    exploration: "a wall of mountains gives way to an unexpected opening onto a vast plain",
    drive: "flat ground suddenly buckles upward into a steep ascending ridge",
  };

  const features = tensions
    .slice(0, 2)
    .map((t) => tensionVisuals[t] || `a visible fracture in the terrain along the ${t} axis`)
    .join("; ");

  return features;
}

function generateImagePrompt(input: RendererInput): string {
  const { dimensionVec: vec, dominantArchetype, recentTensions, motifKeywords, spotifyEnergyProfile, previousReflection } = input;

  const terrain = ARCHETYPE_TERRAIN[dominantArchetype.toLowerCase()] || ARCHETYPE_TERRAIN.observer;
  const timeOfDay = getTimeOfDay(vec, spotifyEnergyProfile);

  // Pick top 3 dimension descriptions
  const atmosphere = getDimensionAtmosphere(vec);
  const topAtmosphere = atmosphere.slice(0, 3).join(". ");
  const remainingAtmosphere = atmosphere.slice(3).join(". ");

  const tensionFeature = getTensionFeature(recentTensions);

  const motifStr = motifKeywords.length > 0
    ? `Subtle textures of ${motifKeywords.slice(0, 3).join(", ")} in the atmosphere.`
    : "";

  const reflectionStr = previousReflection
    ? `The viewer recently noted: '${previousReflection.slice(0, 200)}'. Let this observation subtly influence the atmosphere and composition.`
    : "";

  const parts = [
    `A vast ${terrain} at ${timeOfDay}.`,
    topAtmosphere ? `${topAtmosphere}.` : "",
    tensionFeature ? `${tensionFeature}.` : "",
    remainingAtmosphere ? `${remainingAtmosphere}.` : "",
    motifStr,
    reflectionStr,
    "Painterly style, contemplative, no human figures, cinematic composition, 16:9 aspect ratio.",
  ];

  return parts.filter(Boolean).join(" ").replace(/\.\./g, ".").replace(/\s+/g, " ").trim();
}

function generateDescription(input: RendererInput): string {
  const { dimensionVec: vec, dominantArchetype, secondaryArchetype, activeModes, recentTensions, spotifyEnergyProfile } = input;

  const domName = dominantArchetype.charAt(0).toUpperCase() + dominantArchetype.slice(1);
  const secName = secondaryArchetype
    ? secondaryArchetype.charAt(0).toUpperCase() + secondaryArchetype.slice(1)
    : null;

  const terrainShort: Record<string, string> = {
    observer: "a high plateau above a still lake",
    builder: "a terraced hillside of stone and field",
    explorer: "a vast frontier at the edge of ocean and desert",
    dissenter: "a volcanic landscape cracked and exposed",
    seeker: "a twilight forest at the bend of a winding river",
  };

  const landscape = terrainShort[dominantArchetype.toLowerCase()] || terrainShort.observer;

  const energyDesc = vec.vitality > 65
    ? "bathed in warm golden light"
    : vec.vitality > 35
      ? "under shifting ambient light"
      : "settled in deep stillness";

  const focusDesc = vec.focus > 65
    ? "The path ahead is clear and singular."
    : vec.focus > 35
      ? "Multiple trails branch through the scene."
      : "Fog obscures the way forward, open in all directions.";

  const coreStatement = secName
    ? `Your landscape: ${landscape}, ${energyDesc}, with ${secName.toLowerCase()} terrain at the edges.`
    : `Your landscape: ${landscape}, ${energyDesc}.`;

  const modeStr = activeModes.length > 0
    ? ` The land carries traces of ${activeModes.slice(0, 2).join(" and ")} presence.`
    : "";

  const tensionStr = recentTensions.length > 0
    ? ` A visible fracture runs along the ${recentTensions[0]} axis of the terrain.`
    : "";

  let spotifyStr = "";
  if (spotifyEnergyProfile && spotifyEnergyProfile.energy > 0) {
    const e = spotifyEnergyProfile.energy;
    const v = spotifyEnergyProfile.valence;
    if (e > 60 && v > 60) spotifyStr = " The air hums with brightness — midday clarity.";
    else if (e <= 40 && v <= 40) spotifyStr = " Dusk settles, overcast and still.";
    else if (e > 60 && v <= 40) spotifyStr = " Storm energy charges the atmosphere.";
    else if (e <= 40 && v > 60) spotifyStr = " A peaceful dawn glow suffuses the scene.";
  }

  return `${coreStatement}${modeStr}${tensionStr} ${focusDesc}${spotifyStr}`;
}

export function renderPortrait(input: RendererInput): RendererOutput {
  const palette = generatePalette(input.dimensionVec);
  const background = generateBackground(input.dimensionVec);
  const elements = generateElements(input, palette);

  const glyphComposition: GlyphComposition = { background, elements };
  const symbolicDescription = generateDescription(input);
  const imagePrompt = generateImagePrompt(input);

  const promptUsed = `portrait:${input.dominantArchetype}/${input.secondaryArchetype || "none"}:dims[${Object.values(input.dimensionVec).join(",")}]:modes[${input.activeModes.join(",")}]:tensions[${input.recentTensions.join(",")}]`;

  return { symbolicDescription, palette, glyphComposition, promptUsed, imagePrompt };
}
