'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AdminUser, fetchCurrentAdmin, logoutAdmin } from './api';

interface AuthContextType {
  user: AdminUser | null;
  login: (user: AdminUser) => void;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: async () => {},
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // The auth token now lives in an HttpOnly cookie that JS cannot read.
    // We hydrate the user object via /api/admin/auth/me, which the server
    // reads from the (also HttpOnly) user cookie.
    let cancelled = false;
    fetchCurrentAdmin()
      .then((res) => {
        if (!cancelled) setUser(res.data.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = (adminUser: AdminUser) => {
    // Cookies were already set HttpOnly by /api/admin/auth/verify-otp.
    setUser(adminUser);
  };

  const logout = async () => {
    try {
      await logoutAdmin();
    } catch {
      // Best-effort — clear local state regardless
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
