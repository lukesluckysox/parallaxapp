import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Link } from "wouter";
import { ArrowLeft, Users, FileText, Music, Activity } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const PIE_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#e0e7ff", "#f0abfc", "#f472b6"];

interface UserStat {
  id: number;
  username: string;
  displayName: string | null;
  joinedAt: string;
  age: number | null;
  gender: string | null;
  location: string | null;
  checkinCount: number;
  writingCount: number;
  spotifyListens: number;
  spotifyConnected: boolean;
  lastActiveAt: string;
}

interface AdminStats {
  totalUsers: number;
  totalCheckins: number;
  totalWritings: number;
  totalSpotifyListens: number;
  users: UserStat[];
}

function bucketAge(age: number | null): string {
  if (!age) return "Unknown";
  if (age < 18) return "Under 18";
  if (age <= 24) return "18–24";
  if (age <= 34) return "25–34";
  if (age <= 44) return "35–44";
  if (age <= 54) return "45–54";
  return "55+";
}

function formatGender(g: string | null): string {
  if (!g) return "Unknown";
  if (g === "prefer_not") return "Prefer not to say";
  if (g === "nonbinary") return "Non-binary";
  return g.charAt(0).toUpperCase() + g.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysSince(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function buildPieData(users: UserStat[], key: keyof UserStat, formatter: (v: any) => string) {
  const counts: Record<string, number> = {};
  for (const u of users) {
    const label = formatter(u[key] as any);
    counts[label] = (counts[label] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
}

function OraclePie({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="p-4 rounded-[10px] border border-border/40 bg-card/30 space-y-2">
      <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">{title}</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
            formatter={(value: number, name: string) => [`${value} user${value !== 1 ? "s" : ""}`, name]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function OraclePage() {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/stats");
      if (!res.ok) throw new Error("Forbidden");
      return res.json();
    },
    retry: false,
  });

  if (user?.username !== "oracle") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Not found.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground/40 font-mono">loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-destructive">Failed to load stats.</p>
      </div>
    );
  }

  const ageData = buildPieData(data.users, "age", bucketAge);
  const genderData = buildPieData(data.users, "gender", formatGender);
  const locationData = buildPieData(data.users, "location", (v) => v || "Unknown");

  return (
    <div className="min-h-screen bg-background pb-12 noise-overlay">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <header className="pt-3">
          <div className="flex items-center justify-between mb-4">
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Home
            </Link>
            <ThemeToggle />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-display font-semibold tracking-tight">Oracle</h1>
            <p className="text-[10px] text-muted-foreground/40 font-mono mt-0.5">admin view — for your eyes only</p>
          </div>
        </header>

        {/* Aggregate stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Users", value: data.totalUsers, icon: Users },
            { label: "Check-ins", value: data.totalCheckins, icon: Activity },
            { label: "Writings", value: data.totalWritings, icon: FileText },
            { label: "Tracks", value: data.totalSpotifyListens, icon: Music },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="p-4 rounded-[10px] border border-border/40 bg-card/30 text-center">
              <Icon className="w-4 h-4 text-muted-foreground/40 mx-auto mb-1" />
              <p className="text-2xl font-display font-semibold">{value}</p>
              <p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Pie charts */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <OraclePie title="Age Distribution" data={ageData} />
          <OraclePie title="Gender" data={genderData} />
          <OraclePie title="Location" data={locationData} />
        </div>

        {/* Per-user table */}
        <div className="space-y-2">
          <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">Users</p>
          <div className="rounded-[10px] border border-border/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 bg-card/50">
                    {["Username", "Joined", "Age", "Gender", "Location", "Check-ins", "Writings", "Tracks", "Spotify", "Last active"].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-mono text-[9px] text-muted-foreground/40 uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u, i) => (
                    <tr key={u.id} className={`border-b border-border/20 ${i % 2 === 0 ? "bg-card/10" : ""} hover:bg-card/30 transition-colors`}>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{u.username}</td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(u.joinedAt)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{u.age ?? "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{formatGender(u.gender)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{u.location || "—"}</td>
                      <td className="px-3 py-2.5 text-center">{u.checkinCount}</td>
                      <td className="px-3 py-2.5 text-center">{u.writingCount}</td>
                      <td className="px-3 py-2.5 text-center">{u.spotifyListens}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${u.spotifyConnected ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{daysSince(u.lastActiveAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
