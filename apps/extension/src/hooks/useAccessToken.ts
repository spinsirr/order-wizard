import { useAuth } from '@/contexts/AuthContext';

interface AccessToken {
  accessToken: string | null;
  tokenType: 'Bearer';
  expiresAt: number | null;
}

export function useAccessToken(): AccessToken {
  const { user } = useAuth();

  return {
    accessToken: user?.access_token ?? null,
    tokenType: 'Bearer',
    expiresAt: user?.expires_at ?? null,
  };
}
