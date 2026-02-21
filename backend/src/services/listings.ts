/**
 * Listings Service
 *
 * Connects API keys to XRPL NFTs:
 *   - createListing: encrypt API key → store in Supabase → mint NFT → create sell offer
 *   - purchaseListing: verify buyer accepted offer → record purchase → grant access
 *   - getAccessibleKey: verify NFT ownership on-chain → decrypt and return API key
 */

import { getSupabase } from "./supabase";
import { getXRPLService } from "./xrpl";
import { encrypt, decrypt } from "./encryption";

// ─── Types ───────────────────────────────────────────────

export interface CreateListingInput {
  sellerSeed: string;
  apiKey: string;
  title: string;
  description?: string;
  category?: string;
  apiProvider: string;
  baseUrl: string;
  priceXrp: number;
  totalSlots?: number;
}

export interface Listing {
  id: string;
  seller_wallet: string;
  title: string;
  description: string | null;
  category: string;
  api_provider: string;
  base_url: string;
  price_xrp: number;
  total_slots: number;
  remaining_slots: number;
  nft_token_id: string | null;
  sell_offer_id: string | null;
  status: string;
  created_at: string;
}

export interface PurchaseInput {
  buyerSeed: string;
  listingId: string;
  sellOfferId: string;
}

// ─── Service ─────────────────────────────────────────────

