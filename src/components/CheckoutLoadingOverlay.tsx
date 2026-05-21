/** Full-screen overlay while Paystack session is initializing or opening. */
export function CheckoutLoadingOverlay({ message }: { message: string }) {
  return (
    <div
      className="checkout-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="checkout-overlay-card fx-scale-in">
        <div className="checkout-overlay-spinner" aria-hidden />
        <p className="checkout-overlay-title">Secure checkout</p>
        <p className="checkout-overlay-msg">{message}</p>
      </div>
    </div>
  );
}
