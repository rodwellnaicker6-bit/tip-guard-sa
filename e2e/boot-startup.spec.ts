import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 360, height: 800 } });

test("production build boots landing without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await expect(page.getByText("TipGuard").first()).toBeVisible({ timeout: 15_000 });

  const fatal = errors.filter(
    (e) => !e.includes("env configuration") && !e.includes("VITE_SUPABASE") && !e.includes("VITE_PAYSTACK"),
  );
  expect(fatal, `unexpected console errors: ${fatal.join("; ")}`).toEqual([]);
});
