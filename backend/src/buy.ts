/**
 * XRPL NFT Buy Script
 *
 * This script:
 *   1. Connects to the XRPL Testnet
 *   2. Creates (or reuses) a BUYER wallet
 *   3. Looks up sell offers for the given NFTokenID
 *   4. Accepts the sell offer — XRP goes to seller, NFT goes to buyer
 *   5. Verifies the buyer now owns the NFT
 *
 * Usage:
 *   npx ts-node src/buy.ts --offer <SELL_OFFER_ID>
 *   npx ts-node src/buy.ts --offer <SELL_OFFER_ID> --seed <BUYER_SEED>
 *   npx ts-node src/buy.ts --nft <NFT_TOKEN_ID>                         (browse offers first)
 *   npx ts-node src/buy.ts --nft <NFT_TOKEN_ID> --seller <SELLER_ADDR>  (browse + buy)
 */

import * as xrpl from "xrpl";

// ─── Config ──────────────────────────────────────────────
const TESTNET_URL = "wss://s.altnet.rippletest.net:51233";

// ─── Helpers ─────────────────────────────────────────────
function dropsToXrp(drops: string): string {
  return (parseInt(drops, 10) / 1_000_000).toFixed(6);
}

function getArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return null;
}

// ─── Browse Sell Offers ──────────────────────────────────
async function browseSellOffers(
  client: xrpl.Client,
  nftId: string,
  sellerAddress?: string
) {
  console.log(`\n🔍 Looking up sell offers for NFT: ${nftId.slice(0, 16)}...`);

  const response = await client.request({
    command: "nft_sell_offers",
    nft_id: nftId,
  });

  let offers = response.result.offers;

  if (!offers || offers.length === 0) {
    console.log("   No sell offers found for this NFT.");
    return [];
  }

  // Filter by seller if specified
  if (sellerAddress) {
    offers = offers.filter((o) => o.owner === sellerAddress);
  }

  console.log(`   Found ${offers.length} sell offer(s):\n`);
  console.log("   ┌──────────────────────────────────────────────────────────────────┐");
  console.log("   │ #  │ Price (XRP) │ Seller                              │ Offer  │");
  console.log("   ├──────────────────────────────────────────────────────────────────┤");

  offers.forEach((offer, i) => {
    const price =
      typeof offer.amount === "string"
        ? dropsToXrp(offer.amount)
        : `${offer.amount.value} ${offer.amount.currency}`;
    const seller = offer.owner;
    const offerId = offer.nft_offer_index.slice(0, 8) + "...";
    console.log(
      `   │ ${(i + 1).toString().padStart(2)} │ ${price.padStart(10)} │ ${seller} │ ${offerId} │`
    );
  });
  console.log("   └──────────────────────────────────────────────────────────────────┘\n");

  return offers;
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  const offerIdArg = getArg("--offer");
  const nftIdArg = getArg("--nft");
  const seedArg = getArg("--seed");
  const sellerArg = getArg("--seller");

  if (!offerIdArg && !nftIdArg) {
    console.error(
      "❌ Please provide either --offer <SELL_OFFER_ID> or --nft <NFT_TOKEN_ID>"
    );
    console.error("\nExamples:");
    console.error("  npx ts-node src/buy.ts --offer 5F4D5484AED236D...");
    console.error("  npx ts-node src/buy.ts --nft 000801F4F759230...");
    console.error("  npx ts-node src/buy.ts --nft 000801F4F759230... --seed sEdXXX");
    process.exit(1);
  }

  // 1. Connect
  console.log("🔗 Connecting to XRPL Testnet...");
  const client = new xrpl.Client(TESTNET_URL);
  await client.connect();
  console.log("✅ Connected!");

  try {
    // 2. Resolve the sell offer ID
    let sellOfferId: string;

    if (offerIdArg) {
      sellOfferId = offerIdArg;
      console.log(`\n📝 Using sell offer: ${sellOfferId}`);
    } else {
      // Browse offers for the NFT and pick the first one
      const offers = await browseSellOffers(client, nftIdArg!, sellerArg || undefined);

      if (offers.length === 0) {
        console.log("❌ No offers available to accept.");
        return;
      }

      // Use the first (cheapest) offer
      sellOfferId = offers[0].nft_offer_index;
      const price =
        typeof offers[0].amount === "string"
          ? `${dropsToXrp(offers[0].amount)} XRP`
          : `${offers[0].amount.value} ${offers[0].amount.currency}`;
      console.log(`   → Selecting offer ${sellOfferId.slice(0, 16)}... for ${price}`);
    }

    // 3. Get or create the BUYER wallet
    let buyerWallet: xrpl.Wallet;

    if (seedArg) {
      buyerWallet = xrpl.Wallet.fromSeed(seedArg);
      console.log(`\n👛 Using existing buyer wallet: ${buyerWallet.classicAddress}`);
    } else {
      console.log("\n💰 Creating new buyer wallet from faucet...");
      const fundResult = await client.fundWallet();
      buyerWallet = fundResult.wallet;
      console.log(`👛 Buyer wallet created!`);
    }

    console.log(`   Address: ${buyerWallet.classicAddress}`);
    console.log(`   Seed:    ${buyerWallet.seed}`);

    const balanceBefore = await client.getXrpBalance(buyerWallet.classicAddress);
    console.log(`   Balance: ${balanceBefore} XRP\n`);

    // 4. Accept the sell offer
    console.log("🛒 Accepting sell offer...");

    const acceptTx: xrpl.NFTokenAcceptOffer = {
      TransactionType: "NFTokenAcceptOffer",
      Account: buyerWallet.classicAddress,
      NFTokenSellOffer: sellOfferId,
    };

    const acceptResult = await client.submitAndWait(acceptTx, {
      wallet: buyerWallet,
    });

    const acceptMeta = acceptResult.result.meta as any;
    if (acceptMeta.TransactionResult !== "tesSUCCESS") {
      throw new Error(`Accept offer failed: ${acceptMeta.TransactionResult}`);
    }

    console.log(`✅ Offer accepted!`);
    console.log(`   Tx Hash: ${acceptResult.result.hash}`);

    // Show balance changes
    const balanceChanges = xrpl.getBalanceChanges(acceptMeta);
    console.log(`\n💸 Balance changes:`);
    for (const change of balanceChanges) {
      for (const bal of change.balances) {
        const xrpChange = dropsToXrp(bal.value);
        const sign = bal.value.startsWith("-") ? "" : "+";
        console.log(`   ${change.account.slice(0, 12)}... → ${sign}${xrpChange} XRP`);
      }
    }

    // 5. Verify buyer now owns the NFT
    console.log("\n📋 Verifying NFT ownership...");
    const buyerNfts = await client.request({
      command: "account_nfts",
      account: buyerWallet.classicAddress,
    });

    const ownedNfts = buyerNfts.result.account_nfts;
    console.log(`   Buyer now owns ${ownedNfts.length} NFT(s)`);

    if (ownedNfts.length > 0) {
      console.log("\n   Owned NFTs:");
      for (const nft of ownedNfts) {
        const uri = nft.URI
          ? Buffer.from(nft.URI, "hex").toString("utf-8")
          : "(no URI)";
        console.log(`   • ${nft.NFTokenID.slice(0, 20)}...`);
        console.log(`     URI: ${uri}`);
      }
    }

    const balanceAfter = await client.getXrpBalance(buyerWallet.classicAddress);

    // 6. Summary
    console.log("\n═══════════════════════════════════════════════");
    console.log("  🎉 PURCHASE COMPLETE — SUMMARY");
    console.log("═══════════════════════════════════════════════");
    console.log(`  Buyer:        ${buyerWallet.classicAddress}`);
    console.log(`  Buyer Seed:   ${buyerWallet.seed}`);
    console.log(`  Offer ID:     ${sellOfferId}`);
    console.log(`  Tx Hash:      ${acceptResult.result.hash}`);
    console.log(`  NFTs Owned:   ${ownedNfts.length}`);
    console.log(`  XRP Before:   ${balanceBefore}`);
    console.log(`  XRP After:    ${balanceAfter}`);
    console.log(`  Network:      XRPL Testnet`);
    console.log("═══════════════════════════════════════════════");
    console.log(`\n  🔍 View buyer on explorer:`);
    console.log(
      `  https://testnet.xrpl.org/accounts/${buyerWallet.classicAddress}\n`
    );

    console.log("📝 Save the buyer wallet for future use:\n");
    console.log(`  BUYER_SEED=${buyerWallet.seed}`);
    console.log(`  BUYER_ADDRESS=${buyerWallet.classicAddress}`);
  } catch (error: any) {
    if (error?.data?.error === "object_not_found") {
      console.error("❌ Sell offer not found. It may have already been accepted or cancelled.");
    } else {
      console.error("❌ Error:", error.message || error);
    }
  } finally {
    await client.disconnect();
    console.log("\n🔌 Disconnected from XRPL.");
  }
}

main();
