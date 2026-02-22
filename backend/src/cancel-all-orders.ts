import dotenv from "dotenv";
dotenv.config();

import * as xrpl from "xrpl";

const XRPL_NETWORK = process.env.XRPL_NETWORK || "wss://s.altnet.rippletest.net:51233";
const WALLET_SECRET = process.argv[2] || process.env.WALLET_SECRET;

if (!WALLET_SECRET) {
  console.error("Usage: bun src/cancel-all-orders.ts <wallet_secret>");
  process.exit(1);
}

async function cancelAllOrders() {
  const client = new xrpl.Client(XRPL_NETWORK);
  await client.connect();

  try {
    const wallet = xrpl.Wallet.fromSeed(WALLET_SECRET);
    const account = wallet.classicAddress;

    // Fetch all open offers for the wallet
    const offersResponse = await client.request({
      command: "account_offers",
      account,
      limit: 400,
    });
    const offers = offersResponse.result.offers || [];
    if (offers.length === 0) {
      console.log("No open offers found for this wallet.");
      return;
    }
    console.log(`Found ${offers.length} open offers. Cancelling...`);

    for (const offer of offers) {
      const offerSequence = offer.seq;
      const cancelTx: xrpl.OfferCancel = {
        TransactionType: "OfferCancel",
        Account: account,
        OfferSequence: offerSequence,
      };
      const prepared = await client.autofill(cancelTx);
      const signed = wallet.sign(prepared);
      const result = await client.submitAndWait(signed.tx_blob);
      const meta = result.result.meta as xrpl.TransactionMetadata;
      if (typeof meta === "object" && meta.TransactionResult === "tesSUCCESS") {
        console.log(`Cancelled offer with sequence: ${offerSequence} (tx: ${result.result.hash})`);
      } else {
        const errorResult = typeof meta === "object" ? meta.TransactionResult : "Unknown error";
        console.error(`Failed to cancel offer ${offerSequence}: ${errorResult}`);
      }
    }
  } catch (error: any) {
    console.error("Error cancelling orders:", error.message || error);
    process.exit(2);
  } finally {
    await client.disconnect();
  }
}

cancelAllOrders();

