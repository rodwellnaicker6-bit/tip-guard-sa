import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  title: string;
  updated: string;
  children: ReactNode;
};

export function LegalPageLayout({ title, updated, children }: Props) {
  return (
    <div className="shell stack legal-page overflow-x-hidden">
      <h1>{title}</h1>
      <p className="legal-meta">Last updated: {updated} · TipGuard SA (Pty) Ltd</p>
      <section className="card stack legal-prose">{children}</section>
      <nav className="legal-footer-nav flex flex-wrap gap-3 text-sm">
        <Link to="/">Home</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/legal/popia">POPIA</Link>
        <Link to="/legal/cookies">Cookies</Link>
        <Link to="/legal/refunds">Refunds</Link>
        <Link to="/contact">Contact</Link>
        <Link to="/legal/merchant">Merchants</Link>
      </nav>
    </div>
  );
}
