import type { DimensionVec } from "@shared/archetypes";

interface RendererInput {
  dimensionVec: DimensionVec;
  dominantArchetype: string;
  secondaryArchetype: string | null;
  activeModes: string[];
  recentTensions: string[];
  motifKeywords: string[];
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
}

const ARCHETYPE_SHAPES: Record<string, GlyphElement["type"]> = {
  observer: "circle",
  builder: "rect",
  explorer: "spiral",
  dissenter: "crack",
  seeker: "arc",
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

  // Base hue: warm (30-50) for high vitality, cool (170-200) for high calm
  const baseHue = lerp(190, 40, vitality);
  // Saturation driven by creativity
  const baseSat = lerp(25, 75, creativity);
  // Lightness: moderate range
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
  // Darker for high calm, slightly lighter for low calm
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

  // Central dominant element
  elements.push({
    type: domShape,
    cx: 50,
    cy: 50,
    size: lerp(25, 40, vec.drive / 100),
    color: palette[0],
    opacity: lerp(0.7, 1, vec.agency / 100),
    rotation: 0,
  });

  // Secondary ring elements (3-4)
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

  // Scatter elements from dimensions
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

  // Tension marks — cracks or angular lines
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

function generateDescription(input: RendererInput): string {
  const { dimensionVec: vec, dominantArchetype, secondaryArchetype, activeModes, recentTensions } = input;

  const domName = dominantArchetype.charAt(0).toUpperCase() + dominantArchetype.slice(1);
  const secName = secondaryArchetype
    ? secondaryArchetype.charAt(0).toUpperCase() + secondaryArchetype.slice(1)
    : null;

  const energyDesc = vec.vitality > 65 ? "radiating kinetic energy" :
    vec.vitality > 35 ? "in measured equilibrium" : "in deep stillness";

  const focusDesc = vec.focus > 65 ? "sharply attentive" :
    vec.focus > 35 ? "loosely gathering" : "diffuse and open";

  const coreStatement = secName
    ? `A ${domName} presence with ${secName} undertones, ${energyDesc}.`
    : `A ${domName} presence, ${energyDesc}.`;

  const modeStr = activeModes.length > 0
    ? ` Currently operating through ${activeModes.slice(0, 2).join(" and ")} modes.`
    : "";

  const tensionStr = recentTensions.length > 0
    ? ` Tension visible along ${recentTensions[0]}.`
    : "";

  const closingDesc = vec.creativity > 60
    ? `The field is ${focusDesc}, alive with generative potential.`
    : `The field is ${focusDesc}, conserving and consolidating.`;

  return `${coreStatement}${modeStr}${tensionStr} ${closingDesc}`;
}

export function renderPortrait(input: RendererInput): RendererOutput {
  const palette = generatePalette(input.dimensionVec);
  const background = generateBackground(input.dimensionVec);
  const elements = generateElements(input, palette);

  const glyphComposition: GlyphComposition = { background, elements };
  const symbolicDescription = generateDescription(input);

  const promptUsed = `portrait:${input.dominantArchetype}/${input.secondaryArchetype || "none"}:dims[${Object.values(input.dimensionVec).join(",")}]:modes[${input.activeModes.join(",")}]:tensions[${input.recentTensions.join(",")}]`;

  return { symbolicDescription, palette, glyphComposition, promptUsed };
}
