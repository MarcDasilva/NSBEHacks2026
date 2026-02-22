import dotenv from "dotenv";
dotenv.config();

import * as xrpl from "xrpl";

// Configurable via env or hardcoded
const TOKEN_CURRENCY = process.env.TOKEN_CURRENCY || "GGK";
const ISSUER_ADDRESS = process.env.ISSUER_ADDRESS || "rUpuaJVFUFhw9Dy7X7SwJgw19PpG7BJ1kE";
const XRPL_NETWORK = process.env.XRPL_NETWORK || "wss://s.altnet.rippletest.net:51233";

// Accept issuer secret, recipient address, and amount from command line or env
const ISSUER_SECRET = process.argv[2] || process.env.ISSUER_SECRET;
const RECIPIENT_ADDRESS = process.argv[3] || process.env.RECIPIENT_ADDRESS;
const AMOUNT = process.argv[4] || process.env.AMOUNT;

if (!ISSUER_SECRET || !RECIPIENT_ADDRESS || !AMOUNT) {
  console.error("Usage: bun src/issue-tokens.ts <issuer_secret> <recipient_address> <amount>");
  process.exit(1);
}

async function issueTokens() {
  const client = new xrpl.Client(XRPL_NETWORK);
  await client.connect();

  try {
    const issuerWallet = xrpl.Wallet.fromSeed(ISSUER_SECRET);
    const paymentTx: xrpl.Payment = {
      TransactionType: "Payment",
      Account: issuerWallet.address,
      Destination: RECIPIENT_ADDRESS,
      Amount: {
        currency: TOKEN_CURRENCY,
        value: AMOUNT,
        issuer: ISSUER_ADDRESS,
      },
    };

    const prepared = await client.autofill(paymentTx);
    const signed = issuerWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    const meta = result.result.meta as xrpl.TransactionMetadata;

    if (typeof meta === "object" && meta.TransactionResult === "tesSUCCESS") {
      console.log(`Issued ${AMOUNT} ${TOKEN_CURRENCY} to ${RECIPIENT_ADDRESS}`);
      console.log(`Transaction hash: ${result.result.hash}`);
    } else {
      const errorResult = typeof meta === "object" ? meta.TransactionResult : "Unknown error";
      console.error(`Failed to issue tokens: ${errorResult}`);
      process.exit(2);
    }
  } catch (error: any) {
    console.error("Error issuing tokens:", error.message || error);
    process.exit(3);
  } finally {
    await client.disconnect();
  }
}

issueTokens();

