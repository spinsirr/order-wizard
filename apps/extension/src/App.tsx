import { ErrorBoundary } from './components/ErrorBoundary';
import { UserBar } from './components/UserBar';
import { OrderTable } from './components/OrderTable';
import { useSync } from '@/contexts/SyncContext';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { initializeErrorHandlers } from '@/lib';
import { ORDERS_KEY } from '@/constants';

function AppContent() {
  const queryClient = useQueryClient();
  const { isSyncing, sync, lastSyncedAt } = useSync();

  useEffect(() => {
    initializeErrorHandlers();
  }, []);

  // Listen for orders saved from content script to refresh UI
  useEffect(() => {
    const handleMessage = (message: { type?: string }) => {
      if (message.type === 'ORDER_SAVED') {
        queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [queryClient]);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <UserBar
        isSyncing={isSyncing}
        onSync={sync}
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
