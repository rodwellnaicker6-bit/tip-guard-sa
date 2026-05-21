import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Run e2e against an already-running `vite preview` (set E2E_BASE_URL). */
export default defineConfig({
  ...base,
  webServer: undefined,
});
