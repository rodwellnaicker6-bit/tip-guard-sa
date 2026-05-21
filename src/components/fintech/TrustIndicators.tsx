const ITEMS = [
  { icon: "🔒", label: "Secure payments", hint: "Paystack · TLS" },
  { icon: "✓", label: "Verified guards", hint: "Operator-reviewed" },
  { icon: "⚡", label: "Instant payouts", hint: "Fast settlement" },
  { icon: "🛡", label: "Encrypted checkout", hint: "PCI via gateway" },
] as const;

/** Trust row for landing / auth — four compact indicators. */
export function TrustIndicators({ compact }: { compact?: boolean }) {
  return (
    <ul className={`trust-grid ${compact ? "trust-grid--compact" : ""}`} aria-label="Trust and security">
      {ITEMS.map((item, i) => (
        <li
          key={item.label}
          className={`trust-pill fx-fade-up fx-stagger-${Math.min(i + 1, 3)}`}
          title={item.hint}
        >
          <span className="trust-pill-icon" aria-hidden>
            {item.icon}
          </span>
          <span className="trust-pill-label">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
