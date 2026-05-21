/**
 * Apply all supabase/migrations/*.sql in order via direct Postgres connection.
 * Requires DATABASE_URL in .env (Supabase Dashboard → Settings → Database → Connection string URI).
 *
 * Usage: npm run db:apply
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("Set DATABASE_URL in .env (Postgres URI from Supabase Dashboard → Database).");
  console.error("Then run: npm run db:apply");
  process.exit(1);
}

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

async function main() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log(`Applying ${files.length} migrations…\n`);

  await client.query(`
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      name text
    );
  `).catch(() => {
    /* schema may not exist; continue */
  });

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const { rows } = await client.query(
      "select 1 from supabase_migrations.schema_migrations where version = $1",
      [version],
    ).catch(() => ({ rows: [] as { "?column?": number }[] }));

    if (rows.length > 0) {
      console.log(`  skip ${file}`);
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf8");
    process.stdout.write(`  apply ${file}… `);
    try {
      await client.query(sql);
      await client
        .query(
          "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2) on conflict do nothing",
          [version, file],
        )
        .catch(() => undefined);
      console.log("ok");
    } catch (e) {
      console.log("FAILED");
      console.error((e as Error).message);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log("\nAll migrations applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
