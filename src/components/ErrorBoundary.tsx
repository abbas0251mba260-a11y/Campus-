import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected application error occurred.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('CampusFin ErrorBoundary:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      let parsedError: string = this.state.message;
      try {
        const obj = JSON.parse(this.state.message) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (obj && obj.error) {
          parsedError = `${obj.error}${obj.path ? ` (${obj.operationType ?? 'op'} at ${obj.path})` : ''}`;
        }
      } catch {
        // Non-JSON error message
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Something went wrong
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 break-words">
              {parsedError}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              Reload CampusFin
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
