import { Component, type ErrorInfo, type ReactNode } from "react";
import { clientTag } from "@/lib/crash-report";
import { DestiraMark } from "@/components/brand/logo";

interface Props {
  children: ReactNode;
  // Passing the current route clears a caught error the moment the user
  // navigates away, so a crash on one screen doesn't keep blanking every
  // screen after it.
  resetKey?: string;
}

interface State {
  error: Error | null;
  errorId: string | null;
  report: "idle" | "sending" | "sent" | "failed";
}

// Short enough to read out over the phone, unique enough to find in the logs.
function newErrorId() {
  return `E-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

// Brief 7.19: a calm screen, "Something broke on our side", retry, and a
// "Send report" that carries the error id.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorId: null, report: "idle" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, errorId: newErrorId(), report: "idle" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        message: error.message,
        // The id rides at the top of the stack so it lands in the server log
        // next to the crash without splitting the crash counts by id.
        stack: `${this.state.errorId ?? ""}\n${error.stack ?? ""}`,
        componentStack: info.componentStack,
        url: window.location.href,
        ...clientTag(),
      }),
    }).catch(() => {});
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, errorId: null, report: "idle" });
    }
  }

  sendReport = async () => {
    const { error, errorId } = this.state;
    this.setState({ report: "sending" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category: "bug",
          freeText: `Crash ${errorId} on ${window.location.pathname}: ${error?.message ?? "unknown"}`,
          appVersion: clientTag().version,
          platform: clientTag().client,
        }),
      });
      this.setState({ report: res.ok ? "sent" : "failed" });
    } catch {
      this.setState({ report: "failed" });
    }
  };

  render() {
    const { error, errorId, report } = this.state;
    if (!error) return this.props.children;
    const mailto = `mailto:support@destira.date?subject=${encodeURIComponent(`Crash ${errorId}`)}`;
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-vf-ink text-vf-text px-6 text-center" role="alert">
        <DestiraMark size={64} decorative className="opacity-80" />
        <h1 className="vf-h2 font-display mt-6">Something broke on our side</h1>
        <p className="vf-body text-vf-muted mt-2 max-w-[34ch]">
          Not something you did. Trying again usually fixes it.
        </p>
        <div className="mt-7 flex flex-col sm:flex-row gap-3 w-full max-w-[320px] sm:max-w-none sm:w-auto">
          <button
            onClick={() => this.setState({ error: null, errorId: null, report: "idle" })}
            className="h-12 px-6 rounded-full bg-vf-ember text-vf-ink font-semibold vf-press"
            data-testid="button-error-retry"
          >
            Try again
          </button>
          {report === "failed" ? (
            <a href={mailto} className="h-12 px-6 rounded-full border border-vf-line inline-flex items-center justify-center" data-testid="link-error-email">
              Email us instead
            </a>
          ) : (
            <button
              onClick={this.sendReport}
              disabled={report !== "idle"}
              className="h-12 px-6 rounded-full border border-vf-line text-vf-text disabled:opacity-60"
              data-testid="button-error-report"
            >
              {report === "sending" ? "Sending…" : report === "sent" ? "Report sent. Thank you." : "Send report"}
            </button>
          )}
        </div>
        <button
          onClick={() => { window.location.href = "/"; }}
          className="mt-4 min-h-[44px] text-[14px] text-vf-muted underline underline-offset-4"
          data-testid="button-error-home"
        >
          Go home
        </button>
        <p className="mt-6 font-mono text-[11px] tracking-[0.12em] text-vf-faint" data-testid="text-error-id">
          Error {errorId}
        </p>
      </div>
    );
  }
}
