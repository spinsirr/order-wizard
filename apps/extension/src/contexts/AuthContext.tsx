import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as oauth from 'oauth4webapi';
import { apiRepository } from '@/config';

const AUTH_STORAGE_KEY = 'auth_user';
const CURRENT_USER_STORAGE_KEY = 'currentUser';

// Refresh token 5 minutes before expiry
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface AuthUser {
  sub: string;
  email?: string;
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_at: number;
}

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  error: Error | null;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// OAuth configuration
const issuer = new URL(import.meta.env.VITE_COGNITO_AUTHORITY);
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN;

const authorizationServer: oauth.AuthorizationServer = {
  issuer: issuer.href,
  authorization_endpoint: `${cognitoDomain}/oauth2/authorize`,
  token_endpoint: `${cognitoDomain}/oauth2/token`,
  end_session_endpoint: `${cognitoDomain}/logout`,
};

const client: oauth.Client = {
  client_id: clientId,
  token_endpoint_auth_method: 'none',
};

function buildLogoutUrl(redirectUri: string): string {
  return `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(redirectUri)}`;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<Error | null>(null);

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
        client,
        oauth.None(),
        currentUser.refresh_token
      );

      const result = await oauth.processRefreshTokenResponse(
        authorizationServer,
        client,
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
      // Refresh failed, user needs to re-authenticate
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

      // Token is expired or about to expire
      if (timeUntilExpiry < TOKEN_REFRESH_BUFFER_MS) {
        const refreshedUser = await refreshAccessToken(savedUser);
        if (refreshedUser) {
          setUser(refreshedUser);
          setIsAuthenticated(true);
          chrome.storage.local.set({
            [CURRENT_USER_STORAGE_KEY]: {
              id: refreshedUser.sub,
              email: refreshedUser.email,
            },
          });
        } else {
          // Refresh failed, clear auth
          chrome.storage.local.remove([AUTH_STORAGE_KEY, CURRENT_USER_STORAGE_KEY]);
        }
      } else {
        // Token is still valid
        setUser(savedUser);
        setIsAuthenticated(true);
        chrome.storage.local.set({
          [CURRENT_USER_STORAGE_KEY]: {
            id: savedUser.sub,
            email: savedUser.email,
          },
        });
      }

      setIsLoading(false);
    };

    initAuth();
  }, [refreshAccessToken]);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!user?.refresh_token || !user.expires_at) {
      return;
    }

    const timeUntilRefresh = user.expires_at - Date.now() - TOKEN_REFRESH_BUFFER_MS;

    // If already past refresh time, refresh immediately
    if (timeUntilRefresh <= 0) {
      refreshAccessToken(user).then((refreshedUser) => {
        if (refreshedUser) {
          setUser(refreshedUser);
        } else {
          // Refresh failed, sign out
          setUser(null);
          setIsAuthenticated(false);
          chrome.storage.local.remove([AUTH_STORAGE_KEY, CURRENT_USER_STORAGE_KEY]);
        }
      });
      return;
    }

    // Schedule refresh before expiry
    const timerId = setTimeout(async () => {
      const refreshedUser = await refreshAccessToken(user);
      if (refreshedUser) {
        setUser(refreshedUser);
      } else {
        // Refresh failed, sign out
        setUser(null);
        setIsAuthenticated(false);
        chrome.storage.local.remove([AUTH_STORAGE_KEY, CURRENT_USER_STORAGE_KEY]);
      }
    }, timeUntilRefresh);

    return () => clearTimeout(timerId);
  }, [user, refreshAccessToken]);

  const signIn = useCallback(async () => {
    const redirectUri = chrome.identity.getRedirectURL();

    // Generate PKCE code verifier and challenge
    const codeVerifier = oauth.generateRandomCodeVerifier();
    const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);

    // Build authorization URL
    const authUrl = new URL(authorizationServer.authorization_endpoint as string);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'openid email');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('prompt', 'login');

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
          // Parse the callback URL
          const callbackParams = oauth.validateAuthResponse(
            authorizationServer,
            client,
            new URL(responseUrl),
            oauth.expectNoState
          );

          // Exchange code for tokens
          const response = await oauth.authorizationCodeGrantRequest(
            authorizationServer,
            client,
            oauth.None(),
            callbackParams,
            redirectUri,
            codeVerifier
          );

          const result = await oauth.processAuthorizationCodeResponse(
            authorizationServer,
            client,
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

          // Save auth user and current user for content script
          await chrome.storage.local.set({
            [AUTH_STORAGE_KEY]: newUser,
            [CURRENT_USER_STORAGE_KEY]: {
              id: newUser.sub,
              email: newUser.email,
            },
          });

          setUser(newUser);
          setIsAuthenticated(true);
          setIsLoading(false);
        } catch (err) {
          setIsLoading(false);
          setError(err instanceof Error ? err : new Error('Token exchange failed'));
        }
      }
    );
  }, []);

  const signOut = useCallback(() => {
    chrome.storage.local.remove([AUTH_STORAGE_KEY, CURRENT_USER_STORAGE_KEY]);

    setUser(null);
    setIsAuthenticated(false);

    const redirectUri = chrome.identity.getRedirectURL();
    const logoutUrl = buildLogoutUrl(redirectUri);

    chrome.identity.launchWebAuthFlow(
      { url: logoutUrl, interactive: false },
      () => {
        // Ignore errors on logout
      }
    );
  }, []);

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
