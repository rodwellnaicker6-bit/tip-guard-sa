import { test, expect } from "@playwright/test";

const DEMO_MERCHANT_EMAIL = "demo-merchant@tipguard.staging";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "TipGuardDemo2026!";

test.describe("Merchant dashboard loads", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("login reaches /merchant with content, not stuck loader", async ({ page }) => {
    const pageLoader = page.getByRole("status", { name: /loading page/i });

    await page.getByPlaceholder(/email address/i).fill(DEMO_MERCHANT_EMAIL);
    await page.getByPlaceholder(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page).toHaveURL(/\/merchant/, { timeout: 30_000 });

    const merchantNav = page.getByRole("navigation", { name: /merchant navigation/i });
    await expect(merchantNav).toBeVisible({ timeout: 20_000 });
    await expect(pageLoader).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: /welcome back/i })).toHaveCount(0);
  });
});
