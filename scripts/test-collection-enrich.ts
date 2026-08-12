import assert from "node:assert/strict";
import { enrichCollectionItems } from "../lib/db/collection";

{
  const rows = enrichCollectionItems([
    {
      userId: "11111111-1111-1111-1111-111111111111",
      cardId: "base2-3",
      variant: "holo",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cardId, "base2-3:holo");
  assert.equal(rows[0].variant, "holo");
  assert.equal(rows[0].owned, true);
  assert.ok(rows[0].name.length > 0);
}

console.log("test-collection-enrich: ok");
