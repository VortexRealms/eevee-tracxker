/**
 * Tests for same-day price fetch skip logic.
 *
 * Run with: npm run test:fetch-price-skip
 */

import type { PriceEntry } from "../types";
import {
  localTodayIso,
  priceDatePart,
  shouldSkipPriceFetch,
} from "../lib/fetch-price-skip";

const TODAY = "2026-07-22";
const YESTERDAY = "2026-07-21";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function entry(partial: Partial<PriceEntry> & Pick<PriceEntry, "updatedAt">): PriceEntry {
  return {
    usd: 1,
    eur: 1,
    source: "pokewallet",
    ...partial,
  };
}

function testPriceDatePart() {
  assert(priceDatePart("2026-07-22") === "2026-07-22", "plain date");
  assert(priceDatePart("2026-07-22T10:00:00") === "2026-07-22", "datetime prefix");
  assert(priceDatePart("") === null, "empty");
  assert(priceDatePart(undefined) === null, "undefined");
  assert(priceDatePart("invalid") === null, "invalid");
}

function testLocalTodayIso() {
  const d = new Date(2026, 6, 22, 15, 30, 0);
  assert(localTodayIso(d) === "2026-07-22", "local date formatting");
}

function testShouldSkipPriceFetch() {
  assert(
    shouldSkipPriceFetch(entry({ updatedAt: TODAY, source: "manual" }), TODAY, false).skip,
    "manual always skips"
  );
  assert(
    shouldSkipPriceFetch(entry({ updatedAt: YESTERDAY, source: "manual" }), TODAY, false)
      .reason === "manual",
    "manual skips even when stale"
  );
  assert(
    shouldSkipPriceFetch(entry({ updatedAt: TODAY }), TODAY, false).skip &&
      shouldSkipPriceFetch(entry({ updatedAt: TODAY }), TODAY, false).reason === "fresh",
    "pokewallet today skips"
  );
  assert(
    !shouldSkipPriceFetch(entry({ updatedAt: YESTERDAY }), TODAY, false).skip,
    "pokewallet yesterday fetches"
  );
  assert(!shouldSkipPriceFetch(undefined, TODAY, false).skip, "missing entry fetches");
  assert(
    !shouldSkipPriceFetch(entry({ updatedAt: "" }), TODAY, false).skip,
    "missing updatedAt fetches"
  );
  assert(
    !shouldSkipPriceFetch(entry({ updatedAt: TODAY }), TODAY, true).skip,
    "force refetches today pokewallet"
  );
  assert(
    shouldSkipPriceFetch(entry({ updatedAt: TODAY, source: "manual" }), TODAY, true).skip,
    "force still skips manual"
  );
  assert(
    shouldSkipPriceFetch(
      entry({ updatedAt: "2026-07-22T08:30:00" }),
      TODAY,
      false
    ).reason === "fresh",
    "datetime updatedAt matches today"
  );
}

function main() {
  testPriceDatePart();
  testLocalTodayIso();
  testShouldSkipPriceFetch();
  console.log("OK: fetch-price-skip tests passed");
}

main();
