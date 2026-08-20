import { getAllCards, parseCardIdAndVariant } from "../cards";
import type { CollectionRow } from "../../types";
import { migrateOwnershipVariant } from "../variant-catalogue-fixes";
import { queryRows, withDbClient } from "./postgres";

export interface CollectionItemRecord {
  userId: string;
  cardId: string;
  variant: string;
  createdAt: string;
  updatedAt: string;
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

function splitCompositeCardId(composite: string): { cardId: string; variant: string } {
  const parsed = parseCardIdAndVariant(composite);
  return { cardId: parsed.cardId, variant: parsed.variant || "normal" };
}

function mapItem(row: {
  user_id: string;
  card_id: string;
  variant: string;
  created_at: Date | string;
  updated_at: Date | string;
}): CollectionItemRecord {
  return {
    userId: row.user_id,
    cardId: row.card_id,
    variant: row.variant,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function enrichCollectionItems(items: CollectionItemRecord[]): CollectionRow[] {
  const cards = getAllCards();
  const byId = new Map(cards.map((c) => [c.id, c]));

  return items.flatMap((item) => {
    const migratedVariant = migrateOwnershipVariant(item.cardId, item.variant);
    if (migratedVariant == null) return [];

    const card = byId.get(item.cardId);
    const composite = toCompositeCardId(item.cardId, migratedVariant);
    return [
      {
        cardId: composite,
        variant: migratedVariant,
        name: card?.name ?? "",
        setName: card?.set.name ?? "",
        number: card?.number ?? "",
        imageUrl: card?.images.small ?? "",
        owned: true,
      },
    ];
  });
}

export async function listCollectionItems(userId: string): Promise<CollectionItemRecord[]> {
  const rows = await queryRows<{
    user_id: string;
    card_id: string;
    variant: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT user_id, card_id, variant, created_at, updated_at
     FROM collection_items
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );
  return rows.map(mapItem);
}

export async function getCollectionRowsForUser(userId: string): Promise<CollectionRow[]> {
  const items = await listCollectionItems(userId);
  return enrichCollectionItems(items);
}

export async function upsertCollectionItem(
  userId: string,
  input: UpsertCollectionInput
): Promise<CollectionRow> {
  if (!input.cardId) {
    throw new Error("cardId is required");
  }

  const variant = input.variant ?? splitCompositeCardId(input.cardId).variant;
  const baseCardId = input.cardId.includes(":")
    ? splitCompositeCardId(input.cardId).cardId
    : input.cardId;

  if (input.owned === false) {
    await deleteCollectionItem(userId, baseCardId, variant);
    const card = getAllCards().find((c) => c.id === baseCardId);
    return {
      cardId: toCompositeCardId(baseCardId, variant),
      variant,
      name: input.name ?? card?.name ?? "",
      setName: input.setName ?? card?.set.name ?? "",
      number: input.number ?? card?.number ?? "",
      imageUrl: input.imageUrl ?? card?.images.small ?? "",
      owned: false,
    };
  }

  await withDbClient(async (client) => {
    await client.query(
      `INSERT INTO collection_items (user_id, card_id, variant)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, card_id, variant) DO UPDATE SET updated_at = NOW()`,
      [userId, baseCardId, variant]
    );
  });

  const card = getAllCards().find((c) => c.id === baseCardId);
  return {
    cardId: toCompositeCardId(baseCardId, variant),
    variant,
    name: input.name ?? card?.name ?? "",
    setName: input.setName ?? card?.set.name ?? "",
    number: input.number ?? card?.number ?? "",
    imageUrl: input.imageUrl ?? card?.images.small ?? "",
    owned: true,
  };
}

export async function deleteCollectionItem(
  userId: string,
  cardId: string,
  variant = "normal"
): Promise<boolean> {
  const baseCardId = cardId.includes(":") ? splitCompositeCardId(cardId).cardId : cardId;
  const resolvedVariant = cardId.includes(":")
    ? splitCompositeCardId(cardId).variant
    : variant;

  return withDbClient(async (client) => {
    const result = await client.query(
      `DELETE FROM collection_items
       WHERE user_id = $1 AND card_id = $2 AND variant = $3`,
      [userId, baseCardId, resolvedVariant]
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function replaceCollectionItemsForUser(
  userId: string,
  items: Array<{ cardId: string; variant: string }>,
  options: { replace?: boolean } = {}
): Promise<number> {
  return withDbClient(async (client) => {
    if (options.replace) {
      await client.query(`DELETE FROM collection_items WHERE user_id = $1`, [userId]);
    }

    let inserted = 0;
    for (const item of items) {
      const baseCardId = item.cardId.includes(":")
        ? splitCompositeCardId(item.cardId).cardId
        : item.cardId;
      const variant = item.variant || splitCompositeCardId(item.cardId).variant;
      const result = await client.query(
        `INSERT INTO collection_items (user_id, card_id, variant)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, card_id, variant) DO UPDATE SET updated_at = NOW()`,
        [userId, baseCardId, variant]
      );
      if ((result.rowCount ?? 0) > 0) inserted++;
    }
    return inserted;
  });
}

export async function countCollectionItems(userId: string): Promise<number> {
  const row = await queryOneCount(userId);
  return row;
}

async function queryOneCount(userId: string): Promise<number> {
  const rows = await queryRows<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM collection_items WHERE user_id = $1`,
    [userId]
  );
  return rows[0] ? Number(rows[0].c) : 0;
}
