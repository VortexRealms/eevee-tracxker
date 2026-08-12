function readEnv(key: string): string {
  return process.env[key]?.trim() ?? "";
}

export function getDatabaseUrl(): string {
  return readEnv("DATABASE_URL") || readEnv("SUPABASE_DB_URL");
}

export function getAppUserId(): string {
  return readEnv("APP_USER_ID");
}

export function getPublicCollectionUserId(): string {
  return readEnv("PUBLIC_COLLECTION_USER_ID") || getAppUserId();
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

export function requireDatabaseUrl(): string {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error(
      "DATABASE_URL (or SUPABASE_DB_URL) is not set. Configure Supabase Postgres connection string."
    );
  }
  return url;
}

export function requireAppUserId(): string {
  const id = getAppUserId();
  if (!id) {
    throw new Error("APP_USER_ID is not set. Use a stable UUID for the primary app user.");
  }
  return id;
}

export function requirePublicCollectionUserId(): string {
  const id = getPublicCollectionUserId();
  if (!id) {
    throw new Error(
      "PUBLIC_COLLECTION_USER_ID (or APP_USER_ID) is not set for the public showcase."
    );
  }
  return id;
}
