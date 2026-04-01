import { useMemo } from "react";

// ── Archetype color map ─────────────────────────────────────
const ARCHETYPE_COLORS: Record<string, string> = {
  observer: "#7c8ba0",
  builder: "#5a7d9a",
  explorer: "#6b9080",
  dissenter: "#c17b6e",
  seeker: "#b8976a",
};

function archetypeColor(key: string | null | undefined): string {
  if (!key) return "#555";
  return ARCHETYPE_COLORS[key.toLowerCase()] || "#555";
}

// ── Types ───────────────────────────────────────────────────
interface VariantNode {
  id: number;
  variant_name: string;
  primary_archetype: string;
  secondary_archetype?: string | null;
  description?: string;
  emergent_traits?: string[];
  exploration_channels?: string[];
  started_at: string;
  ended_at?: string | null;
}

interface IdentityHelixProps {
  history: VariantNode[];
}

// ── Helix geometry helpers ──────────────────────────────────
const NODE_SPACING = 100; // vertical spacing between nodes
const SVG_WIDTH = 280;
const CENTER_X = SVG_WIDTH / 2;
const AMPLITUDE = 60; // horizontal swing of each strand
const NODE_R = 8;

function formatDate(iso: string): string {
  const d = new Date(iso);
  const mo = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const yr = d.getFullYear();
  return `${mo} ${day}, ${yr}`;
}

// ── Component ───────────────────────────────────────────────
export default function IdentityHelix({ history }: IdentityHelixProps) {
  // Sort oldest → newest (bottom-up helix: oldest at bottom)
  const nodes = useMemo(() => [...history].reverse(), [history]);
  const nodeCount = nodes.length;

  if (nodeCount === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-muted-foreground/40 font-mono">
          no variant history yet — check in to generate your first variant
        </p>
      </div>
    );
  }

  const svgHeight = Math.max(200, (nodeCount - 1) * NODE_SPACING + 80);
  const topPad = 40;

  // Build strand paths (sinusoidal, 180° out of phase)
  // Strand A = primary archetype strand
  // Strand B = secondary/data-driven strand
  const points = nodes.map((_, i) => {
    const y = topPad + i * NODE_SPACING;
    // Phase: each node is π/2 apart for that classic helix twist
    const phase = (i * Math.PI) / 1.8;
    const xA = CENTER_X + Math.sin(phase) * AMPLITUDE;
    const xB = CENTER_X + Math.sin(phase + Math.PI) * AMPLITUDE;
    return { y, xA, xB };
  });

  // Smooth path through strand A points
  function buildStrandPath(getX: (p: (typeof points)[0]) => number): string {
    if (points.length < 2) {
      const p = points[0];
      return `M ${getX(p)} ${p.y}`;
    }
    let d = `M ${getX(points[0])} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpY = (prev.y + curr.y) / 2;
      d += ` C ${getX(prev)} ${cpY}, ${getX(curr)} ${cpY}, ${getX(curr)} ${curr.y}`;
    }
    return d;
  }

  const strandAPath = buildStrandPath((p) => p.xA);
  const strandBPath = buildStrandPath((p) => p.xB);

  // Determine which strand is "in front" at each node (for crossover illusion)
  // If sin(phase) > 0, strand A is on the right → draw it on top
  function isStrandAFront(i: number): boolean {
    const phase = (i * Math.PI) / 1.8;
    return Math.sin(phase) >= 0;
  }

  return (
    <div className="w-full flex flex-col items-center">
      <svg
        width={SVG_WIDTH}
        height={svgHeight}
        viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
        className="overflow-visible"
        aria-label="Identity variant helix showing your variant evolution"
      >
        <defs>
          {/* Glow filter for nodes */}
          <filter id="helix-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Background strand B (secondary) ── */}
        <path
          d={strandBPath}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* ── Background strand A (primary) ── */}
        <path
          d={strandAPath}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* ── Crossover rungs + nodes ── */}
        {nodes.map((node, i) => {
          const p = points[i];
          const primaryColor = archetypeColor(node.primary_archetype);
          const secondaryColor = archetypeColor(node.secondary_archetype);
          const aFront = isStrandAFront(i);

          return (
            <g key={node.id}>
              {/* Rung connecting the two strands */}
              <line
                x1={p.xA}
                y1={p.y}
                x2={p.xB}
                y2={p.y}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />

              {/* Back node (rendered first so it's behind) */}
              <circle
                cx={aFront ? p.xB : p.xA}
                cy={p.y}
                r={NODE_R - 1.5}
                fill={aFront ? secondaryColor : primaryColor}
                opacity={0.35}
              />

              {/* Front node (on top) */}
              <circle
                cx={aFront ? p.xA : p.xB}
                cy={p.y}
                r={NODE_R}
                fill={aFront ? primaryColor : secondaryColor}
                opacity={0.85}
                filter="url(#helix-glow)"
              />

              {/* Variant name label — alternate sides */}
              {i % 2 === 0 ? (
                <text
                  x={CENTER_X + AMPLITUDE + 22}
                  y={p.y + 1}
                  dominantBaseline="middle"
                  className="fill-foreground/70"
                  style={{ fontSize: "10px", fontFamily: "var(--font-mono, monospace)" }}
                >
                  {node.variant_name}
                </text>
              ) : (
                <text
                  x={CENTER_X - AMPLITUDE - 22}
                  y={p.y + 1}
                  dominantBaseline="middle"
                  textAnchor="end"
                  className="fill-foreground/70"
                  style={{ fontSize: "10px", fontFamily: "var(--font-mono, monospace)" }}
                >
                  {node.variant_name}
                </text>
              )}

              {/* Date label — opposite side of name */}
              {i % 2 === 0 ? (
                <text
                  x={CENTER_X - AMPLITUDE - 22}
                  y={p.y + 1}
                  dominantBaseline="middle"
                  textAnchor="end"
                  className="fill-muted-foreground/30"
                  style={{ fontSize: "8px", fontFamily: "var(--font-mono, monospace)" }}
                >
                  {formatDate(node.started_at)}
                </text>
              ) : (
                <text
                  x={CENTER_X + AMPLITUDE + 22}
                  y={p.y + 1}
                  dominantBaseline="middle"
                  className="fill-muted-foreground/30"
                  style={{ fontSize: "8px", fontFamily: "var(--font-mono, monospace)" }}
                >
                  {formatDate(node.started_at)}
                </text>
              )}
            </g>
          );
        })}

        {/* ── "Now" indicator at the top ── */}
        {nodeCount > 0 && (
          <g>
            <circle
              cx={points[nodeCount - 1].xA}
              cy={points[nodeCount - 1].y - 20}
              r={3}
              className="fill-primary"
              opacity={0.6}
            >
              <animate
                attributeName="opacity"
                values="0.3;0.8;0.3"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
            <text
              x={CENTER_X}
              y={points[nodeCount - 1].y - 30}
              textAnchor="middle"
              className="fill-primary/50"
              style={{ fontSize: "8px", fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.15em" }}
            >
              CURRENT
            </text>
          </g>
        )}

        {/* ── "Origin" label at the bottom ── */}
        {nodeCount > 1 && (
          <text
            x={CENTER_X}
            y={points[0].y + 25}
            textAnchor="middle"
            className="fill-muted-foreground/20"
            style={{ fontSize: "8px", fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.15em" }}
          >
            ORIGIN
          </text>
        )}
      </svg>
    </div>
  );
}