export class ListingsService {
  /**
   * Create a new API key listing:
   *   1. Encrypt the API key
   *   2. Store listing in Supabase
   *   3. Mint an NFT on XRPL
   *   4. Create a sell offer
   *   5. Update listing with XRPL references
   */
  async createListing(input: CreateListingInput) {
    const xrpl = getXRPLService();
    const supabase = getSupabase();

    const wallet = xrpl.walletFromSeed(input.sellerSeed);
    const encryptedKey = encrypt(input.apiKey);

    // 1. Insert listing in Supabase (without NFT refs yet)
    const { data: listing, error: insertError } = await supabase
      .from("listings")
      .insert({
        seller_wallet: wallet.classicAddress,
        title: input.title,
        description: input.description || null,
        category: input.category || "other",
        api_provider: input.apiProvider,
        encrypted_api_key: encryptedKey,
        base_url: input.baseUrl,
        price_xrp: input.priceXrp,
        total_slots: input.totalSlots || 1,
        remaining_slots: input.totalSlots || 1,
      })
      .select()
      .single();

    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

    // 2. Mint NFT with listing metadata in the URI
    const metadataUri = JSON.stringify({
      listingId: listing.id,
      title: input.title,
      category: input.category || "other",
      provider: input.apiProvider,
      priceXrp: input.priceXrp,
    });

    const mintResult = await xrpl.mintNFT(wallet, metadataUri);

    // 3. Create sell offer
    const offerResult = await xrpl.createSellOffer(
      wallet,
      mintResult.nfTokenId,
      input.priceXrp
    );

    // 4. Update listing with XRPL references
    const { error: updateError } = await supabase
      .from("listings")
      .update({
        nft_token_id: mintResult.nfTokenId,
        sell_offer_id: offerResult.offerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", listing.id);

    if (updateError) throw new Error(`DB update failed: ${updateError.message}`);

    return {
      listing: {
        id: listing.id,
        title: input.title,
        apiProvider: input.apiProvider,
        priceXrp: input.priceXrp,
        totalSlots: input.totalSlots || 1,
        status: "active",
      },
      xrpl: {
        sellerWallet: wallet.classicAddress,
        nfTokenId: mintResult.nfTokenId,
        mintTxHash: mintResult.txHash,
        sellOfferId: offerResult.offerId,
        sellOfferTxHash: offerResult.txHash,
      },
    };
  }

  /**
   * Record a purchase after buyer accepted a sell offer on XRPL:
   *   1. Verify buyer wallet owns the NFT on-chain
   *   2. Record purchase in Supabase
   *   3. Decrement remaining slots
   */
  async recordPurchase(input: PurchaseInput) {
    const xrpl = getXRPLService();
    const supabase = getSupabase();

    const buyerWallet = xrpl.walletFromSeed(input.buyerSeed);

    // 1. Get the listing
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("*")
      .eq("id", input.listingId)
      .single();

    if (listingError || !listing) {
      throw new Error("Listing not found");
    }

    if (!listing.nft_token_id) {
      throw new Error("Listing has no associated NFT");
    }

    // 2. Verify buyer owns the NFT on XRPL
    const ownsNFT = await xrpl.verifyOwnership(
      buyerWallet.classicAddress,
      listing.nft_token_id
    );

    if (!ownsNFT) {
      throw new Error(
        "Buyer does not own the NFT. Accept the sell offer first."
      );
    }

    // 3. Record purchase
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .insert({
        buyer_wallet: buyerWallet.classicAddress,
        listing_id: input.listingId,
        nft_token_id: listing.nft_token_id,
        sell_offer_id: input.sellOfferId,
      })
      .select()
      .single();

    if (purchaseError) {
      if (purchaseError.code === "23505") {
        throw new Error("You already purchased this listing");
      }
      throw new Error(`Purchase failed: ${purchaseError.message}`);
    }

    // 4. Decrement remaining slots
    const newRemaining = listing.remaining_slots - 1;
    const updates: Record<string, any> = {
      remaining_slots: newRemaining,
      updated_at: new Date().toISOString(),
    };
    if (newRemaining <= 0) updates.status = "sold_out";

    await supabase.from("listings").update(updates).eq("id", listing.id);

    return {
      purchaseId: purchase.id,
      buyer: buyerWallet.classicAddress,
      listingId: listing.id,
      nfTokenId: listing.nft_token_id,
      title: listing.title,
      apiProvider: listing.api_provider,
    };
  }

  /**
   * Get decrypted API key for a buyer who owns the NFT.
   * This is what the proxy service would call.
   */
  async getAccessibleKey(
    buyerWallet: string,
    listingId: string
  ): Promise<{ apiKey: string; baseUrl: string }> {
    const xrpl = getXRPLService();
    const supabase = getSupabase();

    // 1. Get the listing
    const { data: listing, error } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listingId)
      .single();

    if (error || !listing) throw new Error("Listing not found");
    if (!listing.nft_token_id) throw new Error("No NFT associated");

    // 2. Verify ownership on-chain
    const owns = await xrpl.verifyOwnership(buyerWallet, listing.nft_token_id);
    if (!owns) {
      throw new Error("You do not own the access NFT for this listing");
    }

    // 3. Verify purchase exists in DB
    const { data: purchase } = await supabase
      .from("purchases")
      .select("id, is_active")
      .eq("buyer_wallet", buyerWallet)
      .eq("listing_id", listingId)
      .single();

    if (!purchase || !purchase.is_active) {
      throw new Error("No active purchase found");
    }

    // 4. Decrypt and return
    const apiKey = decrypt(listing.encrypted_api_key);

    return {
      apiKey,
      baseUrl: listing.base_url,
    };
  }

  /**
   * Get all active listings (public, no sensitive data)
   */
  async getListings(category?: string) {
    const supabase = getSupabase();

    let query = supabase
      .from("listings")
      .select(
        "id, seller_wallet, title, description, category, api_provider, base_url, price_xrp, total_slots, remaining_slots, nft_token_id, sell_offer_id, status, created_at"
      )
      .in("status", ["active", "sold_out"])
      .order("created_at", { ascending: false });

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch listings: ${error.message}`);
    return data || [];
  }

  /**
   * Get a single listing by ID
   */
  async getListing(id: string) {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("listings")
      .select(
        "id, seller_wallet, title, description, category, api_provider, base_url, price_xrp, total_slots, remaining_slots, nft_token_id, sell_offer_id, status, created_at"
      )
      .eq("id", id)
      .single();

    if (error || !data) throw new Error("Listing not found");
    return data;
  }

  /**
   * Get all purchases for a buyer
   */
  async getBuyerPurchases(buyerWallet: string) {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("purchases")
      .select(`
        id, buyer_wallet, listing_id, nft_token_id, is_active, created_at,
        listing:listings!listing_id (
          title, api_provider, base_url, category, price_xrp
        )
      `)
      .eq("buyer_wallet", buyerWallet)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch purchases: ${error.message}`);
    return data || [];
  }
}

// Singleton
let instance: ListingsService | null = null;
export function getListingsService(): ListingsService {
  if (!instance) {
    instance = new ListingsService();
  }
  return instance;
}
