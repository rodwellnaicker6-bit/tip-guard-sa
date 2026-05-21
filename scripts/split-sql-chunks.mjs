import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "scripts/combined-migrations.sql"), "utf8");
const max = 18000;
const dir = join(process.cwd(), "scripts", "sql-chunks");
mkdirSync(dir, { recursive: true });

const parts = [];
let buf = "";
for (const line of sql.split("\n")) {
  if (buf.length + line.length + 1 > max && buf.length > 0) {
    parts.push(buf);
    buf = "";
  }
  buf += (buf ? "\n" : "") + line;
}
if (buf) parts.push(buf);

parts.forEach((p, i) => {
  const name = `chunk-${String(i + 1).padStart(2, "0")}.sql`;
  writeFileSync(join(dir, name), p, "utf8");
  console.log(name, p.length);
});
