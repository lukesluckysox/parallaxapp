import { useAuth } from "@/lib/auth-context";
import { Lock } from "lucide-react";

interface ProGateProps {
  children: React.ReactNode;
  feature?: string;
  inline?: boolean; // If true, renders inline placeholder instead of card
}

export default function ProGate({ children, feature, inline }: ProGateProps) {
  const { user } = useAuth();

  if (user?.pro) {
    return <>{children}</>;
  }

  if (inline) {
    return (
      <button
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/30 bg-card/20 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 hover:bg-card/40 transition-colors"
        data-testid={`pro-gate-${feature || "feature"}`}
        onClick={() => {/* future: open upgrade modal */}}
      >
        <Lock className="w-3 h-3" />
        <span>Fellow</span>
      </button>
    );
  }

  return (
    <div
      className="p-4 rounded-[10px] border border-border/20 bg-card/10 text-center"
      data-testid={`pro-gate-${feature || "feature"}`}
    >
      <div className="flex items-center justify-center gap-2 mb-2">
        <Lock className="w-3.5 h-3.5 text-muted-foreground/25" />
        <span className="text-[10px] font-mono text-muted-foreground/30 uppercase tracking-widest">
          {feature || "Fellow Feature"}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground/25 mb-3">
        Unlock deeper self-examination with Fellow access
      </p>
      <button
        className="px-4 py-1.5 rounded-lg bg-primary/10 text-primary/60 text-[11px] font-medium hover:bg-primary/20 transition-colors"
        onClick={() => {/* future: open Stripe checkout */}}
      >
        Fellow · $15/mo · Coming soon
      </button>
    </div>
  );
}

/** Hook for quick pro checks in logic */
export function useIsPro(): boolean {
  const { user } = useAuth();
  return !!user?.pro;
}
