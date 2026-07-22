import { NextResponse } from "next/server";
import { enrichPricesSnapshot } from "../../../lib/exchange-rates";
import { getAllCollectionRows, getPricesSnapshot } from "../../../lib/google-sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [rows, rawPrices] = await Promise.all([
      getAllCollectionRows(),
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
