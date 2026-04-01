import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[Parallax] React error boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-display font-semibold text-foreground/80 mb-3">
            Something went wrong
          </h1>
          <p className="text-xs text-muted-foreground/50 font-mono mb-6 max-w-sm">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <button
            onClick={() => {
              // Clear caches and reload
              if ("caches" in window) {
                caches.keys().then((keys) =>
                  Promise.all(keys.map((k) => caches.delete(k)))
                );
              }
              window.location.reload();
            }}
            className="px-5 py-2 rounded-[10px] bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
