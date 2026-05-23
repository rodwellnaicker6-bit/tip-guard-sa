import { test, expect } from "@playwright/test";

test.describe("QR resolve and checkout shell", () => {
  test("invalid qr alias route shows error", async ({ page }) => {
    await page.goto("/qr/not-a-real-token-xxxxxxxx");
    await expect(page.getByRole("heading", { name: /tip link unavailable/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test("invalid tip token shows error", async ({ page }) => {
    await page.goto("/t/not-a-real-token-xxxxxxxx");
    await expect(page.getByRole("heading", { name: /tip link unavailable/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test("customer browse loads", async ({ page }) => {
    await page.goto("/customer");
    await expect(page.getByRole("heading", { name: /verified guards/i })).toBeVisible({ timeout: 15000 });
  });

  test("staging demo QR resolves to tip checkout shell", async ({ page }) => {
    await page.goto("/qr/demo-staging-qr-01");
    await expect(page.getByRole("heading", { name: /^Tip /i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /tip link unavailable/i })).not.toBeVisible();
  });

  test("resolve_tip_target RPC path via /t demo token", async ({ page }) => {
    await page.goto("/t/demo-staging-qr-01");
    await expect(page.getByRole("heading", { name: /^Tip /i })).toBeVisible({ timeout: 15000 });
  });

  test("payment failure page renders", async ({ page }) => {
    await page.goto("/payment/failure");
    await expect(page.getByRole("heading", { name: /not completed/i })).toBeVisible({ timeout: 10000 });
  });
});
