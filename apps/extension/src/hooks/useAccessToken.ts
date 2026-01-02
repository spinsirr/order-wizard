import { useEffect, useMemo } from 'react';
import { useAuth } from 'react-oidc-context';
import { orderRepository } from '@/config/storage';
import { ApiRepository } from '@/repositories/ApiRepository';

function setRepositoryToken(token: string | null, tokenType: string | null): void {
  if (orderRepository instanceof ApiRepository) {
    orderRepository.setAccessToken(token, tokenType ?? 'Bearer');
  }
}

export function useAccessToken() {
  const auth = useAuth();

  const token = auth.user?.access_token ?? null;
  const tokenType = auth.user?.token_type ?? 'Bearer';
  const expiresAt = auth.user?.expires_at ? auth.user.expires_at * 1000 : null;

  useEffect(() => {
    if (auth.isLoading) {
      return;
    }

    setRepositoryToken(auth.isAuthenticated ? token : null, tokenType);
  }, [auth.isAuthenticated, auth.isLoading, token, tokenType]);

  const refresh = useMemo(() => {
    if (typeof auth.signinSilent !== 'function') {
      return undefined;
    }

    return async () => {
      try {
        await auth.signinSilent();
      } catch (error) {
        console.error('[auth] Silent token refresh failed:', error);
      }
    };
  }, [auth]);

  return {
    accessToken: token,
    tokenType,
    expiresAt,
    isLoading: auth.isLoading,
    refreshAccessToken: refresh,
  };
}
