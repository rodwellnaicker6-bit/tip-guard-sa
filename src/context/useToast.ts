import { useContext } from "react";
import { ToastContext } from "./toastContext";
import type { ToastContextValue } from "./toastTypes";

const noopToast: ToastContextValue = {
  push: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    console.warn("[TipGuard] useToast called outside ToastProvider — using noop");
    return noopToast;
  }
  return ctx;
}
