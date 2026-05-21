import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { TrustIndicators } from "./fintech/TrustIndicators";
import PaystackTestBanner from "./PaystackTestBanner";
import { TipGuardLogo } from "./TipGuardLogo";
import { useAuthKeyboardInset } from "../hooks/useAuthKeyboardInset";

/** Premium auth layout — glass card, trust row, mobile-first. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const keyboardInset = useAuthKeyboardInset();
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = shellRef.current;
    if (!root) return;

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement)) {
        return;
      }
      requestAnimationFrame(() => {
        t.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    };

    root.addEventListener("focusin", onFocusIn);
    return () => root.removeEventListener("focusin", onFocusIn);
  }, []);

  return (
    <div
      ref={shellRef}
      className={`marketing-page auth-shell${keyboardInset > 0 ? " auth-shell--keyboard" : ""}`}
      style={
        keyboardInset > 0
          ? { paddingBottom: `max(20px, calc(20px + ${keyboardInset}px))` }
          : undefined
      }
    >
      <div className="marketing-glow marketing-glow--auth" aria-hidden />
      <div className="marketing-inner">
        <PaystackTestBanner />
        <header className="auth-header text-center">
          <Link to="/" className="auth-brand mx-auto min-w-0" aria-label="TipGuard home">
            <TipGuardLogo size="md" />
          </Link>
          <h1 className="auth-title">{title}</h1>
          {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
        </header>

        <TrustIndicators compact />

        <div className="glass-card glass-card--auth fx-fade-up fx-stagger-2">
          <div className="auth-body">{children}</div>
        </div>

        {footer ? <footer className="auth-footer fx-fade-up">{footer}</footer> : null}
      </div>
    </div>
  );
}
