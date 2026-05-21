import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** Load `.env` / `.env.local` into process.env (simple KEY=VALUE parser). */
export function loadEnvFiles(root = process.cwd()) {
  for (const name of [".env", ".env.local"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

export function requireEnv(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (!v) missing.push(k);
    else out[k] = v;
  }
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  return out;
}
