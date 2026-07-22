import { google } from "googleapis";
import type {
  CollectionRow,
  PriceEntry,
  PriceRow,
  PricesMeta,
  PricesSnapshot,
} from "../types";
import {
  parseUsdRatesJson,
  metaToExchangeRates,
  serializeUsdRatesJson,
} from "./exchange-rates";
import { mergePriceEntries } from "./price-merge";
import { normalizePriceAmount, parsePriceCell } from "./parse-price";
import { normalizePriceEntry } from "./price-entry-utils";

const COLLECTION_SHEET_NAME = "collection";
const PRICES_SHEET_NAME = "prices";
const PRICES_DATA_START_ROW = 3;

function getGoogleEnv(): {
  clientEmail: string;
  privateKey: string;
  sheetId: string;
} {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!clientEmail || !privateKeyRaw || !sheetId) {
    throw new Error("Google Sheets environment variables are not fully set.");
  }
  return {
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    sheetId,
  };
}

function getAuth() {
  const { clientEmail, privateKey } = getGoogleEnv();
  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetId(): string {
  return getGoogleEnv().sheetId;
}

function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

function parseCollectionCardIdAndVariant(raw: string): { cardId: string; variant: string } {
  const s = (raw ?? "").toString().trim();
  const colon = s.indexOf(":");
  if (colon >= 0) {
    return { cardId: s, variant: s.slice(colon + 1) || "normal" };
  }
  return { cardId: s, variant: "normal" };
}

function normalizeRow(row: (string | null | undefined)[]): CollectionRow {
  const [cardIdRaw, nameRaw, setNameRaw, numberRaw, imageUrlRaw, ownedRaw] = row;

  const { cardId, variant } = parseCollectionCardIdAndVariant((cardIdRaw ?? "").toString());
  const name = (nameRaw ?? "").toString();
  const setName = (setNameRaw ?? "").toString();
  const number = (numberRaw ?? "").toString();
  const imageUrl = (imageUrlRaw ?? "").toString();

  const owned =
    typeof ownedRaw === "string"
      ? ["true", "1", "yes", "y", "owned"].includes(ownedRaw.toLowerCase().trim())
      : false;

  return { cardId, variant, name, setName, number, imageUrl, owned };
}

function normalizePriceRow(row: (string | null | undefined)[]): PriceRow {
  const [cardIdRaw, usdRaw, eurRaw, updatedAtRaw, variantsJsonRaw, sourceRaw] = row;
  const cardId = (cardIdRaw ?? "").toString().trim();
  const sourceRawStr = (sourceRaw ?? "").toString().trim().toLowerCase();
  const source =
    sourceRawStr === "manual" ? "manual" : sourceRawStr === "pokewallet" ? "pokewallet" : undefined;

  return {
    cardId,
    usd: parsePriceCell(usdRaw),
    eur: parsePriceCell(eurRaw),
    updatedAt: (updatedAtRaw ?? "").toString().trim() || undefined,
    variantsJson: (variantsJsonRaw ?? "").toString().trim() || undefined,
    source,
  };
}

function coerceVariantPrice(
  value: unknown
): number | null | undefined {
  if (value == null) return null;
  if (typeof value === "number") {
    return normalizePriceAmount(value);
  }
  if (typeof value === "string") {
    return parsePriceCell(value);
  }
  return null;
}

function sanitizeVariantPrices(
  variants: PriceEntry["variants"]
): PriceEntry["variants"] | undefined {
  if (!variants) return undefined;
  const out: NonNullable<PriceEntry["variants"]> = {};
  for (const [key, prices] of Object.entries(variants)) {
    if (!prices || typeof prices !== "object") continue;
    out[key] = {
      usd: coerceVariantPrice(prices.usd),
      eur: coerceVariantPrice(prices.eur),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function priceRowToEntry(row: PriceRow): PriceEntry | null {
  if (!row.cardId || row.cardId === "_meta") return null;
  let variants: PriceEntry["variants"];
  if (row.variantsJson) {
    try {
      variants = sanitizeVariantPrices(
        JSON.parse(row.variantsJson) as PriceEntry["variants"]
      );
    } catch {
      variants = undefined;
    }
  }
  return normalizePriceEntry({
    usd: row.usd ?? null,
    eur: row.eur ?? null,
    updatedAt: row.updatedAt ?? "",
    source: row.source === "manual" ? "manual" : "pokewallet",
    ...(variants ? { variants } : {}),
  });
}

function entryToRowValues(
  cardId: string,
  entry: PriceEntry,
  source: "pokewallet" | "manual"
): (string | number)[] {
  const variantsJson =
    entry.variants && Object.keys(entry.variants).length > 0
      ? JSON.stringify(entry.variants)
      : "";
  return [
    cardId,
    entry.usd ?? "",
    entry.eur ?? "",
    entry.updatedAt,
    variantsJson,
    source,
  ];
}

export async function getAllCollectionRows(): Promise<CollectionRow[]> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${COLLECTION_SHEET_NAME}!A2:F`,
  });

  const values = res.data.values ?? [];
  return values
    .map((row) => normalizeRow(row))
    .filter((row) => row.cardId.trim() !== "");
}

function rowMatches(row: CollectionRow, composite: string): boolean {
  if (row.cardId === composite) return true;
  if (composite.endsWith(":normal") && row.cardId === composite.slice(0, -7)) return true;
  return false;
}

export async function getCollectionRowByCardId(
  compositeCardId: string
): Promise<{ rowNumber: number; row: CollectionRow } | null> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${COLLECTION_SHEET_NAME}!A2:F`,
  });

  const values = res.data.values ?? [];

  for (let i = 0; i < values.length; i += 1) {
    const row = normalizeRow(values[i]);
    if (rowMatches(row, compositeCardId)) {
      return { rowNumber: i + 2, row };
    }
  }

  return null;
}

export interface UpsertCollectionInput {
  cardId: string;
  variant?: string;
  name?: string;
  setName?: string;
  number?: string;
  imageUrl?: string;
  owned?: boolean;
}

function toCompositeCardId(cardId: string, variant: string): string {
  return variant && variant !== "normal" ? `${cardId}:${variant}` : `${cardId}:normal`;
}

export async function upsertCollectionRow(
  input: UpsertCollectionInput
): Promise<CollectionRow> {
  const sheets = getSheetsClient();

  if (!input.cardId) {
    throw new Error("cardId is required");
  }

  const variant = input.variant ?? "normal";
  const composite = input.cardId.includes(":")
    ? input.cardId
    : toCompositeCardId(input.cardId, variant);

  const existing = await getCollectionRowByCardId(composite);

  const base: CollectionRow = existing?.row ?? {
    cardId: composite,
    variant,
    name: input.name ?? "",
    setName: input.setName ?? "",
    number: input.number ?? "",
    imageUrl: input.imageUrl ?? "",
    owned: false,
  };

  const merged: CollectionRow = {
    cardId: composite,
    variant,
    name: input.name ?? base.name,
    setName: input.setName ?? base.setName,
    number: input.number ?? base.number,
    imageUrl: input.imageUrl ?? base.imageUrl,
    owned: input.owned ?? base.owned,
  };

  const rowValues = [
    merged.cardId,
    merged.name,
    merged.setName,
    merged.number,
    merged.imageUrl,
    merged.owned ? "TRUE" : "FALSE",
  ];

  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${COLLECTION_SHEET_NAME}!A${existing.rowNumber}:F${existing.rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [rowValues] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSheetId(),
      range: `${COLLECTION_SHEET_NAME}!A2:F`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [rowValues] },
    });
  }

  return merged;
}

