/**
 * Official eBay Browse API client (client-credentials OAuth).
 */

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const DEFAULT_SCOPE = "https://api.ebay.com/oauth/api_scope";
const MAX_RETRIES = 4;

export interface EbayBrowseItemSummary {
  itemId: string;
  title?: string;
  price?: {
    value?: string;
    currency?: string;
  };
  shippingOptions?: Array<{
    shippingCost?: {
      value?: string;
      currency?: string;
    };
  }>;
  buyingOptions?: string[];
  itemWebUrl?: string;
}

export interface EbaySearchResponse {
  total?: number;
  itemSummaries?: EbayBrowseItemSummary[];
  next?: string;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function basicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export class EbayBrowseClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly marketplaceId = "EBAY_US"
  ) {}

  static fromEnv(): EbayBrowseClient {
    const clientId = process.env.EBAY_CLIENT_ID?.trim();
    const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are required");
    }
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_US";
    return new EbayBrowseClient(clientId, clientSecret, marketplaceId);
  }

  private async fetchToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + 60_000) {
      return cachedToken.token;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: DEFAULT_SCOPE,
    });

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(this.clientId, this.clientSecret)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`eBay OAuth failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new Error("eBay OAuth response missing access_token");
    }

    cachedToken = {
      token: data.access_token,
      expiresAt: now + (data.expires_in ?? 7200) * 1000,
    };
    return cachedToken.token;
  }

  /** Reset cached token (tests). */
  static resetTokenCache(): void {
    cachedToken = null;
  }

  async searchItems(input: {
    q: string;
    categoryId?: string;
    limit?: number;
    offset?: number;
  }): Promise<EbaySearchResponse> {
    const token = await this.fetchToken();
    const params = new URLSearchParams({
      q: input.q,
      limit: String(input.limit ?? 50),
      offset: String(input.offset ?? 0),
      filter: "buyingOptions:{FIXED_PRICE}",
    });
    if (input.categoryId) {
      params.set("category_ids", input.categoryId);
    }

    let attempt = 0;
    while (true) {
      attempt++;
      const res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": this.marketplaceId,
          Accept: "application/json",
        },
      });

      if (res.status === 429 || res.status >= 500) {
        if (attempt >= MAX_RETRIES) {
          throw new Error(`eBay search failed after retries: HTTP ${res.status}`);
        }
        await sleep(500 * attempt);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`eBay search failed: HTTP ${res.status} ${text.slice(0, 200)}`);
      }

      return (await res.json()) as EbaySearchResponse;
    }
  }

  async searchAllPages(input: {
    q: string;
    categoryId?: string;
    limitPerPage?: number;
    maxPages?: number;
  }): Promise<EbayBrowseItemSummary[]> {
    const limit = input.limitPerPage ?? 50;
    const maxPages = input.maxPages ?? 3;
    const out: EbayBrowseItemSummary[] = [];

    for (let page = 0; page < maxPages; page++) {
      const response = await this.searchItems({
        q: input.q,
        categoryId: input.categoryId,
        limit,
        offset: page * limit,
      });
      const items = response.itemSummaries ?? [];
      out.push(...items);
      if (items.length < limit) break;
    }

    return out;
  }
}

export { cachedToken as __ebayTokenCacheForTests };
