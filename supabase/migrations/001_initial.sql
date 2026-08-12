-- Supabase / Postgres schema for per-user collection tracking.
-- Apply via Supabase SQL editor or: psql $DATABASE_URL -f supabase/migrations/001_initial.sql

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_items (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, card_id, variant)
);

CREATE INDEX IF NOT EXISTS idx_collection_items_user_id ON collection_items (user_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_card_id ON collection_items (card_id);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;

-- RLS is enabled for future Supabase Auth policies. The app uses the service-role
-- connection string server-side, which bypasses RLS. Add auth.uid() policies when
-- registration is implemented.