// --- Prices tab ---

function parseRatesUpdatedAt(raw: unknown): string {
  const s = (raw ?? "").toString().trim();
  return s || new Date().toISOString().slice(0, 10);
}

function looksLikeUsdRatesJson(raw: unknown): boolean {
  return typeof raw === "string" && raw.trim().startsWith("{");
}

/** Read Sheet meta row. Supports new A:C layout and legacy A:D with eurUsdRate in B. */
function parsePricesMetaRow(row: (string | null | undefined)[]): PricesMeta {
  const col1 = row[1];
  const col2 = row[2];
  const col3 = row[3];

  if (looksLikeUsdRatesJson(col3)) {
    const usdRates = parseUsdRatesJson(col3);
    return {
      ratesUpdatedAt: parseRatesUpdatedAt(col2),
      ...(usdRates ? { usdRates } : {}),
    };
  }

  if (looksLikeUsdRatesJson(col2)) {
    const usdRates = parseUsdRatesJson(col2);
    return {
      ratesUpdatedAt: parseRatesUpdatedAt(col1),
      ...(usdRates ? { usdRates } : {}),
    };
  }

  const legacyRate = parsePriceCell(col1);
  if (legacyRate != null && legacyRate > 0) {
    return {
      ratesUpdatedAt: parseRatesUpdatedAt(col2),
      usdRates: { EUR: 1 / legacyRate },
    };
  }

  return { ratesUpdatedAt: parseRatesUpdatedAt(col1) };
}

