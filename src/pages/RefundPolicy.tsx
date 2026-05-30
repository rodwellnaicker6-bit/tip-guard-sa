import { LegalPageLayout } from "../components/LegalPageLayout";
import { BusinessContactBlock } from "../components/BusinessContactBlock";

export default function RefundPolicy() {
  return (
    <LegalPageLayout title="Refunds & disputes" updated="27 May 2026">
      <p>
        Tips are voluntary payments to car guards. Once Paystack confirms a successful charge, funds follow your
        operator&apos;s payout schedule to guards or venues. TipGuard software does not hold customer funds as a bank.
      </p>
      <h2 className="text-base font-bold text-white">Failed or duplicate charges</h2>
      <p>
        If checkout fails, no tip is recorded and your card is not debited. If you believe you were charged incorrectly,
        contact your card issuer and your venue operator within 30 days with the Paystack reference from your receipt or
        bank statement.
      </p>
      <h2 className="text-base font-bold text-white">Disputes between users</h2>
      <p>
        Service quality disputes are between the customer and the guard or merchant. Operators may offer goodwill credits
        at their discretion; this is not guaranteed by the software license.
      </p>
      <h2 className="text-base font-bold text-white">Chargebacks</h2>
      <p>
        Unauthorised transaction claims are handled under Paystack and card network rules. Guards and merchants must
        cooperate with evidence requests. Repeated chargebacks may lead to account suspension.
      </p>
      <BusinessContactBlock compact />
    </LegalPageLayout>
  );
}
