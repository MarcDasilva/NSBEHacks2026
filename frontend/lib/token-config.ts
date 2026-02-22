/**
 * Shared XRPL token configuration per API provider.
 * Used for buy/sell orders so orders fill for the graph/API the user is on.
 */

export const XRPL_SERVER = "wss://s.altnet.rippletest.net:51233";
export const ISSUER_ADDRESS = "rUpuaJVFUFhw9Dy7X7SwJgw19PpG7BJ1kE";

/** Provider/ticker id → XRPL currency (token name) for order book and Supabase token_prices. */
export const TICKER_LEGEND: Record<string, string> = {
  google: "GGK",
  openai: "OAK",
  anthropic: "ATK",
  twilio: "TWI",
  elevenlabs: "EVL",
  mistral: "MST",
  cohere: "COH",
  polygon: "PLG",
  deepl: "DPL",
  gradium: "GRD",
  "alpha-vantage": "AVT",
  gecko: "GCK",
  "google-maps": "GMP",
  clearbit: "CLR",
};

export type TokenConfig = {
  currency: string;
  issuer: string;
};

/** Default token when no provider is selected (e.g. GGK for Google). */
const DEFAULT_PROVIDER_ID = "google";

/** Reverse-map a currency code (e.g. "GGK") to all matching provider IDs (e.g. ["google"]). */
export function getProviderIdsForCurrency(currency: string): string[] {
  return Object.entries(TICKER_LEGEND)
    .filter(([, cur]) => cur === currency)
    .map(([id]) => id);
}

/**
 * Returns token config (currency + issuer) for the given API provider id.
 * Use when buying/selling so orders fill for the graph/API the user is on.
 */
export function getTokenConfig(providerId: string | undefined | null): TokenConfig {
  const currency = providerId && TICKER_LEGEND[providerId]
    ? TICKER_LEGEND[providerId]
    : TICKER_LEGEND[DEFAULT_PROVIDER_ID];
  return {
    currency: currency ?? "GGK",
    issuer: ISSUER_ADDRESS,
  };
}
