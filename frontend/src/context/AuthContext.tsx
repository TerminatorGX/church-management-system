import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError, setUnauthorizedHandler, tokenStore } from "../lib/api";
import type { Role, User } from "../lib/types";

interface AuthValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  /** ADMIN passes every check; otherwise the role must be listed. */
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
  }, [signOut]);

  // Restore the session on refresh by re-validating the stored token.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api<{ user: User }>("/auth/me")
      .then((res) => setUser(res.user))
      .catch((err) => {
        // A real 401 already clears the token via the shared handler in
        // api.ts. Anything else — the dev server mid-restart, a dropped
        // connection, a Supabase blip — is not proof the token is invalid,
        // so leave it in place instead of forcing an unnecessary re-login.
        if (err instanceof ApiError && err.status === 401) return;
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    tokenStore.set(res.token);
    setUser(res.user);
  }, []);

  const can = useCallback(
    (...roles: Role[]) => {
      if (!user) return false;
      if (user.role === "ADMIN") return true;
      return roles.includes(user.role);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, can }),
    [user, loading, signIn, signOut, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
