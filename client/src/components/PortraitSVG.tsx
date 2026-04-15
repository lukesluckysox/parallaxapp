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

function renderElement(el: GlyphElement, i: number) {
  const delay = `${i * 0.08}s`;
  const style = {
    animation: `portraitFadeIn 0.6s ease-out ${delay} both`,
  };
  const transform = `rotate(${el.rotation} ${el.cx} ${el.cy})`;

  switch (el.type) {
    case "circle":
      return (
        <circle
          key={i}
          cx={el.cx}
          cy={el.cy}
          r={el.size / 2}
          fill={el.color}
          opacity={el.opacity}
          style={style}
        />
      );
    case "rect":
      return (
        <rect
          key={i}
          x={el.cx - el.size / 2}
          y={el.cy - el.size / 2}
          width={el.size}
          height={el.size * 0.7}
          rx={2}
          fill={el.color}
          opacity={el.opacity}
          transform={transform}
          style={style}
        />
      );
    case "arc": {
      const r = el.size / 2;
      const startAngle = 0;
      const endAngle = Math.PI * 1.4;
      const x1 = el.cx + r * Math.cos(startAngle);
      const y1 = el.cy + r * Math.sin(startAngle);
      const x2 = el.cx + r * Math.cos(endAngle);
      const y2 = el.cy + r * Math.sin(endAngle);
      return (
        <path
          key={i}
          d={`M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2}`}
          fill="none"
          stroke={el.color}
          strokeWidth={1.5}
          opacity={el.opacity}
          transform={transform}
          style={style}
        />
      );
    }
    case "spiral": {
      const points: string[] = [];
      for (let t = 0; t < Math.PI * 4; t += 0.3) {
        const r = (t / (Math.PI * 4)) * el.size;
        const x = el.cx + r * Math.cos(t);
        const y = el.cy + r * Math.sin(t);
        points.push(`${x},${y}`);
      }
      return (
        <polyline
          key={i}
          points={points.join(" ")}
          fill="none"
          stroke={el.color}
          strokeWidth={1}
          opacity={el.opacity}
          transform={transform}
          style={style}
        />
      );
    }
    case "line":
      return (
        <line
          key={i}
          x1={el.cx - el.size / 2}
          y1={el.cy}
          x2={el.cx + el.size / 2}
          y2={el.cy}
          stroke={el.color}
          strokeWidth={1.5}
          opacity={el.opacity}
          transform={transform}
          style={style}
        />
      );
    case "crack": {
      const pts: string[] = [];
      const segments = 5;
      let x = el.cx - el.size / 2;
      let y = el.cy - el.size / 2;
      pts.push(`${x},${y}`);
      for (let j = 1; j <= segments; j++) {
        x += el.size / segments;
        y += ((j % 2 === 0 ? 1 : -1) * el.size) / (segments * 0.8);
        pts.push(`${x},${y}`);
      }
      return (
        <polyline
          key={i}
          points={pts.join(" ")}
          fill="none"
          stroke={el.color}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={el.opacity}
          transform={transform}
          style={style}
        />
      );
    }
    default:
      return null;
  }
}

export default function PortraitSVG({
  glyphComposition,
  className = "",
}: {
  glyphComposition: GlyphComposition | string;
  className?: string;
}) {
  const comp: GlyphComposition =
    typeof glyphComposition === "string"
      ? JSON.parse(glyphComposition)
      : glyphComposition;

  return (
    <>
      <style>{`
        @keyframes portraitFadeIn {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <svg
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-full h-full min-w-[200px] ${className}`}
        style={{ background: comp.background, borderRadius: "8px" }}
      >
        {comp.elements.map((el, i) => renderElement(el, i))}
      </svg>
    </>
  );
}
