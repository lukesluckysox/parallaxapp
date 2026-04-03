import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import IdentityHelix from "@/components/IdentityHelix";

export default function HelixPage() {
  const { data, isLoading } = useQuery<{ history: any[] }>({
    queryKey: ["/api/variant-history"],
    staleTime: 5 * 60_000,
  });

  const history = data?.history || [];

  return (
    <div className="min-h-screen bg-background pb-20 noise-overlay">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <Link
            href="/motion"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Motion
          </Link>
          <h1 className="text-base font-bold">Variant DNA</h1>
          <div />
        </header>

        {/* Subtitle */}
        <div className="text-center mb-6">
          <p className="text-[10px] font-mono text-muted-foreground/30 tracking-wider uppercase">
            identity evolution over time
          </p>
          {history.length > 0 && (
            <p className="text-[9px] font-mono text-muted-foreground/20 mt-1">
              tap a node to reveal its archetype
            </p>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center py-20">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary/60 rounded-full animate-spin" />
            <p className="text-[10px] text-muted-foreground/30 font-mono mt-4">loading helix</p>
          </div>
        )}

        {/* Helix */}
        {!isLoading && <IdentityHelix history={history} fullPage />}
      </div>
    </div>
  );
}
