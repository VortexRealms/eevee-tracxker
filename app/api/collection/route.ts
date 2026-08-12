import { NextResponse } from "next/server";
import { requireAuthApi } from "../../../lib/auth/guards";
import { getCollectionRowsForUser, upsertCollectionItem } from "../../../lib/db/collection";
import { enrichPricesSnapshot } from "../../../lib/exchange-rates";
import { getPricesSnapshot } from "../../../lib/prices-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAuthApi();
  if (auth instanceof NextResponse) return auth;
  try {
    const [rows, rawPrices] = await Promise.all([
      getCollectionRowsForUser(auth.userId),
      getPricesSnapshot(),
    ]);
    const prices = await enrichPricesSnapshot(rawPrices);
    return NextResponse.json({ rows, prices });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to load collection" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireAuthApi();
  if (auth instanceof NextResponse) return auth;

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

  try {
    const row = await upsertCollectionItem(auth.userId, {
      cardId: cardId.trim(),
      variant: typeof variant === "string" ? variant.trim() : undefined,
      name: typeof name === "string" ? name : undefined,
      setName: typeof setName === "string" ? setName : undefined,
      number: typeof number === "string" ? number : undefined,
      imageUrl: typeof imageUrl === "string" ? imageUrl : undefined,
      owned: typeof owned === "boolean" ? owned : undefined,
    });
    return NextResponse.json({ row });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to update collection" },
      { status: 500 }
    );
  }
}
