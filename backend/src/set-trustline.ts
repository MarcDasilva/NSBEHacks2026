import dotenv from "dotenv";
dotenv.config();

import * as xrpl from "xrpl";

// Configurable via env or hardcoded
const TOKEN_CURRENCY = process.env.TOKEN_CURRENCY || "GGK";
const ISSUER_ADDRESS = process.env.ISSUER_ADDRESS || "rUpuaJVFUFhw9Dy7X7SwJgw19PpG7BJ1kE";
const XRPL_NETWORK = process.env.XRPL_NETWORK || "wss://s.altnet.rippletest.net:51233";

// Accept wallet secret from command line or env
const WALLET_SECRET = process.argv[2] || process.env.WALLET_SECRET;

if (!WALLET_SECRET) {
  console.error("Usage: bun src/set-trustline.ts <wallet_secret> or set WALLET_SECRET env var");
  process.exit(1);
}

async function setTrustLine() {
  const client = new xrpl.Client(XRPL_NETWORK);
  await client.connect();

  try {
    const wallet = xrpl.Wallet.fromSeed(WALLET_SECRET);
    const trustSetTx: xrpl.TrustSet = {
      TransactionType: "TrustSet",
      Account: wallet.address,
      LimitAmount: {
        currency: TOKEN_CURRENCY,
        issuer: ISSUER_ADDRESS,
        value: "1000000000", // High limit
      },
    };

    const prepared = await client.autofill(trustSetTx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    const meta = result.result.meta as xrpl.TransactionMetadata;

    if (
      typeof meta === "object" &&
      (meta.TransactionResult === "tesSUCCESS" || meta.TransactionResult === "tecDUPLICATE")
    ) {
      console.log(`Trust line set up successfully for ${TOKEN_CURRENCY} (${ISSUER_ADDRESS}) on wallet ${wallet.address}`);
      console.log(`Transaction hash: ${result.result.hash}`);
    } else {
      const errorResult = typeof meta === "object" ? meta.TransactionResult : "Unknown error";
      console.error(`Failed to set up trust line: ${errorResult}`);
      process.exit(2);
    }
  } catch (error: any) {
    console.error("Error setting trust line:", error.message || error);
    process.exit(3);
  } finally {
    await client.disconnect();
  }
}

setTrustLine();

