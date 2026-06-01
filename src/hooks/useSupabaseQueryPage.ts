import { useEffect } from "react";
import { printSupabaseQueryPageReport, setSupabaseQueryPage } from "../lib/supabaseQueryInstrument";

/** Registers active page for [QUERY] logs; prints report on unmount in DEV/trace mode. */
export function useSupabaseQueryPage(page: string): void {
  useEffect(() => {
    setSupabaseQueryPage(page);
    return () => {
      printSupabaseQueryPageReport(page);
      setSupabaseQueryPage(null);
    };
  }, [page]);
}
