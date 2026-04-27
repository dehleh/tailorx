'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { AdminUser } from './api';

interface AuthContextType {
  user: AdminUser | null;
  login: (user: AdminUser) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = Cookies.get('tailorx_admin_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        Cookies.remove('tailorx_admin_user');
        Cookies.remove('tailorx_admin_token');
      }
    }
    setIsLoading(false);
  }, []);

  const login = (adminUser: AdminUser) => {
    // Cookies are restricted to HTTPS in production (secure flag) and same-site
    // strict to mitigate CSRF. Note: js-cookie cannot set HttpOnly (browser-side
    // limitation) — moving to a server-side session is the next hardening step.
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const opts: Cookies.CookieAttributes = {
      expires: 1,
      sameSite: 'strict',
      secure: isHttps,
    };
    Cookies.set('tailorx_admin_token', adminUser.token, opts);
    Cookies.set('tailorx_admin_user', JSON.stringify(adminUser), opts);
    setUser(adminUser);
  };

  const logout = () => {
    Cookies.remove('tailorx_admin_token');
    Cookies.remove('tailorx_admin_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
