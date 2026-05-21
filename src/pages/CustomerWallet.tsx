import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { centsFromRandInput, zarFromCents } from "../lib/money";
import CustomerPaymentMethods from "../components/CustomerPaymentMethods";
import { hasPaystackPublicKey, payWalletTopUpWithPaystack } from "../services/paymentService";
import { useToast } from "../context/useToast";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/EmptyState";

const REFRESH_MS = 45_000;

export default function CustomerWallet() {
  const navigate = useNavigate();
  const toast = useToast();
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [amount, setAmount] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cents = centsFromRandInput(amount);
  const amountLabel = cents != null ? zarFromCents(cents) : "R 0.00";

  const refreshBalance = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return;
    const { data, error: wErr } = await supabase.from("customer_wallets").select("balance_cents").eq("user_id", user.id).maybeSingle();
    if (wErr) {
      setLoadErr(wErr.message);
      return;
    }
    setBalanceCents(data?.balance_cents ?? 0);
    setLoadErr(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("tipguard_refresh_wallet")) {
          sessionStorage.removeItem("tipguard_refresh_wallet");
          await refreshBalance();
          toast.success("Wallet refreshed after your top-up.");
        } else {
          await refreshBalance();
        }
      } finally {
        if (!cancelled) setInitialLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshBalance, toast]);

  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void refreshBalance();
      }
    };
    intervalRef.current = setInterval(tick, REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshBalance();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshBalance]);

  async function startDeposit() {
    setError(null);
    if (cents == null) {
      setError("Enter a valid Rand amount.");
      return;
    }
    setStarting(true);
    try {
      await payWalletTopUpWithPaystack({
        amountCents: cents,
        navigate,
        onError: (msg) => {
          setError(msg);
          toast.error(msg);
        },
        onCheckoutDismissed: () => {
          toast.info("Paystack closed — no charge yet. Try again when you are ready.");
        },
      });
    } finally {
      setStarting(false);
    }
  }

  if (initialLoad && balanceCents === null && !loadErr) {
    return <PageLoader />;
  }

  return (
    <div className="shell stack">
      <h2>Wallet</h2>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>
        Top-ups use Paystack in ZAR. Funds credit your wallet after Paystack sends <code>charge.success</code> to our
        webhook and the server verifies the signature.
      </p>
      {loadErr && <div className="error">{loadErr}</div>}
      <div className="card stack">
        <p style={{ margin: 0 }}>Available balance</p>
        <h3 style={{ color: "var(--gold)", fontSize: 28, margin: 0 }}>{balanceCents != null ? zarFromCents(balanceCents) : "—"}</h3>
      </div>
      {balanceCents === 0 && !initialLoad && (
        <EmptyState
          title="Wallet is empty"
          description="Add funds below to build a balance for deployments that debit the wallet at checkout."
        />
      )}

      <h3 style={{ marginBottom: 8 }}>Saved payment methods</h3>
      <CustomerPaymentMethods />

      <h3 style={{ marginTop: 16 }}>Subscriptions</h3>
      <p className="card" style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
        Recurring billing is not enabled in this app build. Plans and subscription events can be added later in Paystack
        and recorded via webhook metadata when your operator is ready.
      </p>

      <h3 style={{ marginTop: 16 }}>Add funds</h3>
      <div className="stack mt">
        <label>
          <span>Amount (ZAR)</span>
          <input className="field mt" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="1" step="1" />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn-gold" type="button" onClick={() => void startDeposit()} disabled={!hasPaystackPublicKey() || starting}>
          {starting ? "Opening Paystack…" : `Deposit ${amountLabel}`}
        </button>
        {!hasPaystackPublicKey() && <p className="error">Add VITE_PAYSTACK_PUBLIC_KEY to your .env file.</p>}
      </div>

      <div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        <Link to="/customer/transactions">Transaction history</Link>
        <Link to="/customer/history">Tip history</Link>
        <Link to="/customer">Browse guards</Link>
      </div>
    </div>
  );
}
