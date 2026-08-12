/**
 * Restore a pg_dump backup into RESTORE_DATABASE_URL (never production by default).
 *
 * Run with: npm run restore:user-db -- backups/supabase/user-db-....sql.gz
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadEnvFiles } from "./load-env";

async function main() {
  await loadEnvFiles();
  const backupPath = process.argv[2];
  if (!backupPath) {
    console.error("Usage: npm run restore:user-db -- <backup.sql.gz>");
    process.exit(1);
  }

  const targetUrl = process.env.RESTORE_DATABASE_URL?.trim();
  if (!targetUrl) {
    console.error(
      "RESTORE_DATABASE_URL is not set. Point it at a local/test Postgres instance only."
    );
    process.exit(1);
  }

  const resolved = path.resolve(backupPath);
  if (!fs.existsSync(resolved)) {
    console.error(`Backup not found: ${resolved}`);
    process.exit(1);
  }

  const gunzip = spawnSync("gzip", ["-dc", resolved], {
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 256,
  });
  if (gunzip.error || gunzip.status !== 0) {
    console.error(gunzip.stderr?.toString() ?? gunzip.error?.message);
    process.exit(gunzip.status ?? 1);
  }

  const psql = spawnSync("psql", [targetUrl], {
    input: gunzip.stdout,
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 256,
  });
  if (psql.error || psql.status !== 0) {
    console.error(psql.stderr?.toString() ?? psql.error?.message);
    process.exit(psql.status ?? 1);
  }

  console.log(`Restored ${resolved} -> RESTORE_DATABASE_URL`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
