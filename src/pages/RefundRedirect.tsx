import { Navigate } from "react-router-dom";

/** Alias for Paystack reviewers expecting /refund */
export default function RefundRedirect() {
  return <Navigate to="/legal/refunds" replace />;
}
