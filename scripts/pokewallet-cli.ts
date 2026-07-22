export interface BatchCliOptions {
  offset: number;
  limit: number | null;
  onlyMissing: boolean;
  force: boolean;
  verbose: boolean;
  seed: number | null;
  cards: string[] | null;
}

export function parseBatchCli(argv: string[]): BatchCliOptions {
  const opts: BatchCliOptions = {
    offset: 0,
    limit: null,
    onlyMissing: false,
    force: false,
    verbose: false,
    seed: null,
    cards: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--offset" && argv[i + 1]) {
      opts.offset = Math.max(0, parseInt(argv[++i], 10) || 0);
    } else if (arg === "--limit" && argv[i + 1]) {
      opts.limit = Math.max(1, parseInt(argv[++i], 10) || 1);
    } else if (arg === "--only-missing") {
      opts.onlyMissing = true;
    } else if (arg === "--force") {
      opts.force = true;
    } else if (arg === "--verbose" || arg === "-v") {
      opts.verbose = true;
    } else if (arg === "--seed" && argv[i + 1]) {
      opts.seed = parseInt(argv[++i], 10) || 0;
    } else if (arg === "--cards" && argv[i + 1]) {
      opts.cards = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  return opts;
}

export function sliceBatch<T>(items: T[], offset: number, limit: number | null): T[] {
  const start = offset;
  const end = limit === null ? items.length : offset + limit;
  return items.slice(start, end);
}

/** Simple seeded RNG for reproducible random card picks. */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function pickRandomItems<T>(items: T[], count: number, seed: number): T[] {
  const rng = seededRandom(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}
