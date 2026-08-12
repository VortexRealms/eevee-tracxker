/**
 * Pokewallet API client with rate-limit throttling for Free tier.
 * Docs: https://www.pokewallet.io/api-docs
 */

const BASE_URL = "https://api.pokewallet.io";
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WINDOW_BUFFER_MS = 100;
const MAX_RETRIES = 4;

export interface PokewalletSetSummary {
  name: string;
  set_code: string | null;
  set_id: string;
  card_count: number;
  language: string | null;
  release_date: string | null;
}

export interface PokewalletTcgPrice {
  sub_type_name?: string;
  low_price?: number;
  mid_price?: number;
  high_price?: number;
  market_price?: number;
  direct_low_price?: number | null;
  updated_at?: string;
}

export interface PokewalletCmPrice {
  avg?: number | null;
  low?: number | null;
  trend?: number | null;
  avg1?: number | null;
  avg7?: number | null;
  avg30?: number | null;
  updated_at?: string;
  variant_type?: string;
}

export interface PokewalletCardInfo {
  name: string;
  clean_name?: string;
  set_name?: string;
  set_code?: string | null;
  set_id?: string;
  card_number?: string;
  rarity?: string;
}

export interface PokewalletCardResult {
  id: string;
  card_info: PokewalletCardInfo;
  tcgplayer?: {
    url?: string;
    prices?: PokewalletTcgPrice[];
  } | null;
  cardmarket?: {
    product_name?: string;
    product_url?: string;
    prices?: PokewalletCmPrice[];
  } | null;
}

export interface PokewalletSetDisambiguation {
  disambiguation: true;
  message?: string;
  matches: Array<{
    set_id?: string;
    group_id?: string;
    set_code?: string;
    name?: string;
    language?: string;
  }>;
}

export interface PokewalletSetPage {
  success?: boolean;
  set?: {
    name: string;
    set_code: string | null;
    set_id: string;
    total_cards: number;
    language?: string | null;
    release_date?: string | null;
  };
  cards?: PokewalletCardResult[];
  pagination?: {
    page: number;
    limit: number;
    total_pages: number;
    total?: number;
  };
}

