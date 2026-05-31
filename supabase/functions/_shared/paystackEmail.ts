/** Paystack rejects some TLDs (e.g. `.staging`, `.local`) even when auth email is set. */
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BLOCKED_EMAIL_SUFFIXES = [".local", ".staging", ".invalid", ".test"];

/** Deliverable checkout domain for mapped staging / synthetic payer emails. */
const CHECKOUT_EMAIL_DOMAIN = "checkout.tipguardsa.co.za";

export type PaystackEmailResolution = {
  email: string;
  source: "auth" | "mapped_staging" | "synthetic";
  authEmailPresent: boolean;
};

function sanitizeLocalPart(local: string): string {
  const cleaned = local.replace(/[^a-zA-Z0-9._+-]/g, "").slice(0, 64);
  return cleaned || "payer";
}

function domainBlocked(domain: string): boolean {
  const lower = domain.toLowerCase();
  return BLOCKED_EMAIL_SUFFIXES.some((s) => lower.endsWith(s));
}

function isPaystackAcceptableEmail(email: string): boolean {
  if (!BASIC_EMAIL_RE.test(email)) return false;
  const domain = email.split("@")[1] ?? "";
  return !domainBlocked(domain);
}

/**
 * Email sent to Paystack transaction/initialize.
 * Auth email is used when Paystack accepts it; staging demo domains are remapped.
 */
export function resolvePaystackCheckoutEmail(
  authEmail: string | undefined | null,
  userId: string,
): PaystackEmailResolution {
  const trimmed = authEmail?.trim() ?? "";
  const authEmailPresent = trimmed.length > 0;

  if (trimmed && isPaystackAcceptableEmail(trimmed)) {
    return { email: trimmed, source: "auth", authEmailPresent };
  }

  if (trimmed.includes("@")) {
    const [local, domain] = trimmed.split("@");
    if (domain?.toLowerCase() === "tipguard.staging") {
      const mapped = `${sanitizeLocalPart(local)}@${CHECKOUT_EMAIL_DOMAIN}`;
      if (isPaystackAcceptableEmail(mapped)) {
        return { email: mapped, source: "mapped_staging", authEmailPresent };
      }
    }
  }

  const tag = userId.replace(/-/g, "").slice(0, 12);
  const hintLocal = trimmed.includes("@") ? trimmed.split("@")[0] : "payer";
  const synthetic = `${sanitizeLocalPart(hintLocal)}+${tag}@${CHECKOUT_EMAIL_DOMAIN}`;
  return { email: synthetic, source: "synthetic", authEmailPresent };
}
