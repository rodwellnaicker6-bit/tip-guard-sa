import { defineConfig, devices } from "@playwright/test";

/** Dedicated port so e2e does not collide with a local `npm run dev` on 5173. */
const e2ePort = process.env.E2E_PORT ?? "5193";
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;

/** Set `PW_CHANNEL=chrome` if bundled Chromium crashes on launch (e.g. SEGV in some macOS / sandbox environments). */
const useSystemChrome = process.env.PW_CHANNEL === "chrome";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(useSystemChrome ? { channel: "chrome" as const } : {}),
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
