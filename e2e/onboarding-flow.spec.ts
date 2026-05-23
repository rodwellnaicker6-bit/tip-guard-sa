import { test, expect } from "@playwright/test";

test.describe("Onboarding route", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await context.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("unauthenticated user is sent to login", async ({ page }) => {
    await page.goto("/onboarding", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("login page links to register for new onboarding users", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /create account/i })).toBeVisible();
  });
});
