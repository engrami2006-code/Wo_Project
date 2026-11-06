import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setAuthToken, setUnauthorizedHandler } from '../services/api';
import { authService } from '../services/auth';
import type { LoginRequest, RegisterRequest, Role, User } from '../types/api';

export const TOKEN_STORAGE_KEY = 'wo.token';

export function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* storage blocked: the token stays in memory only */
  }
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthValue {
  status: AuthStatus;
  user: User | null;
  token: string | null;
  login: (data: LoginRequest) => Promise<User>;
  register: (data: RegisterRequest) => Promise<User>;
  logout: (opts?: { remote?: boolean }) => Promise<void>;
  setUser: (user: User) => void;
  /** set when the session ended because the server rejected the token */
  sessionExpired: boolean;
  hasRole: (...roles: Role[]) => boolean;
  isSuperAdmin: boolean;
  isOwner: boolean;
  isEmployee: boolean;
  canManageUsers: boolean;
  /** delete records (water, recommendations…): everyone except EMPLOYEE */
  canDelete: boolean;
  /** edit farms, plantings, hydroponic systems, baselines: everyone except EMPLOYEE */
  canEditFarm: boolean;
  /** create farms: INDIVIDUAL, COMPANY_OWNER, SUPER_ADMIN */
  canCreateFarm: boolean;
  /** delete farms and hydroponic systems: INDIVIDUAL, COMPANY_OWNER, SUPER_ADMIN */
  canDeleteFarm: boolean;
  /** assign farm members: COMPANY_OWNER, SUPER_ADMIN */
  canManageMembers: boolean;
  /** add custom crops: everyone except EMPLOYEE */
  canCreateCrop: boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => {
    const t = readStoredToken();
    setAuthToken(t);
    return t;
  });
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() => (token ? 'loading' : 'anonymous'));
  const [sessionExpired, setSessionExpired] = useState(false);
  const bootstrapped = useRef(false);

  const clearSession = useCallback(() => {
    setAuthToken(null);
    storeToken(null);
    setToken(null);
    setUserState(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restore the session from a stored token.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (!token) return;
    authService
      .me()
      .then((me) => {
        setUserState(me);
        setStatus('authenticated');
      })
      .catch(() => clearSession());
  }, [token, clearSession]);

  // Any 401 on an authenticated request ends the session; ProtectedRoute redirects to /login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSessionExpired(true);
      clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const accept = useCallback((accessToken: string, me: User) => {
    setAuthToken(accessToken);
    storeToken(accessToken);
    setToken(accessToken);
    setUserState(me);
    setStatus('authenticated');
    setSessionExpired(false);
    return me;
  }, []);

  const login = useCallback(
    async (data: LoginRequest) => {
      const res = await authService.login(data);
      return accept(res.access_token, res.user);
    },
    [accept],
  );

  const register = useCallback(
    async (data: RegisterRequest) => {
      const res = await authService.register(data);
      return accept(res.access_token, res.user);
    },
    [accept],
  );

  const logout = useCallback(
    async (opts: { remote?: boolean } = {}) => {
      if (opts.remote !== false && token) {
        try {
          await authService.logout();
        } catch {
          /* the local session is cleared regardless */
        }
      }
      setSessionExpired(false);
      clearSession();
    },
    [token, clearSession],
  );

  const value = useMemo<AuthValue>(() => {
    const role = user?.role;
    const hasRole = (...roles: Role[]) => !!role && roles.includes(role);
    return {
      status,
      user,
      token,
      login,
      register,
      logout,
      setUser: setUserState,
      sessionExpired,
      hasRole,
      isSuperAdmin: role === 'SUPER_ADMIN',
      isOwner: role === 'COMPANY_OWNER',
      isEmployee: role === 'EMPLOYEE',
      canManageUsers: role === 'COMPANY_OWNER' || role === 'SUPER_ADMIN',
      canDelete: !!role && role !== 'EMPLOYEE',
      canEditFarm: !!role && role !== 'EMPLOYEE',
      canCreateFarm: hasRole('INDIVIDUAL', 'COMPANY_OWNER', 'SUPER_ADMIN'),
      canDeleteFarm: hasRole('INDIVIDUAL', 'COMPANY_OWNER', 'SUPER_ADMIN'),
      canManageMembers: hasRole('COMPANY_OWNER', 'SUPER_ADMIN'),
      canCreateCrop: !!role && role !== 'EMPLOYEE',
    };
  }, [status, user, token, login, register, logout, sessionExpired]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