export async function getPricesMeta(): Promise<PricesMeta> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${PRICES_SHEET_NAME}!A1:D1`,
  });
  return parsePricesMetaRow(res.data.values?.[0] ?? []);
}

export async function getAllPriceRows(): Promise<PriceRow[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${PRICES_SHEET_NAME}!A${PRICES_DATA_START_ROW}:F`,
  });
  const values = res.data.values ?? [];
  return values
    .map((row) => normalizePriceRow(row))
    .filter((row) => row.cardId.trim() !== "" && row.cardId !== "_meta");
}

async function getPriceRowIndexByCardId(
  cardId: string
): Promise<{ rowNumber: number; row: PriceRow } | null> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${PRICES_SHEET_NAME}!A${PRICES_DATA_START_ROW}:F`,
  });
  const values = res.data.values ?? [];
  for (let i = 0; i < values.length; i += 1) {
    const row = normalizePriceRow(values[i]);
    if (row.cardId === cardId) {
      return { rowNumber: i + PRICES_DATA_START_ROW, row };
    }
  }
  return null;
}

export async function getPricesSnapshot(): Promise<PricesSnapshot> {
  const [meta, rows] = await Promise.all([getPricesMeta(), getAllPriceRows()]);
  const entries: Record<string, PriceEntry> = {};
  for (const row of rows) {
    const entry = priceRowToEntry(row);
    if (entry) entries[row.cardId] = entry;
  }
  return { meta, entries };
}

export interface UpsertPriceInput {
  cardId: string;
  entry: PriceEntry;
  source: "pokewallet" | "manual";
  /** When true, skip update if existing row is manual. Default true for pokewallet source. */
  respectManualLock?: boolean;
}

export async function upsertPriceRow(input: UpsertPriceInput): Promise<PriceRow | null> {
  const respectManualLock = input.respectManualLock ?? input.source === "pokewallet";
  const existing = await getPriceRowIndexByCardId(input.cardId);
  if (respectManualLock && existing?.row.source === "manual") {
    return null;
  }

  const sheets = getSheetsClient();
  const rowValues = entryToRowValues(input.cardId, input.entry, input.source);
  const merged: PriceRow = {
    cardId: input.cardId,
    usd: input.entry.usd ?? null,
    eur: input.entry.eur ?? null,
    updatedAt: input.entry.updatedAt,
    variantsJson:
      input.entry.variants && Object.keys(input.entry.variants).length > 0
        ? JSON.stringify(input.entry.variants)
        : undefined,
    source: input.source,
  };

  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${PRICES_SHEET_NAME}!A${existing.rowNumber}:F${existing.rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [rowValues] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSheetId(),
      range: `${PRICES_SHEET_NAME}!A${PRICES_DATA_START_ROW}:F`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [rowValues] },
    });
  }

  return merged;
}

export async function writePricesMeta(meta: PricesMeta): Promise<void> {
  const sheets = getSheetsClient();
  const rates = metaToExchangeRates(meta);
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${PRICES_SHEET_NAME}!A1:C1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          "_meta",
          rates.ratesUpdatedAt,
          serializeUsdRatesJson(rates.usdRates),
        ],
      ],
    },
  });
}

export async function ensurePricesSheetHeaders(): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${PRICES_SHEET_NAME}!A2:F2`,
    valueInputOption: "RAW",
    requestBody: {
      values: [["cardId", "usd", "eur", "updatedAt", "variantsJson", "source"]],
    },
  });
}

