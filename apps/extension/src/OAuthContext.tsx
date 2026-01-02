import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fetchOAuthConfig,
  getCachedOAuthConfig,
  clearOAuthConfigCache,
  type OAuthConfig,
} from './oauth-discovery';
import { apiBaseUrl, buildAuthProviderProps } from './config';

// ============================================================================
// Query Client
// ============================================================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});

// ============================================================================
// OAuth Context - only for RFC 9728 discovery
// ============================================================================

interface OAuthContextValue {
  config: OAuthConfig | null;
  isConfigured: boolean;
  discover: () => Promise<OAuthConfig>;
}

const OAuthConfigContext = createContext<OAuthContextValue | null>(null);

export function useOAuthContext(): OAuthContextValue {
  const ctx = useContext(OAuthConfigContext);
  if (!ctx) {
    throw new Error('useOAuthContext must be used within OAuthProvider');
  }
  return ctx;
}

// ============================================================================
// OAuth Provider
// ============================================================================

interface OAuthProviderProps {
  children: ReactNode;
}

export function OAuthProvider({ children }: OAuthProviderProps) {
  const [config, setConfig] = useState<OAuthConfig | null>(() => getCachedOAuthConfig());
  const [error, setError] = useState<Error | null>(null);

  // Handle OAuth error responses in URL (e.g., invalid_scope)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    const errorDescription = params.get('error_description');

    if (oauthError) {
      clearOAuthConfigCache();
      setConfig(null);
      const message = errorDescription
        ? `${oauthError}: ${errorDescription}`
        : `OAuth error: ${oauthError}`;
      setError(new Error(message));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Discover OAuth config from server (RFC 9728)
  const discover = useCallback(async (): Promise<OAuthConfig> => {
    if (config) return config;

    if (!apiBaseUrl) {
      throw new Error('VITE_API_BASE_URL is not configured');
    }

    const discoveredConfig = await fetchOAuthConfig(apiBaseUrl);
    setConfig(discoveredConfig);
    setError(null);
    return discoveredConfig;
  }, [config]);

  const contextValue: OAuthContextValue = {
    config,
    isConfigured: config !== null,
    discover,
  };

  // Show error state
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <p className="text-destructive font-semibold text-lg">Authentication Error</p>
          <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
          <button
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // If no config yet, render without AuthProvider
  if (!config) {
    return (
      <OAuthConfigContext.Provider value={contextValue}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </OAuthConfigContext.Provider>
    );
  }

  // With config, wrap in AuthProvider
  const authProviderProps = buildAuthProviderProps(config);

  return (
    <OAuthConfigContext.Provider value={contextValue}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider
          {...authProviderProps}
          onSigninCallback={() => {
            window.history.replaceState({}, document.title, window.location.pathname);
          }}
        >
          {children}
        </AuthProvider>
      </QueryClientProvider>
    </OAuthConfigContext.Provider>
  );
}

// ============================================================================
// Protected Route Component
// ============================================================================

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Wraps content that requires authentication.
 * Automatically triggers OAuth discovery and login if needed.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { config, discover } = useOAuthContext();
  const [isDiscovering, setIsDiscovering] = useState(false);

  // If no config, we need to discover first
  if (!config) {
    return (
      <DiscoverAndLogin
        discover={discover}
        isDiscovering={isDiscovering}
        setIsDiscovering={setIsDiscovering}
      />
    );
  }

  // Config exists, AuthProvider is available - use AuthGuard
  return <AuthGuard>{children}</AuthGuard>;
}

interface DiscoverAndLoginProps {
  discover: () => Promise<OAuthConfig>;
  isDiscovering: boolean;
  setIsDiscovering: (v: boolean) => void;
}

function DiscoverAndLogin({ discover, isDiscovering, setIsDiscovering }: DiscoverAndLoginProps) {
  const handleSignIn = async () => {
    setIsDiscovering(true);
    try {
      await discover();
      // Config will be set, component will re-render with AuthGuard
    } catch (err) {
      console.error('[OAuth] Discovery failed:', err);
      setIsDiscovering(false);
    }
  };

  if (isDiscovering) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Connecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-2 text-lg font-semibold">Sign in to view your orders</div>
      <p className="max-w-sm text-sm text-muted-foreground mb-4">
        Connect your account to sync and manage your Amazon orders across devices.
      </p>
      <button
        onClick={() => void handleSignIn()}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
      >
        Sign In
      </button>
    </div>
  );
}

/**
 * Guards content behind authentication.
 * Must be rendered inside AuthProvider.
 */
function AuthGuard({ children }: { children: ReactNode }) {
  const auth = useAuth();

  // Trigger login automatically if not authenticated
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && !auth.activeNavigator) {
      void auth.signinRedirect();
    }
  }, [auth]);

  if (auth.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
