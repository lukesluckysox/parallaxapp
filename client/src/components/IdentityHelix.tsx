import { useMemo, useState } from "react";

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

function archetypeLabel(key: string | null | undefined): string {
  if (!key) return "";
  return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
}

// ── Types ───────────────────────────────────────────────────
export interface VariantNode {
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
  fullPage?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;
}

function formatRange(start: string, end?: string | null): string {
  const s = formatDate(start);
  if (!end) return `${s} — now`;
  return `${s} — ${formatDate(end)}`;
}

// ── Component ───────────────────────────────────────────────
export default function IdentityHelix({ history, fullPage }: IdentityHelixProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Oldest at bottom, newest at top
  const nodes = useMemo(() => [...history].reverse(), [history]);
  const nodeCount = nodes.length;

  // ── Layout params ──
  const SVG_WIDTH = fullPage ? 240 : 200;
  const CENTER_X = SVG_WIDTH / 2;
  const AMPLITUDE = fullPage ? 45 : 36;
  const NODE_SPACING = fullPage ? 80 : 70;
  const NODE_R = fullPage ? 6 : 5;
  // How many intermediate points between nodes for smooth crossover
  const INTERP_STEPS = 12;

  if (nodeCount === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-muted-foreground/40 font-mono">
          no variant history yet — check in to generate your first variant
        </p>
      </div>
    );
  }

  const svgHeight = (nodeCount - 1) * NODE_SPACING + 120 + (fullPage ? 20 : 0);
  const topPad = fullPage ? 50 : 36;

  // ── Build high-res strand points for smooth crossover ──
  const totalSteps = (nodeCount - 1) * INTERP_STEPS + 1;
  const strandPoints: { y: number; xA: number; xB: number; phase: number }[] = [];
  for (let s = 0; s < totalSteps; s++) {
    const t = s / INTERP_STEPS; // fractional node index
    const y = topPad + t * NODE_SPACING;
    const phase = (t * Math.PI) / 1.5;
    const xA = CENTER_X + Math.sin(phase) * AMPLITUDE;
    const xB = CENTER_X + Math.sin(phase + Math.PI) * AMPLITUDE;
    strandPoints.push({ y, xA, xB, phase });
  }

  // Node positions (subset of strandPoints at integer indices)
  const nodePoints = nodes.map((_, i) => {
    const idx = i * INTERP_STEPS;
    return strandPoints[idx];
  });

  // ── Build strand paths with depth-aware segments ──
  // Split each strand into "front" and "back" segments based on which crosses in front
  function buildDepthStrands(isStrandA: boolean, isFront: boolean) {
    const segments: string[] = [];
    let current = "";
    let inSegment = false;
    const getX = (p: (typeof strandPoints)[0]) => isStrandA ? p.xA : p.xB;

    for (let s = 0; s < strandPoints.length; s++) {
      const p = strandPoints[s];
      const sinVal = Math.sin(p.phase);
      const aIsFront = sinVal >= 0;
      const thisFront = isStrandA ? aIsFront : !aIsFront;
      const shouldDraw = thisFront === isFront;

      if (shouldDraw) {
        if (!inSegment) {
          current = `M ${getX(p)} ${p.y}`;
          inSegment = true;
        } else {
          current += ` L ${getX(p)} ${p.y}`;
        }
      } else {
        if (inSegment) {
          // extend slightly into the transition for smooth overlap
          current += ` L ${getX(p)} ${p.y}`;
          segments.push(current);
          inSegment = false;
        }
      }
    }
    if (inSegment) segments.push(current);
    return segments;
  }

  // Simple full paths for each strand (used as base layer)
  function buildFullPath(getX: (p: (typeof strandPoints)[0]) => number): string {
    let d = `M ${getX(strandPoints[0])} ${strandPoints[0].y}`;
    for (let s = 1; s < strandPoints.length; s++) {
      d += ` L ${getX(strandPoints[s])} ${strandPoints[s].y}`;
    }
    return d;
  }

  const fullPathA = buildFullPath((p) => p.xA);
  const fullPathB = buildFullPath((p) => p.xB);

  // Front segments (drawn on top, brighter)
  const frontA = buildDepthStrands(true, true);
  const frontB = buildDepthStrands(false, true);

  function isStrandAFront(i: number): boolean {
    const phase = (i * Math.PI) / 1.5;
    return Math.sin(phase) >= 0;
  }

  function handleNodeTap(nodeId: number) {
    if (!fullPage) return;
    setSelectedId((prev) => (prev === nodeId ? null : nodeId));
  }

  return (
    <div className="w-full flex flex-col items-center">
      <svg
        width={SVG_WIDTH}
        height={svgHeight}
        viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
        className="overflow-visible"
        aria-label="Identity variant helix"
      >
        <defs>
          <filter id="helix-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Back strands (dim, behind everything) ── */}
        <path d={fullPathA} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1.5} strokeLinecap="round" />
        <path d={fullPathB} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1.5} strokeLinecap="round" />

        {/* ── Rungs (solid, thin base-pair lines) ── */}
        {nodePoints.map((p, i) => (
          <line
            key={`rung-${i}`}
            x1={p.xA} y1={p.y} x2={p.xB} y2={p.y}
            stroke="rgba(255,255,255,0.06)" strokeWidth={0.75}
          />
        ))}

        {/* ── Front strand segments (brighter, on top) ── */}
        {frontA.map((d, i) => (
          <path key={`fA-${i}`} d={d} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={2} strokeLinecap="round" />
        ))}
        {frontB.map((d, i) => (
          <path key={`fB-${i}`} d={d} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={2} strokeLinecap="round" />
        ))}

        {/* ── Nodes + labels ── */}
        {nodes.map((node, i) => {
          const p = nodePoints[i];
          const primaryColor = archetypeColor(node.primary_archetype);
          const secondaryColor = archetypeColor(node.secondary_archetype);
          const aFront = isStrandAFront(i);
          const isSelected = fullPage && selectedId === node.id;

          return (
            <g key={node.id}>
              {/* Back node */}
              <circle
                cx={aFront ? p.xB : p.xA} cy={p.y}
                r={NODE_R - 1.5}
                fill={aFront ? secondaryColor : primaryColor}
                opacity={0.25}
              />

              {/* Front node */}
              <circle
                cx={aFront ? p.xA : p.xB} cy={p.y}
                r={isSelected ? NODE_R + 1.5 : NODE_R}
                fill={aFront ? primaryColor : secondaryColor}
                opacity={isSelected ? 1 : 0.8}
                filter="url(#helix-glow)"
                style={fullPage ? { cursor: "pointer" } : undefined}
                onClick={() => handleNodeTap(node.id)}
              />

              {/* Variant name — centered below node */}
              <text
                x={CENTER_X}
                y={p.y + NODE_R + 12}
                textAnchor="middle"
                className="fill-foreground/60"
                style={{
                  fontSize: fullPage ? "9px" : "8px",
                  fontFamily: "var(--font-mono, monospace)",
                  cursor: fullPage ? "pointer" : undefined,
                }}
                onClick={() => handleNodeTap(node.id)}
              >
                {node.variant_name}
              </text>

              {/* Date — centered below name */}
              <text
                x={CENTER_X}
                y={p.y + NODE_R + 22}
                textAnchor="middle"
                className="fill-muted-foreground/20"
                style={{ fontSize: "7px", fontFamily: "var(--font-mono, monospace)" }}
              >
                {formatDate(node.started_at)}
              </text>

              {/* ── Archetype badge (full page, tapped) ── */}
              {isSelected && (
                <g>
                  <rect
                    x={CENTER_X - 70}
                    y={p.y + NODE_R + 28}
                    width={140}
                    height={node.secondary_archetype ? 38 : 26}
                    rx={6}
                    fill="rgba(10,12,16,0.92)"
                    stroke={primaryColor}
                    strokeWidth={0.5}
                    opacity={0.95}
                  />
                  {/* Primary */}
                  <circle cx={CENTER_X - 54} cy={p.y + NODE_R + 40} r={3.5} fill={primaryColor} />
                  <text
                    x={CENTER_X - 46} y={p.y + NODE_R + 41}
                    dominantBaseline="middle"
                    className="fill-foreground/80"
                    style={{ fontSize: "9px", fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}
                  >
                    {archetypeLabel(node.primary_archetype)}
                  </text>
                  {/* Date range */}
                  <text
                    x={CENTER_X + 64} y={p.y + NODE_R + 41}
                    textAnchor="end" dominantBaseline="middle"
                    className="fill-muted-foreground/25"
                    style={{ fontSize: "7px", fontFamily: "var(--font-mono, monospace)" }}
                  >
                    {formatRange(node.started_at, node.ended_at)}
                  </text>
                  {/* Secondary */}
                  {node.secondary_archetype && (
                    <>
                      <circle cx={CENTER_X - 54} cy={p.y + NODE_R + 54} r={2.5} fill={secondaryColor} opacity={0.6} />
                      <text
                        x={CENTER_X - 46} y={p.y + NODE_R + 55}
                        dominantBaseline="middle"
                        className="fill-muted-foreground/40"
                        style={{ fontSize: "8px", fontFamily: "var(--font-mono, monospace)" }}
                      >
                        {archetypeLabel(node.secondary_archetype)}
                      </text>
                    </>
                  )}
                </g>
              )}
            </g>
          );
        })}

        {/* ── "CURRENT" pulse ── */}
        {nodeCount > 0 && (
          <g>
            <circle
              cx={CENTER_X}
              cy={nodePoints[nodeCount - 1].y - 18}
              r={2.5}
              className="fill-primary"
              opacity={0.6}
            >
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
            </circle>
            <text
              x={CENTER_X} y={nodePoints[nodeCount - 1].y - 28}
              textAnchor="middle"
              className="fill-primary/40"
              style={{ fontSize: "7px", fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.15em" }}
            >
              CURRENT
            </text>
          </g>
        )}

        {/* ── "ORIGIN" label ── */}
        {nodeCount > 1 && (
          <text
            x={CENTER_X} y={nodePoints[0].y + NODE_R + 32}
            textAnchor="middle"
            className="fill-muted-foreground/15"
            style={{ fontSize: "7px", fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.15em" }}
          >
            ORIGIN
          </text>
        )}
      </svg>
    </div>
  );
}
