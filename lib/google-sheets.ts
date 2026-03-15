import { google } from "googleapis";
import type { CollectionRow } from "../types";

const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

const COLLECTION_SHEET_NAME = "collection";

function getAuth() {
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
    throw new Error("Google Sheets environment variables are not fully set.");
  }

  // Private key usually has \n escaped in env vars.
  const privateKey = GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

function parseCardIdAndVariant(raw: string): { cardId: string; variant: string } {
  const s = (raw ?? "").toString().trim();
  const colon = s.indexOf(":");
  if (colon >= 0) {
    return { cardId: s, variant: s.slice(colon + 1) || "normal" };
  }
  return { cardId: s, variant: "normal" };
}

function normalizeRow(row: (string | null | undefined)[]): CollectionRow {
  const [
    cardIdRaw,
    nameRaw,
    setNameRaw,
    numberRaw,
    imageUrlRaw,
    ownedRaw
  ] = row;

  const { cardId, variant } = parseCardIdAndVariant((cardIdRaw ?? "").toString());
  const name = (nameRaw ?? "").toString();
  const setName = (setNameRaw ?? "").toString();
  const number = (numberRaw ?? "").toString();
  const imageUrl = (imageUrlRaw ?? "").toString();

  const owned =
    typeof ownedRaw === "string"
      ? ["true", "1", "yes", "y", "owned"].includes(
          ownedRaw.toLowerCase().trim()
        )
      : false;

  return {
    cardId,
    variant,
    name,
    setName,
    number,
    imageUrl,
    owned
  };
}

export async function getAllCollectionRows(): Promise<CollectionRow[]> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${COLLECTION_SHEET_NAME}!A2:F`
  });

  const values = res.data.values ?? [];
  return values
    .map((row) => normalizeRow(row))
    .filter((row) => row.cardId.trim() !== "");
}

/** Match composite key: exact match, or legacy "baseId" when composite is "baseId:normal". */
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
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${COLLECTION_SHEET_NAME}!A2:F`
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
    owned: false
  };

  const merged: CollectionRow = {
    cardId: composite,
    variant,
    name: input.name ?? base.name,
    setName: input.setName ?? base.setName,
    number: input.number ?? base.number,
    imageUrl: input.imageUrl ?? base.imageUrl,
    owned: input.owned ?? base.owned
  };

  const rowValues = [
    merged.cardId,
    merged.name,
    merged.setName,
    merged.number,
    merged.imageUrl,
    merged.owned ? "TRUE" : "FALSE"
  ];

  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID!,
      range: `${COLLECTION_SHEET_NAME}!A${existing.rowNumber}:F${existing.rowNumber}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [rowValues]
      }
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID!,
      range: `${COLLECTION_SHEET_NAME}!A2:F`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [rowValues]
      }
    });
  }

  return merged;
}

