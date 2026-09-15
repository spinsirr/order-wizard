import { type ReactNode, useEffect } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OrderTable } from '@/components/OrderTable';
import { UserBar } from '@/components/UserBar';
import { useSync } from '@/contexts/SyncContext';
import { initializeErrorHandlers } from '@/lib';

interface AppProps {
  emptyState?: ReactNode;
  workspaceNotice?: ReactNode;
}

function AppContent({ emptyState, workspaceNotice }: AppProps) {
  const { isSyncing, error: syncError, lastSyncedAt, pendingCount, triggerSync } = useSync();

  useEffect(() => {
    initializeErrorHandlers();
  }, []);

  return (
    <main className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <UserBar
        workspaceNotice={workspaceNotice}
        isSyncing={isSyncing}
        syncError={syncError}
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        onSync={triggerSync}
      />
      <OrderTable emptyState={emptyState} />
    </main>
  );
}

function App(props: AppProps) {
  return (
    <ErrorBoundary>
      <AppContent {...props} />
    </ErrorBoundary>
  );
}

export default App;
