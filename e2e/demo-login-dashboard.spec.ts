import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo-customer@tipguard.staging";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "TipGuardDemo2026!";

test.describe("Demo customer login → dashboard", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // Clear storage once — addInitScript runs on every navigation/reload and would wipe the session.
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("login, dashboard, refresh, logout", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.getByPlaceholder(/email address/i).fill(DEMO_EMAIL);
    await page.getByPlaceholder(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page).toHaveURL(/\/customer\/dashboard/, { timeout: 30_000 });
    await expect(page.locator("h1").filter({ hasText: "Your dashboard" })).toHaveText("Your dashboard");

    await page.reload({ waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/customer\/dashboard/, { timeout: 15_000 });
    await expect(page.locator("h1").filter({ hasText: "Your dashboard" })).toHaveText("Your dashboard", {
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/(login)?$/, { timeout: 15_000 });

    if (consoleErrors.length) {
      console.log("console errors:", consoleErrors.slice(0, 5));
    }
  });
});
