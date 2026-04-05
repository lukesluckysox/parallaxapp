export const DIMENSIONS = [
  "focus", "calm", "agency", "vitality", "social", "creativity", "exploration", "drive"
] as const;

export type Dimension = typeof DIMENSIONS[number];
export type DimensionVec = Record<Dimension, number>;

export interface SubtypeDef {
  key: string;
  name: string;
  description: string;
}

export interface ArchetypeDef {
  key: string;
  name: string;
  emoji: string;
  color: string;
  coreDrive: string;
  philosophy: string;
  target: DimensionVec;
  subtypes: SubtypeDef[];
  tells: string;
  decision_lens: string;
  shadow: string;
  verdict_do: string;
  verdict_skip: string;
}

export const ARCHETYPES: ArchetypeDef[] = [
  {
    key: "observer",
    name: "Observer",
    emoji: "◉",
    color: "#7c8ba0",
    coreDrive: "Understanding reality and patterns",
    philosophy: "The Observer believes clarity comes before action. They watch, record, and decode the world — not from detachment, but from a deep need to understand what's actually happening before anyone tells them what to think.",
    target: { focus: 92, calm: 85, agency: 60, vitality: 55, social: 25, creativity: 65, exploration: 40, drive: 45 },
    subtypes: [
      { key: "analyst", name: "The Analyst", description: "Breaks systems down logically" },
      { key: "philosopher", name: "The Philosopher", description: "Explores existential and abstract ideas" },
      { key: "archivist", name: "The Archivist", description: "Collects insights, records patterns, preserves meaning" },
    ],
    tells: "Deep reading habits, note-taking systems, pattern recognition, asks 'why' more than 'how', comfortable in silence",
    decision_lens: "Does this sharpen my understanding or cloud it?",
    shadow: "Analysis paralysis, emotional distance, overthinking as avoidance",
    verdict_do: "sees value — there's something to learn here.",
    verdict_skip: "would pass. Not enough signal to justify the noise.",
  },
  {
    key: "builder",
    name: "Builder",
    emoji: "◧",
    color: "#5a7d9a",
    coreDrive: "Creating structure and tangible progress",
    philosophy: "The Builder measures life in what they've made real. Ideas are cheap — execution is the craft. They design systems, ship outcomes, and optimize relentlessly because momentum is the only proof that matters.",
    target: { focus: 88, calm: 55, agency: 75, vitality: 65, social: 35, creativity: 45, exploration: 25, drive: 90 },
    subtypes: [
      { key: "architect", name: "The Architect", description: "Designs systems and long-term plans" },
      { key: "strategist", name: "The Strategist", description: "Optimizes paths to achieve goals" },
      { key: "operator", name: "The Operator", description: "Executes consistently and values discipline" },
    ],
    tells: "Calendar-blocked days, metrics dashboards, bias to action, clean systems, ships consistently",
    decision_lens: "Does this create tangible progress or is it motion without output?",
    shadow: "Burnout disguised as productivity, treating people as functions, optimizing meaning out of life",
    verdict_do: "approves. This moves something real forward.",
    verdict_skip: "cuts it. Doesn't build or ship anything.",
  },
  {
    key: "explorer",
    name: "Explorer",
    emoji: "◇",
    color: "#6b9080",
    coreDrive: "Novelty, experience, and creative expression",
    philosophy: "The Explorer knows that growth lives outside the familiar. Routine is where curiosity goes to die. They chase novelty not for escape but because every new angle reveals something the old view couldn't — about the world and about themselves.",
    target: { focus: 40, calm: 42, agency: 45, vitality: 60, social: 65, creativity: 90, exploration: 95, drive: 55 },
    subtypes: [
      { key: "wanderer", name: "The Wanderer", description: "Seeks new environments and perspectives" },
      { key: "creator", name: "The Creator", description: "Generates art, ideas, and expression" },
      { key: "performer", name: "The Performer", description: "Channels energy outward through charisma or storytelling" },
    ],
    tells: "Irregular schedule, wide interests, creative side projects, restless in routine, collects experiences over possessions",
    decision_lens: "Is this genuinely new territory or just a different wrapper on the familiar?",
    shadow: "Commitment avoidance, surface-level knowledge, mistaking restlessness for growth",
    verdict_do: "is already moving. Something new? Yes.",
    verdict_skip: "shrugs. Been here before, or close enough.",
  },
  {
    key: "dissenter",
    name: "Dissenter",
    emoji: "◈",
    color: "#c17b6e",
    coreDrive: "Autonomy and resistance to imposed systems",
    philosophy: "The Dissenter refuses to inherit someone else's framework for living. They deconstruct, challenge, and rebuild — not from nihilism but from a conviction that most structures serve their creators, not their participants.",
    target: { focus: 65, calm: 30, agency: 85, vitality: 55, social: 55, creativity: 80, exploration: 75, drive: 65 },
    subtypes: [
      { key: "rebel", name: "The Rebel", description: "Rejects authority and constraints" },
      { key: "critic", name: "The Critic", description: "Deconstructs institutions and assumptions" },
      { key: "iconoclast", name: "The Iconoclast", description: "Breaks norms and challenges cultural structures" },
    ],
    tells: "Questions authority reflexively, contrarian positions, independent path, allergic to groupthink, strong opinions held loosely",
    decision_lens: "Am I choosing this freely or am I being funneled?",
    shadow: "Reflexive opposition, loneliness from perpetual outsider stance, destruction without creation",
    verdict_do: "leans in — this breaks a pattern worth breaking.",
    verdict_skip: "resists. Feels like compliance disguised as choice.",
  },
  {
    key: "seeker",
    name: "Seeker",
    emoji: "✧",
    color: "#b8976a",
    coreDrive: "Meaning, transformation, and self-discovery",
    philosophy: "The Seeker is in motion toward something they can't fully name yet. Purpose isn't given — it's excavated through experience, suffering, and honest self-examination. The journey is the point, but the direction matters.",
    target: { focus: 60, calm: 55, agency: 55, vitality: 65, social: 50, creativity: 70, exploration: 80, drive: 60 },
    subtypes: [
      { key: "pilgrim", name: "The Pilgrim", description: "Searching for purpose or direction" },
      { key: "alchemist", name: "The Alchemist", description: "Transforming hardship into insight" },
      { key: "visionary", name: "The Visionary", description: "Oriented toward future ideals and possibilities" },
    ],
    tells: "Journals regularly, drawn to transformative experiences, asks big questions, comfort with uncertainty, values growth over comfort",
    decision_lens: "Does this move me closer to who I'm becoming or keep me where I am?",
    shadow: "Perpetual searching without arriving, spiritual bypassing, using meaning-seeking to avoid mundane responsibilities",
    verdict_do: "sees a thread worth following here.",
    verdict_skip: "doesn't feel it. No transformation in this one.",
  },
];

export const ARCHETYPE_MAP = Object.fromEntries(ARCHETYPES.map(a => [a.key, a])) as Record<string, ArchetypeDef>;
