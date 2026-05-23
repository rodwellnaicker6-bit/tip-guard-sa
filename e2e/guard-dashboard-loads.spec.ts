import { test, expect } from "@playwright/test";

const DEMO_GUARD_EMAIL = "demo-guard@tipguard.staging";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "TipGuardDemo2026!";

test.describe("Guard dashboard loads", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("login reaches /guard with content, not stuck loader", async ({ page }) => {
    const pageLoader = page.getByRole("status", { name: /loading page/i });

    await page.getByPlaceholder(/email address/i).fill(DEMO_GUARD_EMAIL);
    await page.getByPlaceholder(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page).toHaveURL(/\/guard/, { timeout: 30_000 });

    const payoutPanel = page.locator("#payout-preferences");
    const guardNav = page.getByRole("navigation", { name: /guard navigation/i });
    await expect(payoutPanel.or(guardNav)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: /^Hi / })).toBeVisible({
      timeout: 15_000,
    });
    await expect(pageLoader).toHaveCount(0);
  });
});
