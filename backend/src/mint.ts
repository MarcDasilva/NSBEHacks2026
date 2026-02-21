/**
 * XRPL NFT Minting Script
 *
 * This script:
 *   1. Connects to the XRPL Testnet
 *   2. Funds a test wallet (or uses an existing seed)
 *   3. Mints an NFToken representing an API key listing
 *   4. Creates a sell offer for the NFT priced in XRP
 *
 * Usage:
 *   npx ts-node src/mint.ts
 *   npx ts-node src/mint.ts --seed sEdxxxxxxx   (use existing wallet)
 */

import * as xrpl from "xrpl";

// ─── Config ──────────────────────────────────────────────
const TESTNET_URL = "wss://s.altnet.rippletest.net:51233";

// Example listing metadata — in production this would be
// a URL to your API (e.g. https://yourapp.com/api/listings/<id>)
const LISTING_METADATA = {
  title: "OpenAI GPT-4 API Access",
  description: "Access to GPT-4 with 60 req/min rate limit",
  category: "ai_ml",
  provider: "OpenAI",
};

// Price in XRP (will be converted to drops: 1 XRP = 1,000,000 drops)
const PRICE_XRP = 50;

// Transfer fee on resales (0-50000, where 1000 = 1%)
const TRANSFER_FEE = 500; // 0.5%

// ─── Helpers ─────────────────────────────────────────────
function xrpToDrops(xrp: number): string {
  return (xrp * 1_000_000).toString();
}

function extractNFTokenID(meta: any): string | null {
  // The NFTokenID is found in the affected nodes of the transaction metadata
  const affectedNodes = meta.AffectedNodes;
  if (!affectedNodes) return null;

  for (const node of affectedNodes) {
    const created = node.CreatedNode;
    const modified = node.ModifiedNode;

    const pageData =
      created?.NewFields?.NFTokens ||
      modified?.FinalFields?.NFTokens;

    const prevTokens =
      modified?.PreviousFields?.NFTokens || [];

    if (pageData) {
      // Find the token that exists in FinalFields but not in PreviousFields
      const prevIds = new Set(
        prevTokens.map((t: any) => t.NFToken.NFTokenID)
      );
      for (const token of pageData) {
        if (!prevIds.has(token.NFToken.NFTokenID)) {
          return token.NFToken.NFTokenID;
        }
      }
    }
  }
  return null;
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  // 1. Connect to XRPL Testnet
  console.log("🔗 Connecting to XRPL Testnet...");
  const client = new xrpl.Client(TESTNET_URL);
  await client.connect();
  console.log("✅ Connected!\n");

  try {
    // 2. Get or create a wallet
    let wallet: xrpl.Wallet;

    const seedArg = process.argv.indexOf("--seed");
    if (seedArg !== -1 && process.argv[seedArg + 1]) {
      // Use existing seed
      wallet = xrpl.Wallet.fromSeed(process.argv[seedArg + 1]);
      console.log(`👛 Using existing wallet: ${wallet.classicAddress}`);
    } else {
      // Fund a new testnet wallet
      console.log("💰 Requesting testnet wallet from faucet...");
      const fundResult = await client.fundWallet();
      wallet = fundResult.wallet;
      console.log(`👛 New wallet created!`);
    }

    console.log(`   Address: ${wallet.classicAddress}`);
    console.log(`   Seed:    ${wallet.seed}`);

    const balance = await client.getXrpBalance(wallet.classicAddress);
    console.log(`   Balance: ${balance} XRP\n`);

    // 3. Mint the NFT
    console.log("🔨 Minting NFToken...");

    const metadataUri = JSON.stringify(LISTING_METADATA);

    const mintTx: xrpl.NFTokenMint = {
      TransactionType: "NFTokenMint",
      Account: wallet.classicAddress,
      URI: xrpl.convertStringToHex(metadataUri),
      Flags: xrpl.NFTokenMintFlags.tfTransferable, // Allow resale
      TransferFee: TRANSFER_FEE,
      NFTokenTaxon: 0,
    };

    const mintResult = await client.submitAndWait(mintTx, { wallet });

    const mintMeta = mintResult.result.meta as any;
    if (mintMeta.TransactionResult !== "tesSUCCESS") {
      throw new Error(
        `Mint failed: ${mintMeta.TransactionResult}`
      );
    }

    const nftTokenId = extractNFTokenID(mintMeta);
    if (!nftTokenId) {
      throw new Error("Could not extract NFTokenID from transaction metadata");
    }

    console.log(`✅ NFT Minted!`);
    console.log(`   NFTokenID: ${nftTokenId}`);
    console.log(`   Tx Hash:   ${mintResult.result.hash}\n`);

    // 4. Verify — list all NFTs owned by this account
    console.log("📋 Fetching account NFTs...");
    const nftsResponse = await client.request({
      command: "account_nfts",
      account: wallet.classicAddress,
    });
    console.log(
      `   Account owns ${nftsResponse.result.account_nfts.length} NFT(s)\n`
    );

    // 5. Create a sell offer
    console.log(`💲 Creating sell offer for ${PRICE_XRP} XRP...`);

    const sellOfferTx: xrpl.NFTokenCreateOffer = {
      TransactionType: "NFTokenCreateOffer",
      Account: wallet.classicAddress,
      NFTokenID: nftTokenId,
      Amount: xrpToDrops(PRICE_XRP), // price in drops
      Flags: xrpl.NFTokenCreateOfferFlags.tfSellNFToken,
    };

    const sellResult = await client.submitAndWait(sellOfferTx, { wallet });

    const sellMeta = sellResult.result.meta as any;
    if (sellMeta.TransactionResult !== "tesSUCCESS") {
      throw new Error(
        `Sell offer failed: ${sellMeta.TransactionResult}`
      );
    }

    // Extract offer ID from affected nodes
    let sellOfferId = "";
    for (const node of sellMeta.AffectedNodes) {
      if (
        node.CreatedNode &&
        node.CreatedNode.LedgerEntryType === "NFTokenOffer"
      ) {
        sellOfferId = node.CreatedNode.LedgerIndex;
        break;
      }
    }

    console.log(`✅ Sell offer created!`);
    console.log(`   Offer ID:  ${sellOfferId}`);
    console.log(`   Price:     ${PRICE_XRP} XRP`);
    console.log(`   Tx Hash:   ${sellResult.result.hash}\n`);

    // 6. Summary
    console.log("═══════════════════════════════════════════════");
    console.log("  🎉 MINTING COMPLETE — SUMMARY");
    console.log("═══════════════════════════════════════════════");
    console.log(`  Wallet:       ${wallet.classicAddress}`);
    console.log(`  Seed:         ${wallet.seed}`);
    console.log(`  NFTokenID:    ${nftTokenId}`);
    console.log(`  Sell Offer:   ${sellOfferId}`);
    console.log(`  Price:        ${PRICE_XRP} XRP`);
    console.log(`  Transfer Fee: ${TRANSFER_FEE / 1000}% on resales`);
    console.log(`  Network:      XRPL Testnet`);
    console.log("═══════════════════════════════════════════════");
    console.log(`\n  🔍 View on explorer:`);
    console.log(
      `  https://testnet.xrpl.org/accounts/${wallet.classicAddress}\n`
    );

    // Save for later use
    console.log("📝 Save these values — you'll need them to accept offers:\n");
    console.log(`  WALLET_SEED=${wallet.seed}`);
    console.log(`  NFT_TOKEN_ID=${nftTokenId}`);
    console.log(`  SELL_OFFER_ID=${sellOfferId}`);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.disconnect();
    console.log("\n🔌 Disconnected from XRPL.");
  }
}

main();
