import { NextResponse } from "next/server";
import { requireAuth } from "../../../lib/auth/guards";
import {
  getAllCollectionRows,
  upsertCollectionRow,
  type UpsertCollectionInput
} from "../../../lib/google-sheets";

export async function GET() {
  await requireAuth();
  try {
    const rows = await getAllCollectionRows();
    return NextResponse.json({ rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to load collection" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  await requireAuth();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    cardId,
    variant,
    name,
    setName,
    number,
    imageUrl,
    owned
  } = body as {
    cardId?: unknown;
    variant?: unknown;
    name?: unknown;
    setName?: unknown;
    number?: unknown;
    imageUrl?: unknown;
    owned?: unknown;
  };

  if (typeof cardId !== "string" || !cardId.trim()) {
    return NextResponse.json({ error: "cardId is required" }, { status: 400 });
  }

  const input: UpsertCollectionInput = {
    cardId: cardId.trim()
  };

  if (typeof variant === "string" && variant.trim()) input.variant = variant.trim();
  if (typeof name === "string") input.name = name;
  if (typeof setName === "string") input.setName = setName;
  if (typeof number === "string") input.number = number;
  if (typeof imageUrl === "string") input.imageUrl = imageUrl;

  if (typeof owned === "boolean") input.owned = owned;

  try {
    const row = await upsertCollectionRow(input);
    return NextResponse.json({ row });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to update collection" },
      { status: 500 }
    );
  }
}

