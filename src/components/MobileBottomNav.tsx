import { NavLink } from "react-router-dom";

export type HubVariant = "customer" | "guard" | "merchant";

type NavItem = { to: string; label: string; end?: boolean; hash?: string };

const NAV: Record<HubVariant, NavItem[]> = {
  customer: [
    { to: "/customer", label: "Guards", end: true },
    { to: "/customer/dashboard", label: "Hub" },
    { to: "/customer/wallet", label: "Wallet" },
    { to: "/customer/history", label: "History" },
    { to: "/settings", label: "Account" },
  ],
  guard: [
    { to: "/guard", label: "Home", end: true },
    { to: "/guard", label: "Payouts", hash: "payout-preferences" },
    { to: "/guard/qr", label: "QR" },
    { to: "/guard/history", label: "Tips" },
    { to: "/settings", label: "Account" },
  ],
  merchant: [
    { to: "/merchant", label: "Venue", end: true },
    { to: "/merchant", label: "Payouts", hash: "payout-preferences" },
    { to: "/merchant/guards", label: "Guards" },
    { to: "/merchant/locations", label: "Sites" },
    { to: "/settings", label: "Account" },
  ],
};

/** Mobile bottom navigation for role hubs — hidden from `md` breakpoint up. */
export function MobileBottomNav({ variant }: { variant: HubVariant }) {
  const items = NAV[variant];
  return (
    <nav
      className="mobile-bottom-nav md:hidden"
      aria-label={`${variant} navigation`}
    >
      {items.map((item) => {
        const key = item.hash ? `${item.to}#${item.hash}` : item.to;
        if (item.hash) {
          return (
            <a key={key} href={`${item.to}#${item.hash}`} className="mobile-bottom-nav__item tap-target">
              {item.label}
            </a>
          );
        }
        return (
          <NavLink
            key={key}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `mobile-bottom-nav__item tap-target${isActive ? " mobile-bottom-nav__item--active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
