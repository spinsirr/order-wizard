import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AuthProvider } from 'react-oidc-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fetchOAuthConfig, getCachedOAuthConfig, type OAuthConfig } from './oauth-discovery';
import { apiBaseUrl, buildAuthProviderProps } from './config';

// ============================================================================
// OAuth Context
// ============================================================================

interface OAuthContextValue {
  config: OAuthConfig | null;
  isConfigured: boolean;
  discoverAndLogin: () => Promise<void>;
}

const OAuthConfigContext = createContext<OAuthContextValue | null>(null);

export function useOAuthContext(): OAuthContextValue {
  const ctx = useContext(OAuthConfigContext);
  if (!ctx) {
    throw new Error('useOAuthContext must be used within OAuthProvider');
  }
  return ctx;
}

export function useOAuthConfig(): OAuthConfig {
  const { config } = useOAuthContext();
  if (!config) {
    throw new Error('OAuth config not yet discovered');
  }
  return config;
}

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
// OAuth Provider
// ============================================================================

interface OAuthProviderProps {
  children: ReactNode;
}

export function OAuthProvider({ children }: OAuthProviderProps) {
  // Try to use cached config on startup (from previous 401 discovery)
  const [config, setConfig] = useState<OAuthConfig | null>(() => getCachedOAuthConfig());
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Called when we receive a 401 or user clicks sign in.
   * Discovers the OAuth config from /.well-known/oauth-protected-resource
   * then triggers the login flow.
   */
  const discoverAndLogin = useCallback(async () => {
    if (!apiBaseUrl) {
      setError(new Error('VITE_API_BASE_URL is not configured'));
      return;
    }

    setDiscovering(true);
    setError(null);

    try {
      const discoveredConfig = await fetchOAuthConfig(apiBaseUrl);
      setConfig(discoveredConfig);
      // The AuthProvider will re-render with new config, then we can trigger login
    } catch (err) {
      console.error('[OAuth] Failed to discover config:', err);
      setError(err instanceof Error ? err : new Error('Failed to discover OAuth config'));
    } finally {
      setDiscovering(false);
    }
  }, []);

  const contextValue: OAuthContextValue = {
    config,
    isConfigured: config !== null,
    discoverAndLogin,
  };

  // If no config yet, render children without AuthProvider
  // The app can still render, but auth features won't work until discovery
  if (!config) {
    return (
      <OAuthConfigContext.Provider value={contextValue}>
        <QueryClientProvider client={queryClient}>
          {discovering ? (
            <div className="flex h-screen items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
                <p className="text-gray-600">Discovering authentication server...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-screen items-center justify-center">
              <div className="text-center">
                <p className="text-red-600 font-semibold">Authentication Error</p>
                <p className="text-sm text-gray-600 mt-2">{error.message}</p>
                <button
                  className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                  onClick={() => void discoverAndLogin()}
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            children
          )}
        </QueryClientProvider>
      </OAuthConfigContext.Provider>
    );
  }

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
