interface MarketOptions {
  market?: string | undefined;
}

interface LimitOptions {
  limit?: number | undefined;
}

interface PaginationOptions extends LimitOptions {
  offset?: number | undefined;
}

interface PaginationMarketOptions extends PaginationOptions, MarketOptions {}

export interface SearchOptions extends PaginationMarketOptions {
  include_external?: "audio" | undefined;
}

export type SpotifyError = {
  status: number;
  message: string;
  reason?: string;
};
