import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Component } from 'react';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('🚨 Error Boundary caught error:', {
      error,
      errorInfo,
      timestamp: new Date().toISOString(),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex items-center justify-center min-h-screen bg-background">
            <div className="text-center space-y-4 p-8 max-w-md">
              <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden="true" />
              <h1 className="text-heading font-bold text-foreground">Something went wrong</h1>
              <p className="text-muted-foreground">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <Button type="button" onClick={() => window.location.reload()}>
                Reload Extension
              </Button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
