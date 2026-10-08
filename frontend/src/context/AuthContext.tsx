import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiResponse } from '@/lib/api';
import type { User } from '@/types/auth';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ApiResponse<{ user: User }>>('/auth/me')
      .then((res) => setUser(res.data.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      (err) => {
        const url: string = err.config?.url ?? '';
        if (err.response?.status === 401 && !url.includes('/auth/')) setUser(null);
        return Promise.reject(err);
      },
    );
    return () => api.interceptors.response.eject(id);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<ApiResponse<{ user: User }>>('/auth/login', { username, password });
    setUser(res.data.data.user);
    return res.data.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
