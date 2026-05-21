import { useContext } from "react";
import { AuthContext } from "./authReactContext";
import type { AuthContextValue } from "./authTypes";

/** Consumer hook — lives in its own `.tsx` module so it is not bundled with `AuthProvider` for React Fast Refresh. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
