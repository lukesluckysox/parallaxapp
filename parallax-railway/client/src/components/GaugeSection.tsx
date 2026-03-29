import Gauge from "./Gauge";
import { ARCHETYPE_MAP, type DimensionVec } from "@shared/archetypes";
import { topArchetype, computeMixture, similarity } from "@shared/archetype-math";

interface GaugeSectionProps {
  selfVec: DimensionVec;
  dataVec: DimensionVec | null;
  selfArchetype: string;
  dataArchetype: string | null;
}

export default function GaugeSection({ selfVec, dataVec, selfArchetype, dataArchetype }: GaugeSectionProps) {
  const selfTop = topArchetype(selfVec);
  const selfPct = selfTop[0]?.pct || 0;
  const selfArch = ARCHETYPE_MAP[selfArchetype];

  const dataTop = dataVec ? topArchetype(dataVec) : null;
  const dataPct = dataTop?.[0]?.pct || 0;
  const dataArch = dataArchetype ? ARCHETYPE_MAP[dataArchetype] : null;

  const hasData = dataVec !== null && dataArchetype !== null;
  const archetypesDiffer = hasData && selfArchetype !== dataArchetype;

  return (
    <div className="space-y-4">
      <div className={`flex items-start justify-center ${hasData ? "gap-4" : ""}`}>
        {hasData ? (
          <>
            <div className="flex-1 flex flex-col items-center">
              <Gauge
                percentage={dataPct}
                label="Your data says"
                color={dataArch?.color || "#01696f"}
                size={140}
              />
              <div className="mt-2 text-center">
                <span className="text-lg">{dataArch?.emoji}</span>
                <p className="text-sm font-medium" data-testid="text-data-archetype" style={{ color: dataArch?.color }}>
                  {dataArch?.name}
                </p>
              </div>
            </div>
            <div className="flex-1 flex flex-col items-center">
              <Gauge
                percentage={selfPct}
                label="You say"
                color={selfArch?.color || "#01696f"}
                size={140}
              />
              <div className="mt-2 text-center">
                <span className="text-lg">{selfArch?.emoji}</span>
                <p className="text-sm font-medium" data-testid="text-self-archetype" style={{ color: selfArch?.color }}>
                  {selfArch?.name}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center">
            <Gauge
              percentage={selfPct}
              label="Self-report"
              color={selfArch?.color || "#01696f"}
              size={180}
            />
            <div className="mt-2 text-center">
              <span className="text-xl">{selfArch?.emoji}</span>
              <p className="text-sm font-medium" data-testid="text-self-archetype" style={{ color: selfArch?.color }}>
                {selfArch?.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 italic">{selfArch?.philosophy}</p>
            </div>
          </div>
        )}
      </div>

      {archetypesDiffer && dataArch && (
        <div
          data-testid="card-gap-analysis"
          className="p-3 rounded-[10px] border border-border bg-card text-sm"
        >
          <p className="font-medium mb-1">Gap analysis</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Your data leans{" "}
            <span style={{ color: dataArch.color }} className="font-medium">{dataArch.name}</span>
            {" "}while you identify as{" "}
            <span style={{ color: selfArch.color }} className="font-medium">{selfArch.name}</span>.
            {" "}Your data reflects: {dataArch.coreDrive.toLowerCase()}.
            {" "}Consider what this gap reveals about your aspirations vs. your habits.
          </p>
        </div>
      )}
    </div>
  );
}
