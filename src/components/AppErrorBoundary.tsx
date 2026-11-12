import { Component, type ErrorInfo, type ReactNode } from "react";
import { recoverFromAppLoadError } from "@/lib/appRecovery";
import { SplashScreen } from "@/components/SplashScreen";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * AppErrorBoundary
 * On any uncaught render error we show the same looping splash users see on
 * boot and silently reload. Clients should never see a generic "we are
 * updating the app" screen — the wordmark animation keeps playing until the
 * fresh bundle loads.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  private reloadTimer: number | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary] caught:", error, info.componentStack);
    // Try the recoverable-error path first (clears caches + reloads). If that
    // doesn't engage, schedule a plain reload so the user is never stuck.
    const handled = recoverFromAppLoadError(error, "error-boundary");
    if (!handled && typeof window !== "undefined") {
      this.reloadTimer = window.setTimeout(() => {
        try {
          window.location.reload();
        } catch {
          /* noop */
        }
      }, 1800);
    }
  }

  componentWillUnmount() {
    if (this.reloadTimer !== null) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <SplashScreen />;
  }
}
