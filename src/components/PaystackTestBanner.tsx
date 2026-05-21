import { isPaystackTestMode } from "../lib/paystackMode";

export default function PaystackTestBanner() {
  if (!isPaystackTestMode()) return null;
  return (
    <div className="test-mode-banner" role="status">
      Paystack test mode — charges are simulated; use test cards from your Paystack dashboard.
    </div>
  );
}
