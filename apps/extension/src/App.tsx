import { ErrorBoundary } from './components/ErrorBoundary';
import { UserBar } from './components/UserBar';
import { OrderTable } from './components/OrderTable';
import { useEffect } from 'react';
import { initializeErrorHandlers } from './utils/errorHandler';

function AppContent() {
  useEffect(() => {
    initializeErrorHandlers();
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <UserBar />
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
