import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as oauth from 'oauth4webapi';
import { apiRepository } from '@/config';
import { authorizationServer, oauthClient, buildAuthorizationUrl, buildLogoutUrl } from '@/config/oauth';
import { AUTH_STORAGE_KEY, CURRENT_USER_STORAGE_KEY } from '@/constants';
import type { AuthUser } from '@/types';

// Refresh token 5 minutes before expiry
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  error: Error | null;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Helper: Save current user to storage for content script access
function saveCurrentUserToStorage(user: AuthUser): void {
  chrome.storage.local.set({
    [CURRENT_USER_STORAGE_KEY]: {
      id: user.sub,
      email: user.email,
    },
  });
}

// Helper: Clear all auth data from storage
function clearAuthStorage(): void {
  chrome.storage.local.remove([AUTH_STORAGE_KEY, CURRENT_USER_STORAGE_KEY]);
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Helper: Clear auth state and storage
  const clearAuth = useCallback(() => {
    setUser(null);
    setIsAuthenticated(false);
    clearAuthStorage();
  }, []);

  // Helper: Set authenticated user
  const setAuthenticatedUser = useCallback((newUser: AuthUser) => {
    setUser(newUser);
    setIsAuthenticated(true);
    saveCurrentUserToStorage(newUser);
  }, []);

  // Update API repository token when user changes
  useEffect(() => {
    if (apiRepository) {
      apiRepository.setAccessToken(user?.access_token ?? null, 'Bearer');
    }
  }, [user]);

  // Refresh token using refresh_token grant
  const refreshAccessToken = useCallback(async (currentUser: AuthUser): Promise<AuthUser | null> => {
    if (!currentUser.refresh_token) {
      return null;
    }

    try {
      const response = await oauth.refreshTokenGrantRequest(
        authorizationServer,
        oauthClient,
        oauth.None(),
        currentUser.refresh_token
      );

      const result = await oauth.processRefreshTokenResponse(
        authorizationServer,
        oauthClient,
        response
      );

      const newUser: AuthUser = {
        ...currentUser,
        access_token: result.access_token,
        id_token: result.id_token ?? currentUser.id_token,
        refresh_token: result.refresh_token ?? currentUser.refresh_token,
        expires_at: Date.now() + (result.expires_in ?? 3600) * 1000,
      };

      await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: newUser });
      return newUser;
    } catch {
      return null;
    }
  }, []);

  // Initialize from storage and handle token refresh
  useEffect(() => {
    const initAuth = async () => {
      const result = await chrome.storage.local.get([AUTH_STORAGE_KEY]);
      const savedUser = result[AUTH_STORAGE_KEY] as AuthUser | undefined;

      if (!savedUser) {
        setIsLoading(false);
        return;
      }

      const timeUntilExpiry = savedUser.expires_at - Date.now();

      if (timeUntilExpiry < TOKEN_REFRESH_BUFFER_MS) {
        const refreshedUser = await refreshAccessToken(savedUser);
        if (refreshedUser) {
          setAuthenticatedUser(refreshedUser);
        } else {
          clearAuthStorage();
        }
      } else {
        setAuthenticatedUser(savedUser);
      }

      setIsLoading(false);
    };

    initAuth();
  }, [refreshAccessToken, setAuthenticatedUser]);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!user?.refresh_token || !user.expires_at) {
      return;
    }

    const timeUntilRefresh = user.expires_at - Date.now() - TOKEN_REFRESH_BUFFER_MS;

    if (timeUntilRefresh <= 0) {
      refreshAccessToken(user).then((refreshedUser) => {
        if (refreshedUser) {
          setUser(refreshedUser);
        } else {
          clearAuth();
        }
      });
      return;
    }

    const timerId = setTimeout(async () => {
      const refreshedUser = await refreshAccessToken(user);
      if (refreshedUser) {
        setUser(refreshedUser);
      } else {
        clearAuth();
      }
    }, timeUntilRefresh);

    return () => clearTimeout(timerId);
  }, [user, refreshAccessToken, clearAuth]);

  const signIn = useCallback(async () => {
    const redirectUri = chrome.identity.getRedirectURL();
    const codeVerifier = oauth.generateRandomCodeVerifier();
    const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
    const authUrl = buildAuthorizationUrl(codeChallenge);

    setIsLoading(true);
    setError(null);

    chrome.identity.launchWebAuthFlow(
      { url: authUrl.href, interactive: true },
      async (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          setIsLoading(false);
          setError(new Error(chrome.runtime.lastError?.message || 'Auth failed'));
          return;
        }

        try {
          const callbackParams = oauth.validateAuthResponse(
            authorizationServer,
            oauthClient,
            new URL(responseUrl),
            oauth.expectNoState
          );

          const response = await oauth.authorizationCodeGrantRequest(
            authorizationServer,
            oauthClient,
            oauth.None(),
            callbackParams,
            redirectUri,
            codeVerifier
          );

          const result = await oauth.processAuthorizationCodeResponse(
            authorizationServer,
            oauthClient,
            response
          );

          const claims = oauth.getValidatedIdTokenClaims(result);
          if (!claims || !result.id_token) {
            throw new Error('Missing ID token claims');
          }

          const newUser: AuthUser = {
            sub: claims.sub,
            email: claims.email as string | undefined,
            access_token: result.access_token,
            id_token: result.id_token,
            refresh_token: result.refresh_token,
            expires_at: Date.now() + (result.expires_in ?? 3600) * 1000,
          };

          await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: newUser });
          setAuthenticatedUser(newUser);
          setIsLoading(false);
        } catch (err) {
          setIsLoading(false);
          setError(err instanceof Error ? err : new Error('Token exchange failed'));
        }
      }
    );
  }, [setAuthenticatedUser]);

  const signOut = useCallback(() => {
    clearAuth();

    chrome.identity.launchWebAuthFlow(
      { url: buildLogoutUrl(), interactive: false },
      () => {
        // Ignore errors on logout
      }
    );
  }, [clearAuth]);

  const value: AuthContextValue = {
    isLoading,
    isAuthenticated,
    user,
    error,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
