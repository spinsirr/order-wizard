import { ErrorBoundary } from '@/components/ErrorBoundary';
import { UserBar } from '@/components/UserBar';
import { OrderTable } from '@/components/OrderTable';
import { useSync } from '@/contexts/SyncContext';
import { useEffect } from 'react';
import { initializeErrorHandlers } from '@/lib';

function AppContent() {
  const { isSyncing, error: syncError, lastSyncedAt, pendingCount, triggerSync } = useSync();

  useEffect(() => {
    initializeErrorHandlers();
  }, []);

  return (
    <main className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <UserBar
        isSyncing={isSyncing}
        syncError={syncError}
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        onSync={triggerSync}
      />
      <OrderTable />
    </main>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;
