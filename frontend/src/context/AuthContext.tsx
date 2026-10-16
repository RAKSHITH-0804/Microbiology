import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiResponse } from '@/lib/api';
import type { User } from '@/types/auth';

/** Error code the API returns while the account is still on its temporary password. */
const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';
const MODULE_DISABLED = 'MODULE_DISABLED';
/** The server ended the session after 17 minutes without activity. */
const SESSION_IDLE = 'SESSION_IDLE';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Call after the temporary password was replaced, to lift the first-login lock. */
  markPasswordChanged: () => void;
  /** Re-reads the signed-in account, e.g. after its module permissions changed. */
  refreshUser: () => Promise<void>;
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

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<{ user: User }>>('/auth/me');
      setUser(res.data.data.user);
    } catch {
      // A failed refresh keeps the current session; a 401 is handled by the interceptor below.
    }
  }, []);

  // Pick up permission changes made by the Super Admin when the user comes back to the tab.
  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) return;
    const onVisible = () => document.visibilityState === 'visible' && refreshUser();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [signedIn, refreshUser]);

  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      (err) => {
        const url: string = err.config?.url ?? '';
        const status = err.response?.status;
        if (status === 401 && err.response?.data?.errors?.code === SESSION_IDLE) {
          setUser(null);
          toast.info('You were signed out due to inactivity.', {
            id: SESSION_IDLE,
            description: 'Sign in again to continue where you left off.',
          });
        } else if (status === 401 && !url.includes('/auth/')) setUser(null);
        if (status === 403 && err.response?.data?.errors?.code === PASSWORD_CHANGE_REQUIRED) {
          setUser((current) => (current && !current.mustChangePassword ? { ...current, mustChangePassword: true } : current));
        }
        // A module was switched off since sign-in: reload the account so the sidebar drops it.
        if (status === 403 && err.response?.data?.errors?.code === MODULE_DISABLED) refreshUser();
        return Promise.reject(err);
      },
    );
    return () => api.interceptors.response.eject(id);
  }, [refreshUser]);

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

  const markPasswordChanged = useCallback(() => {
    setUser((current) => (current ? { ...current, mustChangePassword: false } : current));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, markPasswordChanged, refreshUser }),
    [user, loading, login, logout, markPasswordChanged, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
