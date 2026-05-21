import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageview } from "../lib/analytics";

/** Fires a pageview on SPA route changes when analytics env is set. */
export function RouteAnalytics() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    trackPageview(`${pathname}${search}`);
  }, [pathname, search]);

  return null;
}
