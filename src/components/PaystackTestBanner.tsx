import { isPaystackTestMode } from "../lib/paystackMode";

/**
 * Paystack test-mode notice — development only.
 * Vite eliminates the JSX below when `import.meta.env.PROD` is true.
 */
export default function PaystackTestBanner() {
  if (import.meta.env.PROD) return null;
  if (!isPaystackTestMode()) return null;
  return (
    <div className="test-mode-banner" role="status">
      Paystack test mode — charges are simulated; use test cards from your Paystack dashboard.
    </div>
  );
}
