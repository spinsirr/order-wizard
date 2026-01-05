import { ErrorBoundary } from './components/ErrorBoundary';
import { UserBar } from './components/UserBar';
import { OrderTable } from './components/OrderTable';
import { useOrderSync } from './hooks/useOrderSync';
import { useEffect } from 'react';
import { initializeErrorHandlers } from './utils';

function AppContent() {
  // Sync local orders to cloud when user logs in
  const { isSyncing, syncToCloud, lastSyncedAt } = useOrderSync();

  useEffect(() => {
    initializeErrorHandlers();
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <UserBar
        isSyncing={isSyncing}
        onSync={syncToCloud}
        lastSyncedAt={lastSyncedAt}
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
