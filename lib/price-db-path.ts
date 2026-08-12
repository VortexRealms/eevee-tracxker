import path from "node:path";

/** Git-tracked SQLite database for current prices, FX meta, and price history. */
export const PRICE_DB_PATH = path.join(process.cwd(), "data", "price-history.sqlite");
