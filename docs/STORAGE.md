# Storage architecture

## Shared prices (git-tracked SQLite)

File: `data/price-history.sqlite`

| Table | Purpose |
|-------|---------|
| `current_prices` | Live grid prices (replaces Google Sheet `prices` tab) |
| `price_meta` | FX metadata |
| `price_history` | Daily snapshots for charts |
| `snapshot_runs` | Snapshot audit rows |

Update locally with `npm run fetch:prices`, then commit and push the SQLite file. Vercel bundles it read-only at deploy time.

Verify before publish: `npm run verify:price-db`

## Per-user collection (Supabase Postgres)

Tables: `app_users`, `collection_items`

- Updated only via the web app (`POST /api/collection`)
- Scoped by `userId` in the signed session (`APP_USER_ID` for the primary owner today)
- Public showcase reads `PUBLIC_COLLECTION_USER_ID`

Setup:

1. Create a Supabase project
2. Set `DATABASE_URL` in `.env.local` and Vercel
3. Run `npm run db:migrate`
4. Run `npm run migrate:from-sheets` once to import Sheet data
5. Set `APP_USER_ID` to a stable UUID before first login

## Backups

| Data | Backup method |
|------|----------------|
| Prices / history | Git history of `data/price-history.sqlite` |
| Collection | `npm run backup:user-db` → `backups/supabase/` (gitignored) |
| Supabase managed | Supabase dashboard backups (production recovery) |

Restore collection to a **local/test** database only:

```bash
RESTORE_DATABASE_URL=postgresql://... npm run restore:user-db -- backups/supabase/user-db-....sql.gz
```

## Cutover flag

Set `USE_GOOGLE_SHEETS_FALLBACK=true` temporarily if SQLite price tables are empty and you still need Sheet prices during migration.
