import { createContext } from "react";
import type { ToastContextValue } from "./toastTypes";

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);
