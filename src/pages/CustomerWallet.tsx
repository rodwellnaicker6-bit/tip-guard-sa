import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { centsFromRandInput, zarFromCents } from "../lib/money";
import CustomerPaymentMethods from "../components/CustomerPaymentMethods";
import { hasPaystackPublicKey, payWalletTopUpWithPaystack } from "../services/paymentService";
import { useToast } from "../context/useToast";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/EmptyState";
import { FetchError } from "../components/FetchError";

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
      setLoadErr("Could not load wallet balance. Please try again.");
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
        onRequiresAuth: () => {
          sessionStorage.setItem("tipguard_redirect", "/customer/wallet");
          navigate("/login", { replace: true });
        },
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
    <div className="shell dashboard-hub stack min-w-0">
      <header className="page-header">
        <p className="muted-label">Wallet</p>
        <h2 className="font-black text-white">Your balance</h2>
        <p className="mt-1 text-sm text-slate-400">
          Top-ups use Paystack in ZAR. Funds credit after Paystack confirms payment to our webhook.
        </p>
      </header>
      {loadErr ? <FetchError message={loadErr} onRetry={() => void refreshBalance()} /> : null}
      <div className="card stack">
        <p style={{ margin: 0 }}>Available balance</p>
        <h3 style={{ color: "var(--gold)", fontSize: 28, margin: 0 }}>{balanceCents != null ? zarFromCents(balanceCents) : "—"}</h3>
      </div>
      {balanceCents === 0 && !initialLoad && (
        <EmptyState
          title="Wallet is empty"
          description="Add funds below to build a balance for deployments that debit the wallet at checkout."
          action={
            <button className="hub-primary-cta btn-gold tap-target" type="button" onClick={() => document.getElementById("wallet-topup")?.scrollIntoView({ behavior: "smooth" })}>
              Add funds
            </button>
          }
        />
      )}

      <h3 style={{ marginBottom: 8 }}>Saved payment methods</h3>
      <CustomerPaymentMethods />

      <h3 style={{ marginTop: 16 }}>Subscriptions</h3>
      <p className="card" style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
        Recurring billing is not enabled in this app build. Plans and subscription events can be added later in Paystack
        and recorded via webhook metadata when your operator is ready.
      </p>

      <h3 id="wallet-topup" style={{ marginTop: 16 }}>
        Add funds
      </h3>
      <div className="stack mt">
        <label>
          <span>Amount (ZAR)</span>
          <input className="field tap-target mt" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="1" step="1" inputMode="numeric" />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn-gold" type="button" onClick={() => void startDeposit()} disabled={!hasPaystackPublicKey() || starting}>
          {starting ? "Opening Paystack…" : `Deposit ${amountLabel}`}
        </button>
        {!hasPaystackPublicKey() && <p className="error">Add VITE_PAYSTACK_PUBLIC_KEY to your .env file.</p>}
      </div>

      <nav className="hub-nav-grid" style={{ marginTop: 8 }}>
        <Link className="hub-nav-link text-amber-400" to="/customer/transactions">
          Ledger
        </Link>
        <Link className="hub-nav-link text-amber-400" to="/customer/history">
          Tip history
        </Link>
        <Link className="hub-nav-link text-slate-300" to="/customer">
          Guards
        </Link>
        <Link className="hub-nav-link text-slate-300" to="/customer/dashboard">
          Dashboard
        </Link>
      </nav>
    </div>
  );
}
