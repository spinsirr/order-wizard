function handleError(event: ErrorEvent | PromiseRejectionEvent): void {
  const error = event instanceof ErrorEvent
    ? event.error
    : event.reason instanceof Error ? event.reason : new Error(String(event.reason));

  console.error('🚨 Unhandled error:', error.message, error.stack);
}

export function initializeErrorHandlers(): void {
  if (typeof window !== 'undefined') {
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);
  } else if (typeof self !== 'undefined') {
    self.addEventListener('error', handleError as EventListener);
    self.addEventListener('unhandledrejection', handleError as EventListener);
  }
}
