import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import ThemeToggle from "@/components/ThemeToggle";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

interface UserStat {
  id: number;
  username: string;
  displayName: string | null;
  joinDate: string;
  age: string | null;
  gender: string | null;
  location: string | null;
  checkins: number;
  writings: number;
  listens: number;
  spotifyConnected: boolean;
  lastActive: string;
}

interface AdminStats {
  users: UserStat[];
  aggregate: {
    totalUsers: number;
    totalCheckins: number;
    totalWritings: number;
    totalListens: number;
  };
  demographics: {
    genderCounts: Record<string, number>;
    ageCounts: Record<string, number>;
    locationCounts: Record<string, number>;
  };
}

// ── SVG Pie Chart ────────────────────────────────────────────

function PieChart({ data, title }: { data: Record<string, number>; title: string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;

  const colors = ["#7c8ba0", "#5a7d9a", "#6b9080", "#c17b6e", "#b8976a", "#8b7db8", "#6b8f8f", "#9b7a6b"];
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.4;

  let startAngle = -Math.PI / 2;
  const slices = entries.map(([label, value], i) => {
    const angle = (value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    startAngle = endAngle;

    return { path, color: colors[i % colors.length], label, value, pct: Math.round((value / total) * 100) };
  });

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">{title}</p>
      <div className="flex items-center gap-4">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((s, i) => (
            <path key={i} d={s.path} fill={s.color} opacity={0.7} stroke="hsl(var(--background))" strokeWidth={1} />
          ))}
        </svg>
        <div className="space-y-1">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color, opacity: 0.7 }} />
              <span className="text-[10px] text-muted-foreground/60">{s.label}</span>
              <span className="text-[10px] font-mono text-muted-foreground/40">{s.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function OraclePage() {
  const { user } = useAuth();

  // Guard: only oracle can see this
  if (!user || user.username !== "oracle") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground/40">Nothing here.</p>
      </div>
    );
  }

  const { data, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background noise-overlay pb-20">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="text-center py-20">
            <p className="text-sm text-muted-foreground/40 font-display animate-pulse">Loading oracle data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { users: userStats, aggregate, demographics } = data;

  return (
    <div className="min-h-screen bg-background noise-overlay pb-20">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </Link>
          <h1 className="text-base font-display font-semibold">Oracle</h1>
          <ThemeToggle />
        </header>

        {/* Aggregate Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Users", value: aggregate.totalUsers },
            { label: "Check-ins", value: aggregate.totalCheckins },
            { label: "Writings", value: aggregate.totalWritings },
            { label: "Listens", value: aggregate.totalListens },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-[10px] bg-card/30 border border-border/30 text-center">
              <p className="text-xl font-mono font-semibold text-foreground/80">{s.value}</p>
              <p className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Demographics Pie Charts */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <PieChart data={demographics.genderCounts} title="Gender" />
          <PieChart data={demographics.ageCounts} title="Age" />
          <PieChart data={demographics.locationCounts} title="Location" />
        </div>

        {/* User Table */}
        <div>
          <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest mb-3">
            All users ({userStats.length})
          </p>
          <div className="overflow-x-auto rounded-[10px] border border-border/30">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-card/30 text-muted-foreground/50">
                  <th className="px-3 py-2 text-left font-mono font-medium">User</th>
                  <th className="px-3 py-2 text-left font-mono font-medium">Joined</th>
                  <th className="px-3 py-2 text-left font-mono font-medium">Demo</th>
                  <th className="px-2 py-2 text-center font-mono font-medium">CI</th>
                  <th className="px-2 py-2 text-center font-mono font-medium">WR</th>
                  <th className="px-2 py-2 text-center font-mono font-medium">SP</th>
                  <th className="px-3 py-2 text-left font-mono font-medium">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {userStats.map(u => {
                  const joinDate = new Date(u.joinDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  const lastDate = u.lastActive
                    ? new Date(u.lastActive).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : "—";
                  const demo = [u.age, u.gender, u.location].filter(Boolean).join(" · ") || "—";

                  return (
                    <tr key={u.id} className="border-t border-border/20 hover:bg-card/20 transition-colors">
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground/70">{u.displayName || u.username}</p>
                        <p className="text-[9px] text-muted-foreground/40 font-mono">@{u.username}</p>
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground/50">{joinDate}</td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground/40">{demo}</td>
                      <td className="px-2 py-2 text-center font-mono text-muted-foreground/60">{u.checkins}</td>
                      <td className="px-2 py-2 text-center font-mono text-muted-foreground/60">{u.writings}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={`inline-block w-2 h-2 rounded-full ${u.spotifyConnected ? "bg-green-500" : "bg-muted-foreground/20"}`} />
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground/50">{lastDate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[9px] text-muted-foreground/30 font-mono mt-2">
            CI = check-ins · WR = writings · SP = spotify connected
          </p>
        </div>
      </div>
    </div>
  );
}
