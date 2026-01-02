/**
 * OAuth 2.0 Protected Resource Metadata Discovery (RFC 9728)
 *
 * Per RFC 9728, the client discovers the authorization server when it
 * receives a 401 response from the protected resource.
 */

export interface ProtectedResourceMetadata {
  /** The protected resource's resource identifier */
  resource: string;
  /** Authorization servers that can authorize access to this resource */
  authorization_servers: string[];
  /** OAuth 2.0 client ID to use with the authorization server */
  client_id: string;
  /** Bearer token types supported */
  bearer_methods_supported: string[];
  /** Scopes supported by this protected resource */
  scopes_supported: string[];
}

export interface OAuthConfig {
  /** OIDC authority (authorization server issuer) */
  authority: string;
  /** OAuth 2.0 client ID */
  clientId: string;
  /** Scopes to request */
  scopes: string[];
}

const CACHE_KEY = 'oauth_config';
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

interface CachedConfig {
  config: OAuthConfig;
  timestamp: number;
}

/**
 * Gets cached OAuth config from sessionStorage.
 * Using sessionStorage instead of localStorage for OAuth 2.1 compliance
 * (reduces XSS attack surface - cleared when browser closes).
 */
export function getCachedOAuthConfig(): OAuthConfig | null {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const { config, timestamp } = JSON.parse(cached) as CachedConfig;
    if (Date.now() - timestamp > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }

    return config;
  } catch {
    return null;
  }
}

function setCachedConfig(config: OAuthConfig): void {
  try {
    const cached: CachedConfig = { config, timestamp: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Fetches the OAuth configuration from the resource server.
 * Called when receiving a 401 response per RFC 9728.
 */
export async function fetchOAuthConfig(apiBaseUrl: string): Promise<OAuthConfig> {
  const metadataUrl = `${apiBaseUrl}/.well-known/oauth-protected-resource`;

  const response = await fetch(metadataUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch OAuth metadata: ${response.status} ${response.statusText}`);
  }

  const metadata: ProtectedResourceMetadata = await response.json();

  if (!metadata.authorization_servers?.length) {
    throw new Error('No authorization servers found in protected resource metadata');
  }

  if (!metadata.client_id) {
    throw new Error('No client_id found in protected resource metadata');
  }

  const config: OAuthConfig = {
    authority: metadata.authorization_servers[0],
    clientId: metadata.client_id,
    scopes: metadata.scopes_supported ?? ['openid', 'email'],
  };

  // Cache the config
  setCachedConfig(config);

  return config;
}

/**
 * Clears the cached OAuth configuration.
 * Call this when the user logs out or when you need to refresh the config.
 */
export function clearOAuthConfigCache(): void {
  sessionStorage.removeItem(CACHE_KEY);
}
