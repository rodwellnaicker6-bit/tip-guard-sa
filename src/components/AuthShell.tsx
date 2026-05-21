import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TrustIndicators } from "./fintech/TrustIndicators";
import PaystackTestBanner from "./PaystackTestBanner";
import { TipGuardLogo } from "./TipGuardLogo";

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
  return (
    <div className="marketing-page">
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
