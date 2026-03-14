import { ErrorBoundary } from '@/components/ErrorBoundary';
import { UserBar } from '@/components/UserBar';
import { OrderTable } from '@/components/OrderTable';
import { useSync } from '@/contexts/SyncContext';
import { useEffect } from 'react';
import { initializeErrorHandlers } from '@/lib';

function AppContent() {
  const { isSyncing, lastSyncedAt, pendingCount, triggerSync } = useSync();

  useEffect(() => {
    initializeErrorHandlers();
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <UserBar
        isSyncing={isSyncing}
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        onSync={triggerSync}
      />
      <OrderTable />
    </div>
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
