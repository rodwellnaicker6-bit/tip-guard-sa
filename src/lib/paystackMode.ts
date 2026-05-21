/** True when using Paystack test keys or explicit VITE_PAYSTACK_TEST_MODE. */
export function isPaystackTestMode(): boolean {
  const flag = import.meta.env.VITE_PAYSTACK_TEST_MODE?.trim().toLowerCase();
  if (flag === "true" || flag === "1" || flag === "yes") return true;
  if (flag === "false" || flag === "0") return false;
  const pk = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim() ?? "";
  return pk.startsWith("pk_test_");
}
