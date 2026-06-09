import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { loadSession, saveSession } from "@/lib/storage";
import { User } from "@/types";

interface AuthContextValue {
  user: User | null;
  status: "loading" | "authenticated" | "unauthenticated";
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// 凭证校验：复刻原 Web 端 `src/auth.ts` 的 Credentials provider
// （测试账号 test@example.com / password）。
function authorize(email: string, password: string): User | null {
  if (email === "test@example.com" && password === "password") {
    return { id: "1", name: "Test User", email };
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] =
    useState<AuthContextValue["status"]>("loading");

  useEffect(() => {
    loadSession().then((u) => {
      setUser(u);
      setStatus(u ? "authenticated" : "unauthenticated");
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const authed = authorize(email.trim(), password);
    if (!authed) return false;
    await saveSession(authed);
    setUser(authed);
    setStatus("authenticated");
    return true;
  }, []);

  const signOut = useCallback(async () => {
    await saveSession(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ user, status, signIn, signOut }),
    [user, status, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