export interface PokewalletSearchResponse {
  query: string;
  results: PokewalletCardResult[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface RateLimitState {
  remainingHour: number | null;
  remainingDay: number | null;
  limitHour: number | null;
  limitDay: number | null;
  requestCount: number;
}

interface Pokewallet429Body {
  message?: string;
  limits?: {
    hourly?: { limit?: number; used?: number; remaining?: number };
    daily?: { limit?: number; used?: number; remaining?: number };
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseIntHeader(value: string | null): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

/** Set-bulk IDs (e.g. CBB2C) use 64-char hex; search-resolved IDs use pk_ prefix. */
function normalizeCardIdForApi(id: string, setCode?: string): string {
  const trimmed = id.trim();
  if (setCode === "CBB2C" && trimmed.startsWith("pk_")) {
    return trimmed.slice(3);
  }
  return trimmed;
}

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

class SlidingWindowLimiter {
  private readonly timestamps: number[] = [];

  prune(windowMs: number, now = Date.now()): void {
    const cutoff = now - windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0] <= cutoff) {
      this.timestamps.shift();
    }
  }

  count(windowMs: number, now = Date.now()): number {
    this.prune(windowMs, now);
    return this.timestamps.length;
  }

  record(now = Date.now()): void {
    this.timestamps.push(now);
  }

  msUntilSlot(maxPerWindow: number, windowMs: number, now = Date.now()): number {
    this.prune(windowMs, now);
    if (this.timestamps.length < maxPerWindow) return 0;
    const oldest = this.timestamps[0];
    return Math.max(0, windowMs - (now - oldest) + WINDOW_BUFFER_MS);
  }
}

export class PokewalletClient {
  private readonly apiKey: string;
  private readonly maxPerHour: number;
  private readonly maxPerDay: number;
  private readonly rateMargin: number;
  private readonly hourWindow = new SlidingWindowLimiter();
  private readonly dayWindow = new SlidingWindowLimiter();
  private headerHourExhausted = false;
  private headerDayExhausted = false;

  readonly rateLimits: RateLimitState = {
    remainingHour: null,
    remainingDay: null,
    limitHour: null,
    limitDay: null,
    requestCount: 0,
  };

  constructor(apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("POKEWALLET_API_KEY is required.");
    }
    this.apiKey = apiKey.trim();
    this.maxPerHour = parseEnvInt("POKEWALLET_MAX_PER_HOUR", 100);
    this.maxPerDay = parseEnvInt("POKEWALLET_MAX_PER_DAY", 1000);
    this.rateMargin = parseEnvInt("POKEWALLET_RATE_MARGIN", 1);
  }

  static fromEnv(): PokewalletClient {
    const key = process.env.POKEWALLET_API_KEY;
    if (!key) {
      throw new Error(
        "POKEWALLET_API_KEY is not set. Add it to .env or .env.local (see .env.local.example)."
      );
    }
    return new PokewalletClient(key);
  }

  formatRateLimitStatus(): string {
    const hourLimit = this.rateLimits.limitHour ?? this.maxPerHour;
    const dayLimit = this.rateLimits.limitDay ?? this.maxPerDay;
    const hourRemaining = this.rateLimits.remainingHour ?? "?";
    const dayRemaining = this.rateLimits.remainingDay ?? "?";
    return `Pokewallet requests: ${this.rateLimits.requestCount} (hour remaining: ${hourRemaining}/${hourLimit}, day remaining: ${dayRemaining}/${dayLimit})`;
  }

  private effectiveHourCap(): number {
    const configured = Math.max(1, this.maxPerHour - this.rateMargin);
    const fromHeader =
      this.rateLimits.limitHour !== null
        ? Math.max(1, this.rateLimits.limitHour - this.rateMargin)
        : configured;
    return Math.min(configured, fromHeader);
  }

  private effectiveDayCap(): number {
    const configured = Math.max(1, this.maxPerDay - this.rateMargin);
    const fromHeader =
      this.rateLimits.limitDay !== null
        ? Math.max(1, this.rateLimits.limitDay - this.rateMargin)
        : configured;
    return Math.min(configured, fromHeader);
  }

  private async waitForWindow(
    limiter: SlidingWindowLimiter,
    maxPerWindow: number,
    windowMs: number,
    label: string
  ): Promise<void> {
    const waitMs = limiter.msUntilSlot(maxPerWindow, windowMs);
    if (waitMs <= 0) return;

    const hourUsed = this.hourWindow.count(HOUR_MS);
    const dayUsed = this.dayWindow.count(DAY_MS);
    const hourCap = this.effectiveHourCap();
    const dayCap = this.effectiveDayCap();
    console.warn(
      `  Rate limit: ${label} window full, waiting ${Math.ceil(waitMs / 1000)}s (${hourUsed}/${hourCap} hour, ${dayUsed}/${dayCap} day, API hour remaining: ${this.rateLimits.remainingHour ?? "?"})...`
    );
    await sleep(waitMs);
    return this.waitForWindow(limiter, maxPerWindow, windowMs, label);
  }

  private async throttle(): Promise<void> {
    if (
      this.rateLimits.remainingDay !== null &&
      this.rateLimits.remainingDay <= 0
    ) {
      throw new Error(
        "Pokewallet daily rate limit exceeded. Try again tomorrow or upgrade your plan."
      );
    }

    const hourCap = this.effectiveHourCap();
    const dayCap = this.effectiveDayCap();

    if (this.headerDayExhausted || this.rateLimits.remainingDay === 0) {
      await this.waitForWindow(this.dayWindow, dayCap, DAY_MS, "day");
      this.headerDayExhausted = false;
    }

    if (this.headerHourExhausted || this.rateLimits.remainingHour === 0) {
      await this.waitForWindow(this.hourWindow, hourCap, HOUR_MS, "hour");
      this.headerHourExhausted = false;
    }

    await this.waitForWindow(this.dayWindow, dayCap, DAY_MS, "day");
    await this.waitForWindow(this.hourWindow, hourCap, HOUR_MS, "hour");
  }

  private recordRequest(): void {
    const now = Date.now();
    this.hourWindow.record(now);
    this.dayWindow.record(now);
    this.rateLimits.requestCount++;
  }

  private updateRateLimits(res: Response): void {
    const limitHour = parseIntHeader(res.headers.get("X-RateLimit-Limit-Hour"));
    const limitDay = parseIntHeader(res.headers.get("X-RateLimit-Limit-Day"));
    const remainingHour = parseIntHeader(
      res.headers.get("X-RateLimit-Remaining-Hour")
    );
    const remainingDay = parseIntHeader(
      res.headers.get("X-RateLimit-Remaining-Day")
    );

    if (limitHour !== null) this.rateLimits.limitHour = limitHour;
    if (limitDay !== null) this.rateLimits.limitDay = limitDay;
    this.rateLimits.remainingHour = remainingHour;
    this.rateLimits.remainingDay = remainingDay;

    this.headerHourExhausted = remainingHour === 0;
    this.headerDayExhausted = remainingDay === 0;
  }

  private async waitAfter429(
    res: Response,
    body: Pokewallet429Body | null
  ): Promise<void> {
    const retryAfter = parseIntHeader(res.headers.get("Retry-After"));
    if (retryAfter !== null && retryAfter > 0) {
      const waitMs = retryAfter * 1000;
      console.warn(`  Rate limited (429), Retry-After ${retryAfter}s...`);
      await sleep(waitMs);
      return;
    }

    const message = body?.message?.toLowerCase() ?? "";
    const hourlyRemaining = body?.limits?.hourly?.remaining;
    const dailyRemaining = body?.limits?.daily?.remaining;

    if (message.includes("daily") || dailyRemaining === 0) {
      this.headerDayExhausted = true;
      await this.waitForWindow(
        this.dayWindow,
        this.effectiveDayCap(),
        DAY_MS,
        "day"
      );
      this.headerDayExhausted = false;
      return;
    }

    if (message.includes("hour") || hourlyRemaining === 0) {
      this.headerHourExhausted = true;
      await this.waitForWindow(
        this.hourWindow,
        this.effectiveHourCap(),
        HOUR_MS,
        "hour"
      );
      this.headerHourExhausted = false;
      return;
    }

    const hourWait = this.hourWindow.msUntilSlot(
      this.effectiveHourCap(),
      HOUR_MS
    );
    const dayWait = this.dayWindow.msUntilSlot(this.effectiveDayCap(), DAY_MS);
    const waitMs = Math.max(hourWait, dayWait, 5_000);
    console.warn(`  Rate limited (429), waiting ${Math.ceil(waitMs / 1000)}s...`);
    await sleep(waitMs);
  }

  async request<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    let attempt = 0;
    while (true) {
      await this.throttle();
      const url = new URL(path, BASE_URL);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, String(v));
        }
      }

      this.recordRequest();
      const res = await fetch(url.toString(), {
        headers: { "X-API-Key": this.apiKey },
      });
      this.updateRateLimits(res);

      if (res.status === 429) {
        attempt++;
        if (attempt > MAX_RETRIES) {
          throw new Error("Pokewallet rate limit exceeded after retries.");
        }
        const body = (await res.json().catch(() => null)) as Pokewallet429Body | null;
        await this.waitAfter429(res, body);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Pokewallet ${path} failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`
        );
      }

      return (await res.json()) as T;
    }
  }

  async listSets(): Promise<PokewalletSetSummary[]> {
    const data = await this.request<{ success?: boolean; data: PokewalletSetSummary[] }>(
      "/sets"
    );
    return data.data ?? [];
  }

  async getSetPage(
    setCode: string,
    page = 1,
    limit = 200,
    language?: string
  ): Promise<PokewalletSetPage | PokewalletSetDisambiguation> {
    const params: Record<string, string | number> = { page, limit };
    if (language) params.language = language;
    return this.request<PokewalletSetPage | PokewalletSetDisambiguation>(
      `/sets/${encodeURIComponent(setCode)}`,
      params
    );
  }

  async search(query: string, limit = 20): Promise<PokewalletSearchResponse> {
    return this.request<PokewalletSearchResponse>("/search", {
      q: query,
      limit,
    });
  }

  async getCard(id: string, setCode?: string): Promise<PokewalletCardResult> {
    const params: Record<string, string> = {};
    if (setCode) params.set_code = setCode;
    const apiId = normalizeCardIdForApi(id, setCode);
    return this.request<PokewalletCardResult>(
      `/cards/${encodeURIComponent(apiId)}`,
      Object.keys(params).length > 0 ? params : undefined
    );
  }

  async fetchAllSetCards(
    setCode: string,
    language?: string
  ): Promise<{ setMeta: PokewalletSetPage["set"]; cards: PokewalletCardResult[] }> {
    const all: PokewalletCardResult[] = [];
    let setMeta: PokewalletSetPage["set"];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const data = await this.getSetPage(setCode, page, 200, language);
      if ("disambiguation" in data && data.disambiguation) {
        throw new SetDisambiguationError(setCode, data);
      }
      const pageData = data as PokewalletSetPage;
      if (!setMeta && pageData.set) setMeta = pageData.set;
      if (pageData.cards) all.push(...pageData.cards);
      totalPages = pageData.pagination?.total_pages ?? 1;
      page++;
    }

    if (!setMeta) {
      throw new Error(`No set metadata returned for ${setCode}`);
    }

    return { setMeta, cards: all };
  }
}

export class SetDisambiguationError extends Error {
  constructor(
    readonly setCode: string,
    readonly disambiguation: PokewalletSetDisambiguation
  ) {
    super(`Multiple Pokewallet sets match "${setCode}"`);
    this.name = "SetDisambiguationError";
  }
}

