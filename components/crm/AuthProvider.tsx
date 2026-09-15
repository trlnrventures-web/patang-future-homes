"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type CrmUserContext = {
  id: number;
  name: string;
  email: string;
  role: string;
  phone: string | null;
};

type AuthContextType = {
  user: CrmUserContext | null;
  setUser: (u: CrmUserContext | null) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser: CrmUserContext | null;
}) {
  const [user, setUser] = useState<CrmUserContext | null>(initialUser);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/crm/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch {
      // ignore
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/crm/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setUser(null);
    window.location.href = "/crm/login";
  }, []);

  useEffect(() => {
    fetch("/crm/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.user) setUser(d.user); })
      .catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function roleLabel(role: string): string {
  switch (role) {
    case "admin":
      return "Owner / Admin";
    case "sales_head":
      return "Sales Head";
    case "sales_manager":
      return "Sales Manager";
    case "caller":
      return "Caller";
    case "marketing":
      return "Marketing";
    default:
      return role;
  }
}