import { NextResponse } from "next/server";
import { getAllCollectionRows } from "../../../lib/google-sheets";

export const dynamic = "force-dynamic";

export async function GET() {
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
