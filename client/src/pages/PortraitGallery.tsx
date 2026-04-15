import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Sparkles, X, Save, Trash2 } from "lucide-react";
import { Link } from "wouter";
import PortraitSVG from "@/components/PortraitSVG";

interface Portrait {
  id: number;
  user_id: number;
  generated_at: string;
  dimension_vec: string;
  dominant_archetype: string;
  secondary_archetype: string | null;
  active_modes: string;
  recent_tensions: string;
  motif_keywords: string;
  spotify_energy_profile: string;
  prompt_used: string;
  image_url: string;
  symbolic_description: string;
  palette: string;
  glyph_composition: string;
  comparison_note: string;
  user_reflection: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-muted-foreground/60 font-mono capitalize">{label}</span>
      <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${value}%`,
            backgroundColor: value > 65 ? "#FFD166" : value > 35 ? "#7c8ba0" : "#3a3f4b",
          }}
        />
      </div>
      <span className="w-8 text-right font-mono text-muted-foreground/40">{value}</span>
    </div>
  );
}

function ExpandedPortrait({
  portrait,
  onClose,
}: {
  portrait: Portrait;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reflection, setReflection] = useState(portrait.user_reflection || "");
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/portraits/${portrait.id}`, { user_reflection: reflection });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portraits"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/portraits/${portrait.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portraits"] });
      onClose();
    },
  });

  const dims = JSON.parse(portrait.dimension_vec);
  const palette: string[] = JSON.parse(portrait.palette || "[]");
  const activeModes: string[] = JSON.parse(portrait.active_modes || "[]");
  const tensions: string[] = JSON.parse(portrait.recent_tensions || "[]");
  const hasImage = portrait.image_url && portrait.image_url.length > 0;

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#0d1117] border border-border/30 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-display text-[#FFD166]">
              {portrait.dominant_archetype.charAt(0).toUpperCase() + portrait.dominant_archetype.slice(1)}
              {portrait.secondary_archetype && (
                <span className="text-muted-foreground/50 text-sm ml-2">
                  / {portrait.secondary_archetype.charAt(0).toUpperCase() + portrait.secondary_archetype.slice(1)}
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground/40 font-mono">{formatDate(portrait.generated_at)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground/40 hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {hasImage ? (
          <div className="w-full mb-6 rounded-lg overflow-hidden">
            <img
              src={portrait.image_url}
              alt={portrait.symbolic_description}
              className="w-full aspect-video object-cover"
            />
          </div>
        ) : (
          <div className="w-full max-w-xs mx-auto mb-6">
            <PortraitSVG glyphComposition={portrait.glyph_composition} />
          </div>
        )}

        {palette.length > 0 && (
          <div className="flex gap-1.5 mb-4 justify-center">
            {palette.map((c, i) => (
              <div key={i} className="w-6 h-6 rounded-full border border-border/20" style={{ backgroundColor: c }} />
            ))}
          </div>
        )}

        <p className="text-sm text-foreground/80 mb-4 leading-relaxed">{portrait.symbolic_description}</p>

        {portrait.comparison_note && (
          <p className="text-xs text-muted-foreground/50 italic mb-4 border-l-2 border-[#FFD166]/30 pl-3">
            {portrait.comparison_note}
          </p>
        )}

        <div className="space-y-1.5 mb-4">
          {Object.entries(dims).map(([key, val]) => (
            <DimensionBar key={key} label={key} value={val as number} />
          ))}
        </div>

        {activeModes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {activeModes.map((m, i) => (
              <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#FFD166]/10 text-[#FFD166]/70 border border-[#FFD166]/20">
                {m}
              </span>
            ))}
          </div>
        )}

        {tensions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {tensions.map((t, i) => (
              <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-400/70 border border-red-500/20">
                tension: {t}
              </span>
            ))}
          </div>
        )}

        <div className="border-t border-border/20 pt-4">
          <label className="text-xs text-muted-foreground/50 font-mono block mb-2">reflection</label>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="What does this portrait surface for you?"
            className="w-full bg-transparent border border-border/30 rounded-lg p-3 text-sm text-foreground/80 placeholder:text-muted-foreground/20 resize-none h-20 focus:outline-none focus:border-[#FFD166]/30"
          />
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="mt-2 flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-md bg-[#FFD166]/10 text-[#FFD166] border border-[#FFD166]/20 hover:bg-[#FFD166]/20 transition-colors disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            {saved ? "saved" : saveMutation.isPending ? "saving..." : "save reflection"}
          </button>
        </div>

        <div className="border-t border-border/20 pt-4 mt-4 flex items-center justify-end">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground/50 font-mono">delete this portrait?</span>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="text-xs font-mono px-2 py-1 rounded-md bg-red-500/10 text-red-400/70 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? "deleting..." : "yes, delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs font-mono px-2 py-1 rounded-md text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1 text-xs font-mono text-muted-foreground/30 hover:text-red-400/70 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PortraitGallery() {
  const [expanded, setExpanded] = useState<Portrait | null>(null);
  const queryClient = useQueryClient();

  const { data: portraits = [], isLoading } = useQuery<Portrait[]>({
    queryKey: ["/api/portraits"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/portraits/generate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portraits"] });
    },
  });

  return (
    <div className="min-h-screen bg-[#0d1117] pb-28 pt-14">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-muted-foreground/40 hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-lg font-display text-[#FFD166]">portraits</h1>
        </div>

        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="w-full mb-6 flex items-center justify-center gap-2 py-3 rounded-lg border border-[#FFD166]/20 bg-[#FFD166]/5 text-[#FFD166] font-mono text-sm hover:bg-[#FFD166]/10 transition-colors disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          {generateMutation.isPending ? "generating..." : "generate new portrait"}
        </button>

        {generateMutation.isError && (
          <p className="text-xs text-red-400/70 mb-4 font-mono">
            {(generateMutation.error as Error).message}
          </p>
        )}

        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-square bg-border/10 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && portraits.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground/30 text-sm font-mono">
              no portraits yet. generate your first identity portrait.
            </p>
          </div>
        )}

        {!isLoading && portraits.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {portraits.map((p) => {
              const hasImage = p.image_url && p.image_url.length > 0;
              return (
                <button
                  key={p.id}
                  onClick={() => setExpanded(p)}
                  className="group text-left bg-[#0d1117] border border-border/20 rounded-xl overflow-hidden hover:border-[#FFD166]/30 transition-all"
                >
                  {hasImage ? (
                    <div className="aspect-video">
                      <img
                        src={p.image_url}
                        alt={p.symbolic_description}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="aspect-square p-2">
                      <PortraitSVG glyphComposition={p.glyph_composition} />
                    </div>
                  )}
                  <div className="px-3 pb-3 pt-2">
                    <p className="text-xs font-mono text-[#FFD166]/70 capitalize">
                      {p.dominant_archetype}
                    </p>
                    <p className="text-[10px] text-muted-foreground/30 font-mono">
                      {formatDate(p.generated_at)}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1 line-clamp-2">
                      {p.symbolic_description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {expanded && <ExpandedPortrait portrait={expanded} onClose={() => setExpanded(null)} />}
    </div>
  );
}
