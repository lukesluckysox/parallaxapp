import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { setAuthToken, queryClient } from "./queryClient";

interface User {
  id: number;
  username: string;
  displayName?: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (username: string, password: string, displayName?: string, age?: number, gender?: string, location?: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  justRegistered: boolean;
  clearOnboarding: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [justRegistered, setJustRegistered] = useState(false);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("./api/auth/me", { credentials: "same-origin" });
        if (res.ok) {
          const data = await res.json();
          if (data && data.id) {
            setUser({ id: data.id, username: data.username, displayName: data.displayName });
            setAuthToken(data.token || null);
          }
        }
      } catch { /* no session */ }
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch("./api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Login failed" }));
        return { ok: false, error: data.error || "Login failed" };
      }
      const data = await res.json();
      setUser({ id: data.id, username: data.username, displayName: data.displayName });
      setAuthToken(data.token);
      queryClient.clear();
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, []);

  const register = useCallback(async (username: string, password: string, displayName?: string, age?: number, gender?: string, location?: string) => {
    try {
      const res = await fetch("./api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, displayName, age, gender, location }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Registration failed" }));
        return { ok: false, error: data.error || "Registration failed" };
      }
      const data = await res.json();
      setUser({ id: data.id, username: data.username, displayName: data.displayName });
      setAuthToken(data.token);
      queryClient.clear();
      setJustRegistered(true);
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await fetch("./api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch {}
    setUser(null);
    setAuthToken(null);
    queryClient.clear();
  }, []);

  const clearOnboarding = useCallback(() => {
    setJustRegistered(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: !!user, isLoading, justRegistered, clearOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
