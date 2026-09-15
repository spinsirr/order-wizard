import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OrderTableEmpty } from '@/components/OrderEmptyStates';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AuthProvider } from '@/contexts/AuthContext';
import { SyncProvider } from '@/contexts/SyncContext';
import { resetDemoOrders } from '@/demo/browserMock';
import { Options } from '@/options/Options';
import App from '../sidepanel/App';

function PreviewNavigation({ settings = false }: { settings?: boolean }) {
  return (
    <nav
      className="flex flex-wrap justify-center gap-2 border-b bg-background p-3"
      aria-label="前端预览导航"
    >
      <Button asChild variant={settings ? 'ghost' : 'secondary'} size="sm">
        <a href="./index.html" aria-current={settings ? undefined : 'page'}>
          订单
        </a>
      </Button>
      <Button asChild variant={settings ? 'secondary' : 'ghost'} size="sm">
        <a href="?screen=settings" aria-current={settings ? 'page' : undefined}>
          Marketplace 设置
        </a>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <a href="http://127.0.0.1:6006/?path=/story/workflow-settings--custom-steps">
          流程设计（原型）
        </a>
      </Button>
    </nav>
  );
}

export function renderDemo(): void {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('screen') === 'settings'
  ) {
    createRoot(rootElement).render(
      <StrictMode>
        <PreviewNavigation settings />
        <Options />
      </StrictMode>,
    );
    return;
  }

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
            {import.meta.env.DEV && <PreviewNavigation />}
            <div
              className={
                import.meta.env.DEV ? 'demo-shell demo-shell-with-navigation' : 'demo-shell'
              }
            >
              <section className="demo-frame" aria-label="Interactive OrderCue side panel">
                <App
                  workspaceNotice={
                    <Alert className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-2">
                      <span
                        className="size-2 rounded-full bg-link motion-safe:animate-pulse"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <AlertTitle className="text-caption">Sample workspace</AlertTitle>
                        <AlertDescription className="truncate text-micro">
                          Changes stay in this browser
                        </AlertDescription>
                      </div>
                      <Badge
                        variant="secondary"
                        className="font-mono text-micro uppercase tracking-[0.1em]"
                      >
                        Live demo
                      </Badge>
                    </Alert>
                  }
                  emptyState={
                    <OrderTableEmpty>
                      <p className="mt-2 text-body leading-6 text-muted-foreground">
                        You cleared the sample workspace. Restore it to keep exploring the workflow.
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-4"
                        onClick={() => {
                          void resetDemoOrders().then(() => window.location.reload());
                        }}
                      >
                        Restore sample orders
                      </Button>
                    </OrderTableEmpty>
                  }
                />
              </section>
            </div>
          </SyncProvider>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
