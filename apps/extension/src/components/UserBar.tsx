import { AlertCircle, Cloud, CloudOff, LoaderCircle, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';

interface UserBarProps {
  workspaceNotice?: ReactNode;
  isSyncing?: boolean;
  syncError?: Error | null | undefined;
  lastSyncedAt?: Date | null | undefined;
  pendingCount?: number;
  onSync?: () => void;
}

function getSyncLabel({
  isSyncing,
  syncError,
  lastSyncedAt,
  pendingCount = 0,
}: UserBarProps): string {
  return isSyncing
    ? 'Syncing now'
    : syncError
      ? 'Sync failed'
      : pendingCount > 0
        ? `${pendingCount} waiting to sync`
        : lastSyncedAt
          ? `Synced ${lastSyncedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
          : 'Ready to sync';
}

export function UserBar({
  isSyncing = false,
  syncError,
  lastSyncedAt,
  pendingCount = 0,
  onSync,
  workspaceNotice,
}: UserBarProps) {
  const { isLoading, isAuthenticated, user, error, signIn, signOut } = useAuth();
  const [isSignOutOpen, setIsSignOutOpen] = useState(false);

  const showSignIn = !isLoading && !isAuthenticated;
  const syncLabel = getSyncLabel({ isSyncing, syncError, lastSyncedAt, pendingCount });

  return (
    <header className="sidepanel-header-enter relative z-20 shrink-0 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur-xl">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/icon.svg" alt="" className="h-8 w-8 shrink-0 rounded-[6px]" />
          <div className="min-w-0">
            <h1 className="truncate text-title font-semibold leading-none tracking-[-0.32px] text-foreground">
              OrderCue
            </h1>
            <p className="mt-1 text-micro font-medium text-muted-foreground">
              Amazon order tracker
            </p>
          </div>
        </div>

        {isLoading ? (
          <LoaderCircle
            className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none"
            aria-label="Loading"
          />
        ) : isAuthenticated ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="relative text-muted-foreground"
              onClick={onSync}
              disabled={isSyncing}
              aria-label={syncLabel}
              title={syncLabel}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 motion-reduce:animate-none ${isSyncing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {pendingCount > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-link px-1 text-center font-mono text-micro font-medium leading-4 text-white">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              ) : null}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setIsSignOutOpen(true)}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>

      {isAuthenticated ? (
        <div className="mt-2 flex min-w-0 items-center justify-between gap-3 pl-[42px] text-caption text-muted-foreground">
          <span className="min-w-0 truncate">{user?.email || 'Signed in'}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {syncError ? (
              <CloudOff className="h-3 w-3 text-destructive" aria-hidden="true" />
            ) : (
              <Cloud className="h-3 w-3 text-link" aria-hidden="true" />
            )}
            {syncLabel}
          </span>
        </div>
      ) : null}

      {workspaceNotice ?? <WorkspaceNotice showSignIn={showSignIn} onSignIn={signIn} />}

      {error ? (
        <Alert variant="destructive" className="mt-2 px-3 py-2 text-caption">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      <AlertDialog open={isSignOutOpen} onOpenChange={setIsSignOutOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              Orders saved on this browser will remain available. Cloud sync will pause until you
              sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={signOut}>
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}

function WorkspaceNotice({
  showSignIn,
  onSignIn,
}: {
  showSignIn: boolean;
  onSignIn: () => Promise<void>;
}) {
  return showSignIn ? (
    <Alert className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-2">
      <span className="text-muted-foreground">
        <CloudOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <AlertTitle className="text-caption">Saved on this browser</AlertTitle>
        <AlertDescription className="truncate text-micro">
          Sign in for backup and sync
        </AlertDescription>
      </div>
      <Button type="button" size="sm" onClick={onSignIn}>
        <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
        Sign in
      </Button>
    </Alert>
  ) : null;
}
