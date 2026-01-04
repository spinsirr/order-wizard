import { useMemo } from 'react';
import { useAuth } from 'react-oidc-context';
import { buildCognitoLogoutUrl } from '@/config';
import { useAccessToken } from '@/hooks/useAccessToken';

interface UserBarProps {
  isSyncing?: boolean;
  onSync?: () => void;
  lastSyncedAt?: Date | null;
  isAuthenticated?: boolean;
}

export function UserBar({ isSyncing = false, onSync, lastSyncedAt }: UserBarProps) {
  const auth = useAuth();
  const profile = auth.user?.profile;
  useAccessToken();

  const displayEmail = profile?.email ?? '';
  const avatarUrl = profile?.picture;

  const avatarInitial = useMemo(() => {
    if (displayEmail) {
      return displayEmail.charAt(0).toUpperCase();
    }
    return 'U';
  }, [displayEmail]);

  const handleSignIn = () => {
    if (!auth.isLoading) {
      void auth.signinRedirect({ prompt: 'login' });
    }
  };

  const handleSignOut = async () => {
    if (auth.isLoading) {
      return;
    }
    const confirmed = window.confirm('Are you sure you want to sign out?');
    if (!confirmed) {
      return;
    }
    try {
      await auth.removeUser();
    } catch {
      // ignore remove user errors and continue logout
    }
    window.location.href = buildCognitoLogoutUrl();
  };

  if (auth.isLoading) {
    return (
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md">
        <div className="flex w-full items-center justify-between px-6 py-5">
          <span className="text-sm text-muted-foreground md:text-base">Loading...</span>
        </div>
      </header>
    );
  }

  if (auth.error) {
    return (
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md">
        <div className="flex w-full items-center justify-between px-6 py-5">
          <span className="text-sm text-destructive md:text-base">
            Encountering error... {auth.error.message}
          </span>
          <button
            type="button"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            onClick={handleSignIn}
          >
            Retry sign in
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md">
      <div className="flex w-full items-center px-6 py-5 min-h-[96px]">
        {auth.isAuthenticated && profile ? (
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayEmail || 'User avatar'}
                  className="h-12 w-12 rounded-2xl border border-border/60 shadow-sm"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-lg font-semibold text-primary shadow-inner">
                  {avatarInitial}
                </div>
              )}
              <div className="text-sm text-muted-foreground md:text-base">
                {displayEmail || 'No email provided'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onSync && (
                <button
                  type="button"
                  className="rounded-lg border border-border/60 px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
                  onClick={onSync}
                  disabled={isSyncing}
                  title={lastSyncedAt ? `Last synced: ${lastSyncedAt.toLocaleTimeString()}` : 'Sync now'}
                >
                  {isSyncing ? (
                    <span className="animate-spin inline-block h-4 w-4 border-2 border-foreground border-t-transparent rounded-full" />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 21h5v-5" />
                    </svg>
                  )}
                </button>
              )}
              <button
                type="button"
                className="rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                onClick={() => void handleSignOut()}
                disabled={auth.isLoading}
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            <span className="text-sm text-muted-foreground md:text-base">
              Sign in to sync your orders across devices.
            </span>
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
              onClick={handleSignIn}
              disabled={auth.isLoading}
            >
              Sign in
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
