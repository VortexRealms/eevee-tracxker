import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { requireDatabaseUrl } from "./config";

let pool: Pool | null = null;

/** Supabase pooler URLs use sslmode=require; pg v8 treats that as verify-full unless libpq compat is set. */
function normalizeConnectionString(url: string): string {
  if (
    url.includes("sslmode=require") &&
    !url.includes("uselibpqcompat=")
  ) {
    return url.replace(
      "sslmode=require",
      "uselibpqcompat=true&sslmode=require"
    );
  }
  return url;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: normalizeConnectionString(requireDatabaseUrl()),
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

export async function withDbClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function queryRows<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await queryRows<T>(sql, params);
  return rows[0] ?? null;
}
