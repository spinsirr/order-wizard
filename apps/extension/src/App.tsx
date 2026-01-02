import { ErrorBoundary } from './components/ErrorBoundary';
import { UserBar } from './components/UserBar';
import { OrderTable } from './components/OrderTable';
import { ProtectedRoute } from './OAuthContext';
import { useEffect } from 'react';
import { initializeErrorHandlers } from './utils';

function AppContent() {
  useEffect(() => {
    initializeErrorHandlers();
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <UserBar />
      <ProtectedRoute>
        <OrderTable />
      </ProtectedRoute>
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
