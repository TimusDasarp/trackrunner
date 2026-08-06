/**
 * Auth context provider
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { SessionStore } from '../services/sessionStore';
import { api } from '../services/api';
import { socketClient } from '../services/socketClient';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const token = await SessionStore.getToken();
      const savedUser = await SessionStore.getUser();
      if (token && savedUser) {
        setUser(savedUser);
        // Connect socket on startup if already logged in
        socketClient.connect().catch((err) => {
          console.warn('[Auth] Socket connection failed on startup:', err);
        });
      }
    } catch (err) {
      console.error('[Auth] Check failed:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const response = await api.login({ email, password });
    if (response.user.role !== 'runner') {
      throw new Error('This app is for courier accounts. Please sign in with a runner account.');
    }
    await SessionStore.saveToken(response.token);
    await SessionStore.saveUser(response.user);
    setUser(response.user);

    // Connect socket after successful login
    try {
      await socketClient.connect();
    } catch (err) {
      console.warn('[Auth] Socket connection failed:', err);
    }
  }

  async function logout() {
    try {
      await api.logout();
    } catch (err) {
      // ignore
    }
    socketClient.disconnect();
    await SessionStore.clearAll();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
