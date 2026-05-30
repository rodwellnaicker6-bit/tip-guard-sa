/** Human-readable Paystack / checkout failure reasons for `/payment/failure`. */
export function paymentFailureMessage(reason: string): string {
  const decoded = tryDecode(reason);
  const key = decoded.toLowerCase();

  if (key === "cancelled" || key === "canceled") {
    return "The checkout window was closed before completion.";
  }
  if (key === "verify_failed" || key === "verification_failed") {
    return "We could not confirm this payment with Paystack. If you were charged, contact support with your reference.";
  }
  if (key === "network" || key === "failed to fetch") {
    return "Network error while starting checkout. Check your connection and try again.";
  }
  if (key === "not_configured" || key === "paystack_missing") {
    return "Payments are not configured on this deployment.";
  }
  if (key === "invalid_amount") {
    return "The tip amount is invalid. Choose at least R1.";
  }
  if (key === "unauthorized" || key === "auth" || key === "invalid_session") {
    return "Please sign in again before paying.";
  }
  if (key.startsWith("http")) {
    return "Payment could not be completed. Please try again.";
  }
  return decoded;
}

function tryDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
