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
    <div className="space-y-4">
      {/* ── Primary Gauges: Data vs Self ── */}
      <div className={`flex items-start justify-center ${hasData ? "gap-6" : ""}`}>
        {hasData ? (
          <>
            {/* DATA-FED gauge */}
            <div className="flex-1 flex flex-col items-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                Your data says
              </p>
              <Gauge
                percentage={dataPct}
                label=""
                color={dataArch?.color || "#01696f"}
                size={150}
              />
              <div className="text-center -mt-1">
                <span className="text-lg">{dataArch?.emoji}</span>
                <p className="text-sm font-bold" style={{ color: dataArch?.color }}>
                  {dataArch?.name}
                </p>
                <p className="text-[10px] text-muted-foreground max-w-[140px] mx-auto">
                  {dataArch?.coreDrive}
                </p>
              </div>
            </div>

            {/* SELF-REPORT gauge */}
            <div className="flex-1 flex flex-col items-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                You say
              </p>
              <Gauge
                percentage={selfPct}
                label=""
                color={selfArch?.color || "#01696f"}
                size={150}
              />
              <div className="text-center -mt-1">
                <span className="text-lg">{selfArch?.emoji}</span>
                <p className="text-sm font-bold" style={{ color: selfArch?.color }}>
                  {selfArch?.name}
                </p>
                <p className="text-[10px] text-muted-foreground max-w-[140px] mx-auto">
                  {selfArch?.coreDrive}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Self-report
            </p>
            <Gauge
              percentage={selfPct}
              label=""
              color={selfArch?.color || "#01696f"}
              size={180}
            />
            <div className="text-center -mt-1">
              <span className="text-xl">{selfArch?.emoji}</span>
              <p className="text-sm font-bold" style={{ color: selfArch?.color }}>
                {selfArch?.name}
              </p>
              <p className="text-[10px] text-muted-foreground italic max-w-[200px] mx-auto">
                {selfArch?.philosophy}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Mini Gauges: All Archetypes ── */}
      <div className="pt-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-center mb-2">
          Systems overview
        </p>
        <div className="grid grid-cols-5 gap-1">
          {ARCHETYPES.map(arch => {
            const selfVal = selfMix[arch.key] || 0;
            const dataVal = dataMix ? (dataMix[arch.key] || 0) : null;
            const isTopSelf = selfArchetype === arch.key;
            const isTopData = dataArchetype === arch.key;

            return (
              <div
                key={arch.key}
                className={`flex flex-col items-center py-2 px-1 rounded-lg transition-all ${
                  isTopSelf || isTopData
                    ? "bg-card border border-border shadow-sm"
                    : ""
                }`}
              >
                <Gauge
                  percentage={dataVal !== null ? dataVal : selfVal}
                  label=""
                  color={arch.color}
                  size={60}
                />
                <span className="text-sm mt-0.5">{arch.emoji}</span>
                <span className="text-[9px] font-medium text-muted-foreground">
                  {arch.name}
                </span>
                {/* Show both values if data exists */}
                <div className="flex items-center gap-1 mt-0.5">
                  {dataVal !== null ? (
                    <>
                      <span className="text-[8px] text-muted-foreground/60" title="Data">
                        D:{dataVal}%
                      </span>
                      <span className="text-[8px] text-muted-foreground/60" title="Self">
                        S:{selfVal}%
                      </span>
                    </>
                  ) : (
                    <span className="text-[8px] text-muted-foreground/60">
                      {selfVal}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Gap Analysis ── */}
      {archetypesDiffer && dataArch && (
        <div
          data-testid="card-gap-analysis"
          className="p-3 rounded-[10px] border border-border bg-card text-sm"
        >
          <p className="font-medium mb-1">Gap detected</p>
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
