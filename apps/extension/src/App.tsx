import { ErrorBoundary } from './components/ErrorBoundary';
import { UserBar } from './components/UserBar';
import { OrderTable } from './components/OrderTable';
import { FBQueuePanel } from './components/FBQueuePanel';
import { useSync } from '@/contexts/SyncContext';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { initializeErrorHandlers } from '@/lib';
import { ORDERS_KEY } from '@/constants';
import { cn } from '@/lib/cn';

type Tab = 'orders' | 'fb-queue';

function AppContent() {
  const queryClient = useQueryClient();
  const { isSyncing, lastSyncedAt, pendingCount, triggerSync } = useSync();
  const [activeTab, setActiveTab] = useState<Tab>('orders');

  useEffect(() => {
    initializeErrorHandlers();
  }, []);

  // Listen for orders saved from content script to refresh UI
  useEffect(() => {
    const handleMessage = (
      message: { type?: string },
      sender: chrome.runtime.MessageSender
    ) => {
      // Only accept messages from our own extension
      if (sender.id !== chrome.runtime.id) return;

      if (message.type === 'ORDER_SAVED') {
        queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      }

      // Switch to FB Queue tab when queue is updated
      if (message.type === 'FB_QUEUE_UPDATED') {
        setActiveTab('fb-queue');
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [queryClient]);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <UserBar
        isSyncing={isSyncing}
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        onSync={triggerSync}
      />

      {/* Tabs */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'orders'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Orders
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('fb-queue')}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'fb-queue'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          FB Queue
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'orders' ? <OrderTable /> : <FBQueuePanel />}
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
