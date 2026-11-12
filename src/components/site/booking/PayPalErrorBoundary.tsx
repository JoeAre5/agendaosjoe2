// Error boundary for the PayPal SDK button. The @paypal/react-paypal-js
// PayPalButtons component can throw synchronously during render if the
// hosted SDK script (paypal.com/sdk/js?...) failed to load, the script's
// global `window.paypal` is missing, or the inner React tree errors.
// Without this boundary, those throws bubble up to the BookingModal's
// outermost boundary, blowing away the entire booking state and bouncing
// the user back to Step 1 (Select Barber).
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  isEs: boolean;
  onReset: () => void;
}

interface State {
  hasError: boolean;
  message: string | null;
}

export class PayPalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err?.message || "paypal_render_error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[PayPalErrorBoundary] caught:", error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: null });
    this.props.onReset();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const { isEs } = this.props;
    return (
      <div
        className="rounded-xl p-4 text-[12px] flex flex-col items-start gap-3"
        style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-1" />
          <span>
            {isEs
              ? "PayPal no se pudo cargar. Intenta otro método de pago."
              : "PayPal failed to load. Please try another payment method."}
          </span>
        </div>
        <button
          onClick={this.handleReset}
          className="text-[12px] font-semibold underline"
          style={{ color: "#ef4444" }}
        >
          {isEs ? "Volver" : "Go back"}
        </button>
      </div>
    );
  }
}
