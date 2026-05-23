import { test, expect } from "@playwright/test";

const DEMO_GUARD_EMAIL = "demo-guard@tipguard.staging";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "TipGuardDemo2026!";
const SKIP_TRANSFER = process.env.E2E_SKIP_PAYOUT_TRANSFER === "1";

test.describe("Guard payout request UI", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("demo guard can open payout form and submit request", async ({ page }) => {
    test.skip(SKIP_TRANSFER, "E2E_SKIP_PAYOUT_TRANSFER=1 — skip payout UI test");

    await page.getByPlaceholder(/email address/i).fill(DEMO_GUARD_EMAIL);
    await page.getByPlaceholder(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page).toHaveURL(/\/guard/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /request payout/i })).toBeVisible({ timeout: 15_000 });

    await page.locator('input[inputmode="numeric"]').first().fill("1");
    await page.getByRole("button", { name: /submit request/i }).click();

    await expect(
      page.getByText(/payout request recorded|submitted to paystack|operator will process/i),
    ).toBeVisible({ timeout: 20_000 });
  });
});
