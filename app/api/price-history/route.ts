import { NextResponse } from "next/server";
import { requireAuth } from "../../../lib/auth/guards";
import { getPriceHistorySeries } from "../../../lib/price-history-db";
import { PRICE_HISTORY_RETENTION_DAYS } from "../../../lib/price-history-retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DAYS = PRICE_HISTORY_RETENTION_DAYS;
const DEFAULT_DAYS = 30;

export async function GET(req: Request) {
  await requireAuth();

  const url = new URL(req.url);
  const cardId = (url.searchParams.get("cardId") ?? "").trim();
  const variant = (url.searchParams.get("variant") ?? "").trim() || "normal";
  const daysRaw = url.searchParams.get("days");
  const days = Math.min(
    MAX_DAYS,
    Math.max(1, parseInt(daysRaw ?? "", 10) || DEFAULT_DAYS)
  );

  if (!cardId) {
    return NextResponse.json({ error: "cardId is required" }, { status: 400 });
  }

  try {
    const points = getPriceHistorySeries(cardId, variant, days);
    return NextResponse.json({ points });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to load price history" },
      { status: 500 }
    );
  }
}
