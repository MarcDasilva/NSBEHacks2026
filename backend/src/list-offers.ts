/**
 * List all open sell offers on the XRPL DEX for a given token.
 *
 * Usage:
 *   bun src/list-offers.ts [CURRENCY]
 *
 * Examples:
 *   bun src/list-offers.ts          # defaults to GGK
 *   bun src/list-offers.ts OAK
 */

import dotenv from "dotenv";
dotenv.config();

import * as xrpl from "xrpl";

const XRPL_NETWORK =
  process.env.XRPL_NETWORK || "wss://s.altnet.rippletest.net:51233";
const ISSUER_ADDRESS =
  process.env.ISSUER_ADDRESS || "rUpuaJVFUFhw9Dy7X7SwJgw19PpG7BJ1kE";

const currency = process.argv[2] || "GGK";

async function listOffers() {
  const client = new xrpl.Client(XRPL_NETWORK);
  await client.connect();

  try {
    // Sell offers: someone is selling tokens for XRP
    // taker_gets = tokens (what a buyer would receive)
    // taker_pays = XRP   (what a buyer would pay)
    const sellResponse = await client.request({
      command: "book_offers",
      taker_gets: {
        currency,
        issuer: ISSUER_ADDRESS,
      },
      taker_pays: { currency: "XRP" },
      limit: 200,
    });

    const sellOffers = sellResponse.result.offers || [];

    // Buy offers: someone is buying tokens with XRP
    // taker_gets = XRP    (what a seller would receive)
    // taker_pays = tokens (what a seller would give)
    const buyResponse = await client.request({
      command: "book_offers",
      taker_gets: { currency: "XRP" },
      taker_pays: {
        currency,
        issuer: ISSUER_ADDRESS,
      },
      limit: 200,
    });

    const buyOffers = buyResponse.result.offers || [];

    console.log(`\n=== ${currency} / XRP Order Book ===\n`);

    // -- Sell side --
    console.log(`--- Sell offers (${sellOffers.length}) ---`);
    if (sellOffers.length === 0) {
      console.log("  (none)");
    } else {
      for (const offer of sellOffers) {
        const tokenAmount =
          typeof offer.TakerGets === "object" && "value" in offer.TakerGets
            ? parseFloat(offer.TakerGets.value)
            : 0;
        const xrpDrops =
          typeof offer.TakerPays === "string" ? offer.TakerPays : "0";
        const xrpAmount = parseFloat(xrpDrops) / 1_000_000;
        const pricePerUnit = tokenAmount > 0 ? xrpAmount / tokenAmount : 0;

        console.log(
          `  Account: ${offer.Account}  |  ${tokenAmount} ${currency}  @  ${pricePerUnit.toFixed(8)} XRP/token  (${xrpAmount.toFixed(6)} XRP total)  |  seq: ${offer.Sequence}`,
        );
      }
    }

    console.log();

    // -- Buy side --
    console.log(`--- Buy offers (${buyOffers.length}) ---`);
    if (buyOffers.length === 0) {
      console.log("  (none)");
    } else {
      for (const offer of buyOffers) {
        const xrpDrops =
          typeof offer.TakerGets === "string" ? offer.TakerGets : "0";
        const xrpAmount = parseFloat(xrpDrops) / 1_000_000;
        const tokenAmount =
          typeof offer.TakerPays === "object" && "value" in offer.TakerPays
            ? parseFloat(offer.TakerPays.value)
            : 0;
        const pricePerUnit = tokenAmount > 0 ? xrpAmount / tokenAmount : 0;

        console.log(
          `  Account: ${offer.Account}  |  ${tokenAmount} ${currency}  @  ${pricePerUnit.toFixed(8)} XRP/token  (${xrpAmount.toFixed(6)} XRP total)  |  seq: ${offer.Sequence}`,
        );
      }
    }

    console.log();
    console.log(
      `Total: ${sellOffers.length} sell offer(s), ${buyOffers.length} buy offer(s)`,
    );
  } catch (error: any) {
    console.error("Error fetching offers:", error.message || error);
    process.exit(2);
  } finally {
    await client.disconnect();
  }
}

listOffers();
