export type ToastVariant = "info" | "success" | "error";

export type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

export type ToastContextValue = {
  push: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};
