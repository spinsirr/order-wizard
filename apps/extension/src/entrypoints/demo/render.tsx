import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/contexts/AuthContext';
import { SyncProvider } from '@/contexts/SyncContext';
import App from '../sidepanel/App';

export function renderDemo(): void {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element not found');

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 0,
        refetchOnWindowFocus: false,
      },
    },
  });

  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SyncProvider>
            <div className="demo-shell">
              <section className="demo-frame" aria-label="Interactive OrderCue side panel">
                <App />
              </section>
            </div>
          </SyncProvider>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
