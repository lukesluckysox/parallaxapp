import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ARCHETYPES, DIMENSIONS, ARCHETYPE_MAP, type DimensionVec } from "@shared/archetypes";
import { topArchetype, applyImpact, similarity } from "@shared/archetype-math";
import { Zap, Check, X, Minus, ArrowRight } from "lucide-react";

interface DecisionEngineProps {
  selfVec: DimensionVec;
  dataVec: DimensionVec | null;
}

const DIMENSION_LABELS: Record<string, string> = {
  focus: "Focus", calm: "Calm", discipline: "Discipline", health: "Health",
  social: "Social", creativity: "Creativity", exploration: "Exploration", ambition: "Ambition",
};

export default function DecisionEngine({ selfVec, dataVec }: DecisionEngineProps) {
  const { toast } = useToast();
  const [decisionText, setDecisionText] = useState("");
  const [impacts, setImpacts] = useState<Record<string, number>>({});
  const [reasoning, setReasoning] = useState("");
  const [quickTake, setQuickTake] = useState("");
  const [verdict, setVerdict] = useState<"do" | "skip" | "neutral" | null>(null);
  const [evaluated, setEvaluated] = useState(false);
  const [predictedShift, setPredictedShift] = useState<{ from: string; to: string; confidence: number } | null>(null);
  const [riskFactors, setRiskFactors] = useState<string[]>([]);
  const [potentialGains, setPotentialGains] = useState<string[]>([]);
  const [narrative, setNarrative] = useState("");
  const [hasLLMAnalysis, setHasLLMAnalysis] = useState(false);

  const analyzeMutation = useMutation({
    mutationFn: async (decision: string) => {
      const res = await apiRequest("POST", "/api/analyze-decision", {
        decision,
        currentState: selfVec,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.impacts) {
        setImpacts(data.impacts);
      }
      if (data.reasoning) setReasoning(data.reasoning);
      if (data.quick_take) setQuickTake(data.quick_take);
      if (data.predicted_shift) setPredictedShift(data.predicted_shift);
      if (data.risk_factors) setRiskFactors(data.risk_factors);
      if (data.potential_gains) setPotentialGains(data.potential_gains);
      if (data.narrative) setNarrative(data.narrative);
      setHasLLMAnalysis(true);
    },
    onError: () => {
      toast({ title: "Error", description: "Could not analyze decision", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { decision_text: string; impact_vec: string; target_archetype: string | null; verdict: string; alignment_before: number; alignment_after: number }) => {
      const res = await apiRequest("POST", "/api/decisions", {
        ...data,
        timestamp: new Date().toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/decisions"] });
      toast({ title: "Saved", description: "Decision recorded" });
    },
  });

  const handleEvaluate = () => {
    const impactVec: Partial<DimensionVec> = {};
    for (const dim of DIMENSIONS) {
      impactVec[dim] = impacts[dim] || 0;
    }

    const afterVec = applyImpact(selfVec, impactVec);
    const beforeTop = topArchetype(selfVec);
    const afterTop = topArchetype(afterVec);

    // Net positive = do, net negative = skip, balanced = neutral
    const totalImpact = Object.values(impacts).reduce((sum, v) => sum + v, 0);
    let v: "do" | "skip" | "neutral";
    if (totalImpact > 10) v = "do";
    else if (totalImpact < -10) v = "skip";
    else v = "neutral";
    setVerdict(v);
    setEvaluated(true);

    // Compute alignment scores
    const beforeSim = Math.round(similarity(selfVec, selfVec) * 100);
    const afterSim = Math.round(similarity(afterVec, selfVec) * 100);
    const targetArch = afterTop[0]?.key || beforeTop[0]?.key || null;

    // Auto-save
    if (decisionText.trim()) {
      saveMutation.mutate({
        decision_text: decisionText,
        impact_vec: JSON.stringify(impactVec),
        target_archetype: targetArch,
        verdict: v,
        alignment_before: beforeSim,
        alignment_after: afterSim,
      });
    }
  };

  const handleImpactChange = (dim: string, val: number) => {
    setImpacts(prev => ({ ...prev, [dim]: val }));
    setEvaluated(false);
  };

  // Per-archetype verdicts
  const archetypeVerdicts = evaluated ? ARCHETYPES.map(arch => {
    const impactVec: Partial<DimensionVec> = {};
    for (const dim of DIMENSIONS) {
      impactVec[dim] = impacts[dim] || 0;
    }
    const afterVec = applyImpact(arch.target, impactVec);
    const simBefore = similarity(arch.target, selfVec);
    const simAfter = similarity(afterVec, selfVec);
    const archDecision = simAfter >= simBefore ? "do" : "skip";
    return {
      ...arch,
      decision: archDecision,
      text: archDecision === "do" ? arch.verdict_do : arch.verdict_skip,
    };
  }) : [];

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold">Decision engine</h2>

      <div className="relative">
        <input
          data-testid="input-decision"
          type="text"
          value={decisionText}
          onChange={(e) => { setDecisionText(e.target.value); setEvaluated(false); }}
          placeholder="Should I..."
          className="w-full px-3 py-2.5 rounded-[10px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="flex gap-2">
        <button
          data-testid="button-analyze"
          onClick={() => analyzeMutation.mutate(decisionText)}
          disabled={analyzeMutation.isPending || !decisionText.trim()}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] border border-border bg-card text-xs font-medium hover:bg-accent/50 transition-colors disabled:opacity-40"
        >
          <Zap className="w-3 h-3" />
          {analyzeMutation.isPending ? "Analyzing..." : "Analyze"}
        </button>
        <button
          data-testid="button-evaluate"
          onClick={handleEvaluate}
          disabled={!decisionText.trim()}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all disabled:opacity-40"
        >
          Evaluate
        </button>
      </div>

      {(reasoning || quickTake) && (
        <div className="p-3 rounded-[10px] border border-primary/20 bg-primary/5 text-xs text-muted-foreground space-y-1">
          {quickTake && <p className="font-medium text-foreground text-sm">{quickTake}</p>}
          {reasoning && <p>{reasoning}</p>}
        </div>
      )}

      {/* Impact sliders */}
      <div className="space-y-2">
        {DIMENSIONS.map(dim => (
          <div key={dim} className="space-y-0.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">{DIMENSION_LABELS[dim]}</label>
              <span className={`text-xs tabular-nums font-medium ${(impacts[dim] || 0) > 0 ? "text-green-600" : (impacts[dim] || 0) < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                {(impacts[dim] || 0) > 0 ? "+" : ""}{impacts[dim] || 0}
              </span>
            </div>
            <input
              data-testid={`slider-impact-${dim}`}
              type="range"
              min={-50}
              max={50}
              value={impacts[dim] || 0}
              onChange={(e) => handleImpactChange(dim, parseInt(e.target.value, 10))}
              className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer accent-primary [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-sm"
            />
          </div>
        ))}
      </div>

      {/* Verdict */}
      {evaluated && verdict && (
        <div className="space-y-3">
          <div
            data-testid="card-verdict"
            className={`p-3 rounded-[10px] border text-center ${
              verdict === "do"
                ? "border-green-500/30 bg-green-500/5"
                : verdict === "skip"
                ? "border-red-500/30 bg-red-500/5"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              {verdict === "do" && <Check className="w-4 h-4 text-green-600" />}
              {verdict === "skip" && <X className="w-4 h-4 text-red-500" />}
              {verdict === "neutral" && <Minus className="w-4 h-4 text-muted-foreground" />}
              <span className="text-sm font-bold">
                {verdict === "do" && "Do it"}
                {verdict === "skip" && "Skip it"}
                {verdict === "neutral" && "Neutral"}
              </span>
            </div>
          </div>

          {/* Archetype verdict grid */}
          <div className="grid grid-cols-2 gap-2">
            {archetypeVerdicts.map(av => (
              <div
                key={av.key}
                data-testid={`card-verdict-${av.key}`}
                className="p-2.5 rounded-[10px] border border-border bg-card text-xs"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-display" style={{ color: av.color }}>{av.emoji}</span>
                  <span className="font-medium" style={{ color: av.color }}>{av.name}</span>
                  {av.decision === "do" ? (
                    <Check className="w-3 h-3 text-green-600 ml-auto" />
                  ) : (
                    <X className="w-3 h-3 text-red-400 ml-auto" />
                  )}
                </div>
                <p className="text-muted-foreground leading-relaxed">{av.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision Simulator — only shows after LLM analysis */}
      {hasLLMAnalysis && (predictedShift || riskFactors.length > 0 || potentialGains.length > 0) && (
        <div className="space-y-3" data-testid="card-decision-simulator">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Decision Simulator</h3>

          {/* Predicted Archetype Shift */}
          {predictedShift && predictedShift.from && predictedShift.to && (
            <div className="p-3 rounded-[10px] border border-border bg-card">
              <p className="text-xs text-muted-foreground mb-2">Predicted archetype shift</p>
              <div className="flex items-center justify-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-display" style={{ color: ARCHETYPE_MAP[predictedShift.from]?.color }}>{ARCHETYPE_MAP[predictedShift.from]?.emoji || ""}</span>
                  <span
                    className="text-sm font-medium"
                    style={{ color: ARCHETYPE_MAP[predictedShift.from]?.color }}
                  >
                    {ARCHETYPE_MAP[predictedShift.from]?.name || predictedShift.from}
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-display" style={{ color: ARCHETYPE_MAP[predictedShift.to]?.color }}>{ARCHETYPE_MAP[predictedShift.to]?.emoji || ""}</span>
                  <span
                    className="text-sm font-medium"
                    style={{ color: ARCHETYPE_MAP[predictedShift.to]?.color }}
                  >
                    {ARCHETYPE_MAP[predictedShift.to]?.name || predictedShift.to}
                  </span>
                </div>
              </div>
              {/* Confidence bar */}
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Confidence</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {Math.round(predictedShift.confidence * 100)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-all"
                    style={{ width: `${Math.round(predictedShift.confidence * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Risk Factors & Potential Gains */}
          <div className="flex flex-wrap gap-1.5">
            {riskFactors.map((risk, i) => (
              <span
                key={`risk-${i}`}
                data-testid={`pill-risk-${i}`}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
              >
                {risk}
              </span>
            ))}
            {potentialGains.map((gain, i) => (
              <span
                key={`gain-${i}`}
                data-testid={`pill-gain-${i}`}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
              >
                {gain}
              </span>
            ))}
          </div>

          {/* Narrative */}
          {narrative && (
            <p className="text-sm italic text-muted-foreground leading-relaxed px-1" data-testid="text-decision-narrative">
              {narrative}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
