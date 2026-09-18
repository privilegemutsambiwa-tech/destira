import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  // Passing the current route clears a caught error the moment the user
  // navigates away, so a crash on one screen doesn't keep blanking every
  // screen after it.
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        url: window.location.href,
      }),
    }).catch(() => {});
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-6 text-center gap-4">
          <AlertTriangle className="w-10 h-10 text-vf-ember" />
          <div>
            <h2 className="font-serif text-xl text-vf-text mb-1">This screen didn't load</h2>
            <p className="text-sm text-vf-muted max-w-sm">
              Something went wrong on our end. You can try again, or head back home.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => this.setState({ error: null })} data-testid="button-error-retry">
              Try again
            </Button>
            <Button onClick={() => { window.location.href = "/"; }} data-testid="button-error-home">
              Go home
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
