# Storage architecture

## Shared prices (git-tracked SQLite)

File: `data/price-history.sqlite`

| Table | Purpose |
|-------|---------|
| `current_prices` | One live row per `(card_id, variant)` with source, price kind, and optional provider metadata |
| `price_meta` | FX metadata |
| `price_history` | Daily snapshots for charts (variant-level, with per-variant source) |
| `snapshot_runs` | Snapshot audit rows |

### Current price providers

Each variant row has exactly one effective provider:

1. `manual` — never overwritten by fetch
2. Explicit provider assignment (eBay mappings in `data/ebay-price-mappings.json`)
3. Default Pokewallet market prices

eBay values are **active fixed-price asking medians**, not sold prices.

Update locally with `npm run fetch:prices`, then commit and push the SQLite file. Vercel bundles it read-only at deploy time.

One-time schema migration (run while daily automation is idle):

```bash
npm run migrate:current-prices
```

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
