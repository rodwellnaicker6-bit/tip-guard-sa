/**
 * Production security gates for Paystack review.
 * Usage: npx tsx scripts/verify-production-security.ts
 */
const BASE = process.env.COMPLIANCE_BASE_URL?.trim() || "https://www.tipguardsa.co.za";

type Row = { id: string; pass: boolean; detail: string };

async function main() {
  const rows: Row[] = [];

  const debugRes = await fetch(`${BASE}/api/debug-env`, { redirect: "follow" });
  rows.push({
    id: "debug_env_production_404",
    pass: debugRes.status === 404,
    detail: `GET /api/debug-env → ${debugRes.status}`,
  });

  const homeRes = await fetch(`${BASE}/`);
  const homeHtml = homeRes.ok ? await homeRes.text() : "";
  rows.push({
    id: "html_theme_color_0a0f1a",
    pass: homeHtml.includes('theme-color" content="#0a0f1a"'),
    detail: homeHtml.includes("#0a0f1a") ? "theme-color #0a0f1a" : "theme-color mismatch in index.html",
  });
  const jsUrls = [...homeHtml.matchAll(/\/assets\/index-[^"]+\.js/g)].map((m) => m[0]);
  let bundleText = "";
  if (jsUrls[0]) {
    const jsRes = await fetch(`${BASE}${jsUrls[0]}`);
    bundleText = jsRes.ok ? await jsRes.text() : "";
  }

  rows.push({
    id: "bundle_no_test_mode_banner",
    pass: !bundleText.includes("Paystack test mode"),
    detail: bundleText.includes("Paystack test mode") ? "test banner string still in bundle" : "ok",
  });
  rows.push({
    id: "bundle_no_test_mode_class",
    pass: !bundleText.includes("test-mode-banner"),
    detail: bundleText.includes("test-mode-banner") ? "test-mode-banner class present" : "ok",
  });
  rows.push({
    id: "bundle_no_sk_secret",
    pass: !/sk_(test|live)_/.test(bundleText),
    detail: /sk_(test|live)_/.test(bundleText) ? "secret key pattern in bundle" : "ok",
  });
  rows.push({
    id: "bundle_no_build_fingerprint_ui",
    pass: !bundleText.includes("data-build-id"),
    detail: bundleText.includes("data-build-id") ? "BuildDeployBadge still in bundle" : "ok",
  });

  const manifestRes = await fetch(`${BASE}/manifest.webmanifest`);
  const manifest = manifestRes.ok ? await manifestRes.json() : {};
  const themeOk =
    manifest.theme_color === "#0a0f1a" && manifest.background_color === "#0a0f1a";
  rows.push({
    id: "pwa_theme_0a0f1a",
    pass: themeOk,
    detail: `theme=${manifest.theme_color} bg=${manifest.background_color}`,
  });

  for (const r of rows) {
    console.log(r.pass ? "PASS" : "FAIL", r.id, "—", r.detail);
  }

  const fail = rows.filter((r) => !r.pass).length;
  const pass = rows.filter((r) => r.pass).length;
  console.log(`\nSECURITY ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
