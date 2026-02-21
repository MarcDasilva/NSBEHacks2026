/**
 * Listings API Routes
 *
 * POST   /api/listings                — Create listing (encrypt key + mint NFT + sell offer)
 * GET    /api/listings                — Browse all listings
 * GET    /api/listings/:id            — Get single listing
 * POST   /api/listings/purchase       — Record purchase (after buyer accepted offer on XRPL)
 * GET    /api/listings/purchases/:wallet — Get buyer's purchases
 * POST   /api/listings/access         — Get decrypted API key (verify NFT ownership first)
 */

import { Router, Request, Response } from "express";
import { getListingsService } from "../services/listings";

const router = Router();

// ── Create Listing ────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      sellerSeed,
      apiKey,
      title,
      description,
      category,
      apiProvider,
      baseUrl,
      priceXrp,
      totalSlots,
    } = req.body;

    if (!sellerSeed || !apiKey || !title || !apiProvider || !baseUrl || priceXrp === undefined) {
      res.status(400).json({
        error:
          "Missing required fields: sellerSeed, apiKey, title, apiProvider, baseUrl, priceXrp",
      });
      return;
    }

    const service = getListingsService();
    const result = await service.createListing({
      sellerSeed,
      apiKey,
      title,
      description,
      category,
      apiProvider,
      baseUrl,
      priceXrp,
      totalSlots,
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error creating listing:", error.message);
    res.status(500).json({ error: error.message || "Failed to create listing" });
  }
});

// ── Browse Listings ───────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const service = getListingsService();
    const listings = await service.getListings(category);

    res.json({ listings, count: listings.length });
  } catch (error: any) {
    console.error("Error fetching listings:", error.message);
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

// ── Get Single Listing ───────────────────────────────

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const service = getListingsService();
    const listing = await service.getListing(id);

    res.json(listing);
  } catch (error: any) {
    console.error("Error fetching listing:", error.message);
    res.status(404).json({ error: error.message || "Listing not found" });
  }
});

// ── Record Purchase ──────────────────────────────────
// Call this AFTER the buyer has accepted the sell offer on XRPL.
// It verifies NFT ownership on-chain before recording.

router.post("/purchase", async (req: Request, res: Response) => {
  try {
    const { buyerSeed, listingId, sellOfferId } = req.body;

    if (!buyerSeed || !listingId || !sellOfferId) {
      res.status(400).json({
        error: "Missing required fields: buyerSeed, listingId, sellOfferId",
      });
      return;
    }

    const service = getListingsService();
    const result = await service.recordPurchase({
      buyerSeed,
      listingId,
      sellOfferId,
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error recording purchase:", error.message);
    res.status(400).json({
      error: error.message || "Failed to record purchase",
    });
  }
});

// ── Get Buyer's Purchases ────────────────────────────

router.get("/purchases/:wallet", async (req: Request, res: Response) => {
  try {
    const wallet = req.params.wallet as string;
    const service = getListingsService();
    const purchases = await service.getBuyerPurchases(wallet);

    res.json({ purchases, count: purchases.length });
  } catch (error: any) {
    console.error("Error fetching purchases:", error.message);
    res.status(500).json({ error: "Failed to fetch purchases" });
  }
});

// ── Get API Key Access ───────────────────────────────
// Verifies NFT ownership on XRPL, then returns decrypted key.
// This is what the proxy would call internally.

router.post("/access", async (req: Request, res: Response) => {
  try {
    const { buyerWallet, listingId } = req.body;

    if (!buyerWallet || !listingId) {
      res.status(400).json({
        error: "Missing required fields: buyerWallet, listingId",
      });
      return;
    }

    const service = getListingsService();
    const result = await service.getAccessibleKey(buyerWallet, listingId);

    res.json(result);
  } catch (error: any) {
    console.error("Error getting API key access:", error.message);
    res.status(403).json({
      error: error.message || "Access denied",
    });
  }
});

export default router;