/**
 * Sync fetched Pokewallet prices to the Sheet. Skips rows with source=manual.
 */
export async function syncPricesToSheet(
  entries: Record<string, PriceEntry>,
  meta: PricesMeta
): Promise<{ updated: number; skipped: number; appended: number }> {
  const sheets = getSheetsClient();
  await ensurePricesSheetHeaders();
  await writePricesMeta(meta);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${PRICES_SHEET_NAME}!A${PRICES_DATA_START_ROW}:F`,
  });
  const values = res.data.values ?? [];
  const indexByCardId = new Map<string, { rowNumber: number; row: PriceRow }>();
  for (let i = 0; i < values.length; i += 1) {
    const row = normalizePriceRow(values[i]);
    if (row.cardId) indexByCardId.set(row.cardId, { rowNumber: i + PRICES_DATA_START_ROW, row });
  }

  const batchData: Array<{ range: string; values: (string | number)[][] }> = [];
  let skipped = 0;
  let appended = 0;
  const appendRows: (string | number)[][] = [];

  for (const [cardId, entry] of Object.entries(entries)) {
    const existing = indexByCardId.get(cardId);
    if (existing?.row.source === "manual") {
      skipped++;
      continue;
    }
    const existingEntry = existing ? priceRowToEntry(existing.row) : null;
    const merged = mergePriceEntries(entry, existingEntry ?? undefined);
    const rowValues = entryToRowValues(cardId, merged, "pokewallet");
    if (existing) {
      batchData.push({
        range: `${PRICES_SHEET_NAME}!A${existing.rowNumber}:F${existing.rowNumber}`,
        values: [rowValues],
      });
    } else {
      appendRows.push(rowValues);
      appended++;
    }
  }

  if (batchData.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSheetId(),
      requestBody: {
        valueInputOption: "RAW",
        data: batchData,
      },
    });
  }

  if (appendRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSheetId(),
      range: `${PRICES_SHEET_NAME}!A${PRICES_DATA_START_ROW}:F`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: appendRows },
    });
  }

  return { updated: batchData.length, skipped, appended };
}

/**
 * Full replace/merge for migration: writes all entries with explicit source.
 * Manual entries overwrite pokewallet for the same cardId.
 */
export async function syncAllPricesToSheet(
  entries: Record<string, PriceEntry>,
  sources: Record<string, "pokewallet" | "manual">,
  meta: PricesMeta
): Promise<void> {
  await ensurePricesSheetHeaders();
  await writePricesMeta(meta);

  const sheets = getSheetsClient();
  const rows: (string | number)[][] = Object.entries(entries).map(([cardId, entry]) =>
    entryToRowValues(cardId, entry, sources[cardId] ?? "pokewallet")
  );

  if (rows.length === 0) return;

  await sheets.spreadsheets.values.clear({
    spreadsheetId: getSheetId(),
    range: `${PRICES_SHEET_NAME}!A${PRICES_DATA_START_ROW}:F`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${PRICES_SHEET_NAME}!A${PRICES_DATA_START_ROW}:F${PRICES_DATA_START_ROW + rows.length - 1}`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}
