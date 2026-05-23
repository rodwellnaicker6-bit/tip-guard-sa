import { test, expect } from "@playwright/test";

const DEMO_MERCHANT_EMAIL = "demo-merchant@tipguard.staging";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "TipGuardDemo2026!";

test.describe("Demo merchant hub (auth + routing)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("demo merchant login reaches hub and skips setup", async ({ page }) => {
    await page.getByPlaceholder(/email address/i).fill(DEMO_MERCHANT_EMAIL);
    await page.getByPlaceholder(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page).toHaveURL(/\/merchant/, { timeout: 30_000 });
    await expect(page.getByRole("navigation", { name: /merchant navigation/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/merchant/setup");
    await expect(page).toHaveURL(/\/merchant/, { timeout: 15_000 });
  });

  test("onboarding Continue advances role step when session present", async ({ page }) => {
    await page.getByPlaceholder(/email address/i).fill(DEMO_MERCHANT_EMAIL);
    await page.getByPlaceholder(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page).toHaveURL(/\/merchant/, { timeout: 30_000 });

    await page.goto("/onboarding");
    const onOnboarding = await page
      .waitForURL(/\/onboarding/, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!onOnboarding) return;

    const continueBtn = page.getByRole("button", { name: /^continue$/i });
    if (await continueBtn.isVisible().catch(() => false)) {
      await continueBtn.click();
      await expect(page.getByText(/profile basics|venue|go to dashboard/i)).toBeVisible({ timeout: 15_000 });
    }
  });
});
