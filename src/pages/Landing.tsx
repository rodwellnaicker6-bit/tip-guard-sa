import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import PaystackTestBanner from "../components/PaystackTestBanner";
import { TrustIndicators } from "../components/fintech/TrustIndicators";
import { TipGuardLogo } from "../components/TipGuardLogo";
import { BusinessContactBlock } from "../components/BusinessContactBlock";

export default function Landing() {
  const { user, role, isGuardUser, isMerchantUser } = useAuth();

  useEffect(() => {
    void import("./QrTipLanding");
  }, []);

  return (
    <div className="marketing-page">
      <div className="marketing-glow" aria-hidden />
      <div className="marketing-inner">
        <PaystackTestBanner />

        <header className="text-center">
          <div className="mb-1 flex justify-center">
            <TipGuardLogo size="lg" showWordmark={false} />
          </div>
          <p className="muted-label">South Africa · Digital tipping</p>
          <h1 className="marketing-hero">TipGuard</h1>
          <p className="marketing-lead">
            Tip verified car guards and venues in seconds — scan a QR, tap NFC, or pay with card and mobile wallets in ZAR.
          </p>
        </header>

        <TrustIndicators />

        <div className="glass-card fx-fade-up fx-stagger-2">
          {!user ? (
            <div className="stack stack--loose">
              <p className="glass-card-copy">
                Create an account or sign in to send tips, manage your wallet, and track every payment securely.
              </p>
              <Link to="/login" className="btn-gold btn-gold--shine tap-target">
                Sign in
              </Link>
              <Link to="/register" className="btn-ghost tap-target">
                Create free account
              </Link>
              <Link to="/customer" className="link-subtle tap-target">
                Browse verified guards →
              </Link>
            </div>
          ) : (
            <div className="stack stack--loose">
              <p className="glass-card-copy">You are signed in. Open your dashboard to continue.</p>
              {role === "admin" ? (
                <Link to="/admin" className="btn-gold btn-gold--shine tap-target">
                  Admin dashboard
                </Link>
              ) : isGuardUser ? (
                <Link to="/guard" className="btn-gold btn-gold--shine tap-target">
                  Guard dashboard
                </Link>
              ) : isMerchantUser ? (
                <Link to="/merchant" className="btn-gold btn-gold--shine tap-target">
                  Merchant dashboard
                </Link>
              ) : (
                <>
                  <Link to="/customer/dashboard" className="btn-gold btn-gold--shine tap-target">
                    Your dashboard
                  </Link>
                  <Link to="/customer" className="btn-ghost tap-target">
                    Browse guards
                  </Link>
                </>
              )}
              <Link to="/settings" className="btn-ghost tap-target">
                Account settings
              </Link>
            </div>
          )}
        </div>

        <footer className="marketing-footer fx-fade-up">
          <div className="marketing-footer-links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/legal/popia">POPIA</Link>
            <Link to="/legal/refunds">Refunds</Link>
            <Link to="/contact">Contact</Link>
            <a href="https://paystack.com" target="_blank" rel="noreferrer">
              Paystack
            </a>
          </div>
          <div className="mx-auto mt-6 max-w-md">
            <BusinessContactBlock compact />
          </div>
        </footer>
      </div>
    </div>
  );
}
