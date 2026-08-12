/**
 * Apply Supabase SQL migrations to DATABASE_URL.
 * Run with: npm run db:migrate
 */

import fs from "node:fs";
import path from "node:path";
import { withDbClient } from "../lib/db/postgres";
import { requireDatabaseUrl } from "../lib/db/config";
import { loadEnvFiles } from "./load-env";

async function main() {
  await loadEnvFiles();
  requireDatabaseUrl();

  const migrationPath = path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "001_initial.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");

  await withDbClient(async (client) => {
    await client.query(sql);
  });

  console.log(`Applied migration: ${migrationPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
