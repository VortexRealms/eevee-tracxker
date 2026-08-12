/**
 * Backup Supabase Postgres to backups/supabase/ using pg_dump.
 * Requires pg_dump on PATH and DATABASE_URL (or SUPABASE_DB_URL).
 *
 * Run with: npm run backup:user-db
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { requireDatabaseUrl } from "../lib/db/config";
import { loadEnvFiles } from "./load-env";

async function main() {
  await loadEnvFiles();
  const databaseUrl = requireDatabaseUrl();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(process.cwd(), "backups", "supabase");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `user-db-${stamp}.sql.gz`);

  const result = spawnSync(
    "pg_dump",
    ["--dbname", databaseUrl, "--no-owner", "--no-privileges"],
    { encoding: "buffer", maxBuffer: 1024 * 1024 * 256 }
  );

  if (result.error || result.status !== 0) {
    console.error(result.stderr?.toString() ?? result.error?.message);
    process.exit(result.status ?? 1);
  }

  const gzip = spawnSync("gzip", ["-c"], {
    input: result.stdout,
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 256,
  });

  if (gzip.error || gzip.status !== 0) {
    console.error(gzip.stderr?.toString() ?? gzip.error?.message);
    process.exit(gzip.status ?? 1);
  }

  fs.writeFileSync(outFile, gzip.stdout);
  console.log(`Backup written: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
