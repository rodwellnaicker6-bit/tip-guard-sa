/** Writes scripts/combined-migrations.sql for Dashboard SQL Editor paste. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const parts = files.map((f) => `-- ### ${f}\n${readFileSync(join(dir, f), "utf8")}`);
const out = join(process.cwd(), "scripts", "combined-migrations.sql");
writeFileSync(out, parts.join("\n\n"), "utf8");
console.log(`Wrote ${out} (${files.length} files)`);
