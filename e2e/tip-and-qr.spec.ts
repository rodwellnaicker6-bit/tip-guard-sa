import { test, expect } from "@playwright/test";

test.describe("QR resolve and checkout shell", () => {
  test("invalid tip token shows error", async ({ page }) => {
    await page.goto("/t/not-a-real-token-xxxxxxxx");
    await expect(page.getByText(/invalid|expired|tip link/i)).toBeVisible({ timeout: 15000 });
  });

  test("customer browse loads", async ({ page }) => {
    await page.goto("/customer");
    await expect(page.getByRole("heading", { name: /verified guards/i })).toBeVisible({ timeout: 15000 });
  });
});
