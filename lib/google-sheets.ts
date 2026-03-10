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

function normalizeRow(row: (string | null | undefined)[]): CollectionRow {
  const [
    cardIdRaw,
    nameRaw,
    setNameRaw,
    numberRaw,
    imageUrlRaw,
    ownedRaw
  ] = row;

  const cardId = (cardIdRaw ?? "").toString().trim();
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

export async function getCollectionRowByCardId(
  cardId: string
): Promise<{ rowNumber: number; row: CollectionRow } | null> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${COLLECTION_SHEET_NAME}!A2:F`
  });

  const values = res.data.values ?? [];

  for (let i = 0; i < values.length; i += 1) {
    const row = normalizeRow(values[i]);
    if (row.cardId === cardId) {
      // Row numbers are 1-indexed and we started at row 2.
      return { rowNumber: i + 2, row };
    }
  }

  return null;
}

export interface UpsertCollectionInput {
  cardId: string;
  name?: string;
  setName?: string;
  number?: string;
  imageUrl?: string;
  owned?: boolean;
}

export async function upsertCollectionRow(
  input: UpsertCollectionInput
): Promise<CollectionRow> {
  const sheets = getSheetsClient();

  if (!input.cardId) {
    throw new Error("cardId is required");
  }

  const existing = await getCollectionRowByCardId(input.cardId);

  const base: CollectionRow = existing?.row ?? {
    cardId: input.cardId,
    name: input.name ?? "",
    setName: input.setName ?? "",
    number: input.number ?? "",
    imageUrl: input.imageUrl ?? "",
    owned: false
  };

  const merged: CollectionRow = {
    cardId: base.cardId,
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

