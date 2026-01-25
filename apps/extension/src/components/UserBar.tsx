import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface UserBarProps {
  isSyncing?: boolean;
  lastSyncedAt?: Date | null;
  pendingCount?: number;
  onSync?: () => void;
}

export function UserBar({ isSyncing = false, lastSyncedAt, pendingCount = 0, onSync }: UserBarProps) {
  const { isLoading, isAuthenticated, user, signIn, signOut } = useAuth();

  const displayEmail = user?.email ?? '';

  const avatarInitial = useMemo(() => {
    if (displayEmail) {
      return displayEmail.charAt(0).toUpperCase();
    }
    return 'U';
  }, [displayEmail]);

  const handleSignIn = () => {
    if (!isLoading) {
      signIn();
    }
  };

  const handleSignOut = () => {
    if (isLoading) {
      return;
    }
    const confirmed = window.confirm('Are you sure you want to sign out?');
    if (!confirmed) {
      return;
    }
    signOut();
  };

  if (isLoading) {
    return (
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md">
        <div className="flex w-full items-center justify-between px-6 py-5">
          <span className="text-sm text-muted-foreground md:text-base">Loading...</span>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md">
      <div className="flex w-full items-center px-6 py-5 min-h-[96px]">
        {isAuthenticated && user ? (
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-lg font-semibold text-primary shadow-inner">
                {avatarInitial}
              </div>
              <div className="text-sm text-muted-foreground md:text-base">
                {displayEmail || 'No email provided'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isSyncing ? (
                <div
                  className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground"
                  title={lastSyncedAt ? `Last synced: ${lastSyncedAt.toLocaleTimeString()}` : 'Syncing...'}
                >
                  <span className="animate-spin inline-block h-4 w-4 border-2 border-foreground border-t-transparent rounded-full" />
                  <span>Syncing...</span>
                </div>
              ) : pendingCount > 0 ? (
                <div
                  className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground"
                >
                  <span className="animate-spin inline-block h-4 w-4 border-2 border-foreground border-t-transparent rounded-full" />
                  <span>{pendingCount} pending</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
                  onClick={onSync}
                  disabled={isSyncing}
                  title={lastSyncedAt ? `Last synced: ${lastSyncedAt.toLocaleTimeString()}` : 'Sync now'}
                >
                  Sync
                </button>
              )}
              <button
                type="button"
                className="rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                onClick={handleSignOut}
                disabled={isLoading}
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
              disabled={isLoading}
            >
              Sign in
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
