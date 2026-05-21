import { test, expect } from "@playwright/test";

test.describe("Auth pages and route guards (no credentials)", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await context.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });
  test("login page renders and submit button is actionable", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByPlaceholder(/email address/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  test("register page renders", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();
    await expect(page.getByPlaceholder(/full name/i)).toBeVisible();
  });

  test("forgot password page renders", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: /forgot password/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /send reset link/i })).toBeEnabled();
  });

  test("unauthenticated user cannot access admin", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("unauthenticated user cannot access customer dashboard", async ({ page }) => {
    await page.goto("/customer/dashboard", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("unauthenticated user cannot access guard dashboard", async ({ page }) => {
    await page.goto("/guard", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("unauthenticated user cannot access merchant KYC", async ({ page }) => {
    await page.goto("/merchant/kyc", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("public guard listing is reachable without auth", async ({ page }) => {
    await page.goto("/customer");
    await expect(page.getByRole("heading", { name: /verified guards/i })).toBeVisible();
  });

  test("login and landing usable at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue/i })).toBeEnabled();
    await page.goto("/");
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  });

  test("landing has no horizontal overflow at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflow).toBe(false);
    await expect(page.getByText("TipGuard").first()).toBeVisible();
  });
});
