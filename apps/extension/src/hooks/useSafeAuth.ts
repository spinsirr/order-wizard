import { useAuth, type AuthContextProps } from 'react-oidc-context';
import { useOAuthContext } from '@/OAuthContext';

/**
 * A safe version of useAuth that returns null when AuthProvider isn't available.
 * Use this in components that may render before OAuth config is discovered.
 */
export function useSafeAuth(): AuthContextProps | null {
  const { isConfigured } = useOAuthContext();

  // We can't conditionally call hooks, so we always call useAuth
  // but it will throw if AuthProvider isn't in the tree.
  // Instead, we check isConfigured first and return null if not configured.
  if (!isConfigured) {
    return null;
  }

  // This is safe because AuthProvider is only rendered when isConfigured is true
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useAuth();
}
