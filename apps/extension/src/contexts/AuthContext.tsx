import * as oauth from 'oauth4webapi';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { buildLogoutUrl, revokeRefreshToken } from '@/config/oauth';
import { AUTH_STORAGE_KEY } from '@/constants';
import { refreshStoredSession, requestSignIn } from '@/lib/authFlow';
import { beginSignIn, clearAuthStorage, commitAuth, LAST_ORDER_USER_KEY } from '@/lib/authStorage';
import { mutateOrderStorage } from '@/lib/orderStorage';
import type { AuthUser } from '@/types';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  workspaceUserId: string;
  error: Error | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

interface SessionSnapshot {
  user: AuthUser | null;
  workspaceUserId: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const user = snapshot?.user ?? null;
  const workspaceUserId = snapshot?.workspaceUserId ?? 'local';
  const isLoading = snapshot === undefined || isSigningIn;
  const isAuthenticated = !!user && user.expires_at > Date.now();
  const [error, setError] = useState<Error | null>(null);
  const generation = useRef(0);
  const refreshController = useRef<AbortController | null>(null);

  const adoptSession = useCallback((session: AuthUser | null, owner?: string) => {
    setSnapshot((previous) => ({
      user: session,
      workspaceUserId: session?.sub ?? owner ?? previous?.workspaceUserId ?? 'local',
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let storageChanged = false;
    const init = async () => {
      const stored = await chrome.storage.local.get<{
        auth_user?: AuthUser;
        last_order_user?: string;
      }>([AUTH_STORAGE_KEY, LAST_ORDER_USER_KEY]);
      if (cancelled || storageChanged) {
        return;
      }
      adoptSession(stored[AUTH_STORAGE_KEY] ?? null, stored[LAST_ORDER_USER_KEY] ?? 'local');
    };
    void init().catch((err) => {
      if (!cancelled && !storageChanged) {
        setError(err);
        adoptSession(null);
      }
    });
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[AUTH_STORAGE_KEY]) {
        storageChanged = true;
        generation.current += 1;
        refreshController.current?.abort();
        const previousUser = changes[AUTH_STORAGE_KEY].oldValue as AuthUser | undefined;
        adoptSession(
          (changes[AUTH_STORAGE_KEY].newValue as AuthUser | undefined) ?? null,
          (changes[LAST_ORDER_USER_KEY]?.newValue as string | undefined) ?? previousUser?.sub,
        );
        setError(null);
      }
    };
    chrome.storage.onChanged?.addListener(changed);
    return () => {
      cancelled = true;
      chrome.storage.onChanged?.removeListener(changed);
    };
  }, [adoptSession]);

  useEffect(() => {
    if (!user || isLoading) {
      return;
    }
    const controller = new AbortController();
    refreshController.current = controller;
    const currentGeneration = generation.current;
    let timer: ReturnType<typeof setTimeout>;
    let refreshing = false;
    const handleRefreshFailure = async (err: unknown) => {
      if (controller.signal.aborted || generation.current !== currentGeneration) {
        return;
      }
      // Only a definitive invalid grant destroys the saved refresh credential.
      if (err instanceof oauth.ResponseBodyError && err.error === 'invalid_grant') {
        if (await clearAuthStorage(user.access_token)) {
          adoptSession(null);
        }
      } else {
        setError(err instanceof Error ? err : new Error('Unable to refresh session'));
        timer = setTimeout(() => {
          void refresh().catch((cause) => setError(new Error('Session refresh failed', { cause })));
        }, 60_000);
      }
    };
    const refresh = async () => {
      if (refreshing || controller.signal.aborted) {
        return;
      }
      refreshing = true;
      clearTimeout(timer);
      try {
        if (!user.refresh_token) {
          if (await clearAuthStorage(user.access_token)) {
            adoptSession(null);
          }
          return;
        }
        const nextUser = await refreshStoredSession(user, controller.signal);
        if (nextUser && !controller.signal.aborted && generation.current === currentGeneration) {
          adoptSession(nextUser);
          setError(null);
        }
      } catch (err) {
        await handleRefreshFailure(err);
      } finally {
        refreshing = false;
      }
    };
    timer = setTimeout(
      () => {
        void refresh().catch((cause) => setError(new Error('Session refresh failed', { cause })));
      },
      Math.max(
        0,
        user.expires_at - Date.now() - (user.refresh_token ? TOKEN_REFRESH_BUFFER_MS : 0),
      ),
    );
    const online = () => {
      if (user.expires_at - Date.now() < (user.refresh_token ? TOKEN_REFRESH_BUFFER_MS : 0)) {
        void refresh().catch((cause) => setError(new Error('Session refresh failed', { cause })));
      }
    };
    window.addEventListener('online', online);
    return () => {
      clearTimeout(timer);
      controller.abort();
      window.removeEventListener('online', online);
    };
  }, [user, isLoading, adoptSession]);

  const signIn = useCallback(async () => {
    setIsSigningIn(true);
    setError(null);
    const currentGeneration = ++generation.current;
    refreshController.current?.abort();
    try {
      const revision = await beginSignIn();
      const nextUser = await requestSignIn();
      if (generation.current !== currentGeneration) {
        return;
      }
      if (await commitAuth(nextUser, { revision })) {
        // Anonymous orders join the first signed-in account; already owned records never move.
        await mutateOrderStorage({ kind: 'claim-local', userId: nextUser.sub });
        // The storage subscription is the canonical source of committed sessions.
      }
    } catch (err) {
      if (generation.current === currentGeneration) {
        setError(err instanceof Error ? err : new Error('Unable to sign in'));
      }
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = user?.refresh_token;
    generation.current += 1;
    refreshController.current?.abort();
    adoptSession(null);
    setError(null);
    setIsSigningIn(false);
    await clearAuthStorage();
    // Local sign-out is immediate even when Cognito is unavailable.
    if (refreshToken) {
      try {
        await revokeRefreshToken(refreshToken);
      } catch (cause) {
        console.warn('Local sign-out completed, but server token revocation failed:', cause);
      }
    }
    chrome.identity.launchWebAuthFlow({ url: buildLogoutUrl(), interactive: false }, () => {});
  }, [adoptSession, user?.refresh_token]);

  return (
    <AuthContext.Provider
      value={{ isLoading, isAuthenticated, user, workspaceUserId, error, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
