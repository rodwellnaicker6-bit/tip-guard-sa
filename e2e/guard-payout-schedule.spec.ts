import { test, expect } from "@playwright/test";

const DEMO_GUARD_EMAIL = "demo-guard@tipguard.staging";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "TipGuardDemo2026!";

test.describe("Guard payout schedule on dashboard", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("shows Instant, Daily, Weekly, Monthly after login", async ({ page }) => {
    await page.getByPlaceholder(/email address/i).fill(DEMO_GUARD_EMAIL);
    await page.getByPlaceholder(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page).toHaveURL(/\/guard/, { timeout: 30_000 });
    await expect(page.locator("#payout-preferences")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Instant", { exact: true })).toBeVisible();
    await expect(page.getByText("Daily", { exact: true })).toBeVisible();
    await expect(page.getByText("Weekly", { exact: true })).toBeVisible();
    await expect(page.getByText("Monthly", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /guard navigation/i }).getByText("Payouts")).toBeVisible();
  });
});
