import { queryOne, withDbClient } from "./postgres";

export interface AppUser {
  id: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

function mapUser(row: {
  id: string;
  username: string;
  created_at: Date | string;
  updated_at: Date | string;
}): AppUser {
  return {
    id: row.id,
    username: row.username,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getUserByUsername(username: string): Promise<AppUser | null> {
  const row = await queryOne<{
    id: string;
    username: string;
    created_at: Date;
    updated_at: Date;
  }>(`SELECT id, username, created_at, updated_at FROM app_users WHERE username = $1`, [
    username,
  ]);
  return row ? mapUser(row) : null;
}

export async function getUserById(userId: string): Promise<AppUser | null> {
  const row = await queryOne<{
    id: string;
    username: string;
    created_at: Date;
    updated_at: Date;
  }>(`SELECT id, username, created_at, updated_at FROM app_users WHERE id = $1`, [userId]);
  return row ? mapUser(row) : null;
}

/** Idempotent seed for the primary env-configured user. */
export async function ensureAppUser(input: {
  id: string;
  username: string;
}): Promise<AppUser> {
  return withDbClient(async (client) => {
    const existing = await client.query<{
      id: string;
      username: string;
      created_at: Date;
      updated_at: Date;
    }>(`SELECT id, username, created_at, updated_at FROM app_users WHERE id = $1 OR username = $2`, [
      input.id,
      input.username,
    ]);

    if (existing.rows[0]) {
      return mapUser(existing.rows[0]);
    }

    const inserted = await client.query<{
      id: string;
      username: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO app_users (id, username)
       VALUES ($1, $2)
       RETURNING id, username, created_at, updated_at`,
      [input.id, input.username]
    );
    return mapUser(inserted.rows[0]);
  });
}

export async function countAppUsers(): Promise<number> {
  const row = await queryOne<{ c: string }>(`SELECT COUNT(*)::text AS c FROM app_users`);
  return row ? Number(row.c) : 0;
}
