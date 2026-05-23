import { test, expect } from "@playwright/test";

const LEGAL_ROUTES = [
  { path: "/terms", heading: /terms of use/i },
  { path: "/privacy", heading: /privacy policy/i },
  { path: "/legal/refunds", heading: /refund/i },
  { path: "/legal/popia", heading: /popia|protection of personal/i },
  { path: "/contact", heading: /contact/i },
] as const;

test.describe("Legal and contact pages", () => {
  for (const route of LEGAL_ROUTES) {
    test(`${route.path} loads production copy`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/replace this template/i)).not.toBeVisible();
      await expect(page.getByText(/staging only/i)).not.toBeVisible();
    });
  }

  test("landing footer links to legal routes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /^terms$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^privacy$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^popia$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^refunds$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^contact$/i })).toBeVisible();
  });
});
