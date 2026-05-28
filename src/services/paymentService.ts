/** Multi-provider registry (Peach, Ozow, wallets); checkout today uses Paystack only. */
export { getDefaultCheckoutProvider, PAYMENT_PROVIDERS } from "../lib/paymentProviders";
export {
  hasPaystackPublicKey,
  initializePaystackTransaction,
  payTipWithPaystack,
  payWalletTopUpWithPaystack,
  type PaystackInitResponse,
  type PaystackInitResult,
} from "./paystackCore";
export { startTipCheckout, startWalletTopUpCheckout, listPaymentAdapters, getDefaultTipGateway } from "../payments";
