/**
 * Integration test for per-user collection isolation.
 * Requires DATABASE_URL and runs only when TEST_COLLECTION_DB=1.
 *
 * Run with: TEST_COLLECTION_DB=1 npm run test:collection-db
 */

import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import {
  deleteCollectionItem,
  listCollectionItems,
  upsertCollectionItem,
} from "../lib/db/collection";
import { ensureAppUser } from "../lib/db/users";
import { loadEnvFiles } from "./load-env";

async function main() {
  if (process.env.TEST_COLLECTION_DB !== "1") {
    console.log("test-collection-db: skipped (set TEST_COLLECTION_DB=1 to run)");
    return;
  }

  await loadEnvFiles();
  const userA = randomUUID();
  const userB = randomUUID();
  await ensureAppUser({ id: userA, username: `test-a-${userA.slice(0, 8)}` });
  await ensureAppUser({ id: userB, username: `test-b-${userB.slice(0, 8)}` });

  await upsertCollectionItem(userA, { cardId: "base2-3", variant: "holo", owned: true });
  await upsertCollectionItem(userB, { cardId: "base2-19", variant: "normal", owned: true });

  const itemsA = await listCollectionItems(userA);
  const itemsB = await listCollectionItems(userB);

  assert.equal(itemsA.length, 1);
  assert.equal(itemsA[0].cardId, "base2-3");
  assert.equal(itemsB.length, 1);
  assert.equal(itemsB[0].cardId, "base2-19");

  await deleteCollectionItem(userA, "base2-3", "holo");
  assert.equal((await listCollectionItems(userA)).length, 0);
  assert.equal((await listCollectionItems(userB)).length, 1);

  console.log("test-collection-db: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
