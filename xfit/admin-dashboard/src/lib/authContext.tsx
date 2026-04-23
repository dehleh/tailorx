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
    Cookies.set('tailorx_admin_token', adminUser.token, { expires: 3, sameSite: 'strict' });
    Cookies.set('tailorx_admin_user', JSON.stringify(adminUser), { expires: 3, sameSite: 'strict' });
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
