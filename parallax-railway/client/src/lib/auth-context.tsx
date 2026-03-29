import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { setCurrentUserId, queryClient } from "./queryClient";

interface User {
  id: number;
  username: string;
  displayName?: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (username: string, password: string, displayName?: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch("./api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Login failed" }));
        return { ok: false, error: data.error || "Login failed" };
      }
      const data = await res.json();
      setUser(data);
      setCurrentUserId(data.id);
      // Clear all cached queries so they refetch with the new user
      queryClient.clear();
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, []);

  const register = useCallback(async (username: string, password: string, displayName?: string) => {
    try {
      const res = await fetch("./api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, displayName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Registration failed" }));
        return { ok: false, error: data.error || "Registration failed" };
      }
      const data = await res.json();
      setUser(data);
      setCurrentUserId(data.id);
      queryClient.clear();
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setCurrentUserId(null);
    queryClient.clear();
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
