import Gauge from "./Gauge";
import { ARCHETYPES, ARCHETYPE_MAP, type DimensionVec } from "@shared/archetypes";
import { topArchetype, computeMixture } from "@shared/archetype-math";

interface GaugeSectionProps {
  selfVec: DimensionVec;
  dataVec: DimensionVec | null;
  selfArchetype: string;
  dataArchetype: string | null;
}

export default function GaugeSection({ selfVec, dataVec, selfArchetype, dataArchetype }: GaugeSectionProps) {
  const selfMix = computeMixture(selfVec);
  const selfTop = topArchetype(selfVec);
  const selfPct = selfTop[0]?.pct || 0;
  const selfArch = ARCHETYPE_MAP[selfArchetype];

  const dataMix = dataVec ? computeMixture(dataVec) : null;
  const dataTop = dataVec ? topArchetype(dataVec) : null;
  const dataPct = dataTop?.[0]?.pct || 0;
  const dataArch = dataArchetype ? ARCHETYPE_MAP[dataArchetype] : null;

  const hasData = dataVec !== null && dataArchetype !== null;
  const archetypesDiffer = hasData && selfArchetype !== dataArchetype;

  return (
    <div className="space-y-5">
      {/* Primary Gauges */}
      <div className={`${hasData ? "grid grid-cols-2 gap-5" : ""}`}>
        {hasData && dataArch && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Your data says
            </p>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl font-display" style={{ color: dataArch.color }}>{dataArch.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: dataArch.color }}>{dataArch.name}</p>
                <Gauge percentage={dataPct} label="" color={dataArch.color} />
              </div>
            </div>
          </div>
        )}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {hasData ? "You say" : "Self-report"}
          </p>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl font-display" style={{ color: selfArch?.color }}>{selfArch?.emoji}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: selfArch?.color }}>{selfArch?.name}</p>
              <Gauge percentage={selfPct} label="" color={selfArch?.color || "#5eaaa8"} />
            </div>
          </div>
          {!hasData && selfArch && (
            <p className="text-[10px] text-muted-foreground/60 italic leading-relaxed mt-1 max-w-[300px]">
              {selfArch.coreDrive}
            </p>
          )}
        </div>
      </div>

      {/* Systems Overview — all 5 archetypes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Systems overview
          </p>
          <span className="text-[8px] font-mono text-muted-foreground/20">| = 20% equilibrium</span>
        </div>
        <div className="space-y-2.5">
          {ARCHETYPES.map(arch => {
            const selfVal = selfMix[arch.key] || 0;
            const dataVal = dataMix ? (dataMix[arch.key] || 0) : null;
            const isTop = selfArchetype === arch.key || dataArchetype === arch.key;

            return (
              <div
                key={arch.key}
                className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-all ${
                  isTop ? "bg-card/80" : ""
                }`}
              >
                <span
                  className="text-base font-display w-5 text-center"
                  style={{ color: arch.color }}
                >
                  {arch.emoji}
                </span>
                <span className="text-xs font-medium w-16 text-foreground/80">{arch.name}</span>
                <div className="flex-1">
                  <Gauge
                    percentage={dataVal !== null ? dataVal : selfVal}
                    label=""
                    color={arch.color}
                    showBaseline
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[8px] font-mono text-muted-foreground/15 text-center mt-2">
          archetypes begin at equal 20% — your signal separates them
        </p>
      </div>

      {/* Gap Analysis */}
      {archetypesDiffer && dataArch && selfArch && (
        <div
          data-testid="card-gap-analysis"
          className="p-4 rounded-[10px] bg-card/50 border border-border/50 text-sm"
        >
          <p className="font-medium mb-1 text-foreground/80">Gap detected</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Your data leans{" "}
            <span style={{ color: dataArch.color }} className="font-medium">{dataArch.name}</span>
            {" "}while you identify as{" "}
            <span style={{ color: selfArch.color }} className="font-medium">{selfArch.name}</span>.
            {" "}This gap between behavior and self-image is where the most interesting
            self-knowledge lives.
          </p>
        </div>
      )}
    </div>
  );
}
