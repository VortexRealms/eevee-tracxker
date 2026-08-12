import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/auth/session";
import { getAllCards } from "../../lib/cards";
import { getCollectionRowsForUser } from "../../lib/db/collection";
import { enrichPricesSnapshot } from "../../lib/exchange-rates";
import { getPricesSnapshot } from "../../lib/prices-provider";
import { ChecklistClient } from "./ChecklistClient";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const cards = getAllCards();
  const [rows, rawPrices] = await Promise.all([
    getCollectionRowsForUser(user.userId),
    getPricesSnapshot(),
  ]);
  const prices = await enrichPricesSnapshot(rawPrices);

  return (
    <ChecklistClient
      cards={cards}
      initialCollection={rows}
      initialPrices={prices}
    />
  );
}
