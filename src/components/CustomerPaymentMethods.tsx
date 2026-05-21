/** Paystack manages vaulted instruments on their side; we no longer list Stripe payment methods from Edge. */
export default function CustomerPaymentMethods() {
  return (
    <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
      Saved cards and bank authorisations are handled by Paystack when you pay again with the same email. Enable
      channels (card, bank, Apple Pay) in your Paystack Dashboard for South Africa; availability still depends on
      customer bank and device.
    </p>
  );
}
