import { createContext } from "react";
import type { AuthContextValue } from "./authTypes";

/** React context instance — isolated so `AuthProvider.tsx` stays a single-component Fast Refresh boundary. */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
