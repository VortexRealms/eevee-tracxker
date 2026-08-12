import { NextResponse } from "next/server";
import { getCollectionRowsForUser } from "../../../lib/db/collection";
import { requirePublicCollectionUserId } from "../../../lib/db/config";
import { enrichPricesSnapshot } from "../../../lib/exchange-rates";
import { getPricesSnapshot } from "../../../lib/prices-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const publicUserId = requirePublicCollectionUserId();
    const [rows, rawPrices] = await Promise.all([
      getCollectionRowsForUser(publicUserId),
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
