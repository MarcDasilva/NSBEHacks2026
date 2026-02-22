/**
 * XRPL API Routes
 *
 * POST   /api/xrpl/wallet              — Create a new testnet wallet
 * GET    /api/xrpl/wallet/:address      — Get wallet balance & NFTs
 * POST   /api/xrpl/mint                 — Mint an NFT
 * POST   /api/xrpl/sell-offer           — Create a sell offer for an NFT
 * POST   /api/xrpl/mint-and-sell        — Mint + create sell offer in one call
 * GET    /api/xrpl/offers/:nfTokenId    — Browse sell offers for an NFT
 * POST   /api/xrpl/buy                  — Accept a sell offer (buy NFT)
 * GET    /api/xrpl/verify/:address/:nfTokenId — Verify NFT ownership
 */

import { Router, Request, Response } from "express";
import * as xrpl from "xrpl";
import { getXRPLService } from "../services/xrpl";

const router = Router();

// Token configuration from environment
const TOKEN_CURRENCY = process.env.TOKEN_CURRENCY || "GGK";
const ISSUER_ADDRESS = process.env.ISSUER_ADDRESS || "rUpuaJVFUFhw9Dy7X7SwJgw19PpG7BJ1kE";
const ISSUER_SECRET = process.env.ISSUER_SECRET || "sEd7uaitboDrh9pkCwBT2TECr3r5ftC";

// ── Create Testnet Wallet ─────────────────────────────

router.post("/wallet", async (_req: Request, res: Response) => {
  try {
    const service = getXRPLService();
    const wallet = await service.createTestWallet();
    const balance = await service.getBalance(wallet.classicAddress);

    res.status(201).json({
      address: wallet.classicAddress,
      seed: wallet.seed,
      balance,
    });
  } catch (error: any) {
    console.error("Error creating wallet:", error.message);
    res.status(500).json({ error: "Failed to create wallet" });
  }
});

// ── Get Wallet Info ───────────────────────────────────

router.get("/wallet/:address", async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;
    const service = getXRPLService();

    const balancePromise = service.getBalance(address);
    const nftsPromise = service.getAccountNFTs(address);
    const balance = await balancePromise;
    const nfts = await nftsPromise;

    res.json({ address, balance, nfts, nftCount: nfts.length });
  } catch (error: any) {
    if (error?.data?.error === "actNotFound") {
      res.status(404).json({ error: "Account not found on XRPL" });
      return;
    }
    console.error("Error fetching wallet:", error.message);
    res.status(500).json({ error: "Failed to fetch wallet info" });
  }
});

// ── Issue Tokens to Address ────────────────────────────
// This endpoint issues GGK tokens from the issuer to a recipient
// Used when a seller wants to list tokens for sale

router.post("/issue-tokens", async (req: Request, res: Response) => {
  try {
    const { recipientAddress, amount, currency, issuerAddress } = req.body;

    if (!recipientAddress || !amount) {
      res.status(400).json({
        error: "Missing required fields: recipientAddress, amount",
      });
      return;
    }

    if (!ISSUER_SECRET) {
      res.status(500).json({
        error: "Issuer secret not configured",
      });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({
        error: "Amount must be a positive number",
      });
      return;
    }

    // Use request currency/issuer so sell flow can issue the token being sold (e.g. OAK, ATK)
    const tokenCurrency = typeof currency === "string" && currency.trim() ? currency.trim() : TOKEN_CURRENCY;
    const tokenIssuer = typeof issuerAddress === "string" && issuerAddress.trim() ? issuerAddress.trim() : ISSUER_ADDRESS;

    const service = getXRPLService();
    const { txHash } = await service.issueTokensToAddress(
      ISSUER_SECRET,
      recipientAddress,
      parsedAmount,
      tokenCurrency,
      tokenIssuer
    );

    res.status(200).json({
      success: true,
      txHash,
      amount: parsedAmount,
      currency: tokenCurrency,
      recipient: recipientAddress,
    });
  } catch (error: any) {
    console.error("Error issuing tokens:", error?.message || error);
    const errorResult = error?.message || "Unknown error";
    if (errorResult === "tecPATH_DRY") {
      res.status(400).json({
        error: "Recipient needs to set up a trust line for this token first",
        code: errorResult,
      });
      return;
    }
    res.status(500).json({ error: error?.message || "Failed to issue tokens" });
  }
});

// ── Mint NFT ──────────────────────────────────────────

router.post("/mint", async (req: Request, res: Response) => {
  try {
    const { seed, metadataUri, transferFee, taxon } = req.body;

    if (!seed || !metadataUri) {
      res.status(400).json({
        error: "Missing required fields: seed, metadataUri",
      });
      return;
    }

    const service = getXRPLService();
    const wallet = service.walletFromSeed(seed);

    const result = await service.mintNFT(
      wallet,
      typeof metadataUri === "string"
        ? metadataUri
        : JSON.stringify(metadataUri),
      transferFee ?? 500,
      taxon ?? 0
    );

    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error minting NFT:", error.message);
    res.status(500).json({ error: error.message || "Failed to mint NFT" });
  }
});

// ── Create Sell Offer ─────────────────────────────────

router.post("/sell-offer", async (req: Request, res: Response) => {
  try {
    const { seed, nfTokenId, priceXrp, destination } = req.body;

    if (!seed || !nfTokenId || priceXrp === undefined) {
      res.status(400).json({
        error: "Missing required fields: seed, nfTokenId, priceXrp",
      });
      return;
    }

    const service = getXRPLService();
    const wallet = service.walletFromSeed(seed);

    const result = await service.createSellOffer(
      wallet,
      nfTokenId,
      priceXrp,
      destination
    );

    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error creating sell offer:", error.message);
    res.status(500).json({
      error: error.message || "Failed to create sell offer",
    });
  }
});

// ── Mint + Sell (Combined) ────────────────────────────

router.post("/mint-and-sell", async (req: Request, res: Response) => {
  try {
    const { seed, metadataUri, priceXrp, transferFee, destination } = req.body;

    if (!seed || !metadataUri || priceXrp === undefined) {
      res.status(400).json({
        error: "Missing required fields: seed, metadataUri, priceXrp",
      });
      return;
    }

    const service = getXRPLService();
    const wallet = service.walletFromSeed(seed);

    const result = await service.mintAndSell(
      wallet,
      typeof metadataUri === "string"
        ? metadataUri
        : JSON.stringify(metadataUri),
      priceXrp,
      transferFee ?? 500,
      destination
    );

    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error mint-and-sell:", error.message);
    res.status(500).json({
      error: error.message || "Failed to mint and sell",
    });
  }
});

// ── Browse Sell Offers ────────────────────────────────

router.get("/offers/:nfTokenId", async (req: Request, res: Response) => {
  try {
    const nfTokenId = req.params.nfTokenId as string;
    const seller = req.query.seller as string | undefined;

    const service = getXRPLService();
    const offers = await service.getSellOffers(nfTokenId, seller);

    res.json({ nfTokenId, offers, count: offers.length });
  } catch (error: any) {
    console.error("Error fetching offers:", error.message);
    res.status(500).json({ error: "Failed to fetch sell offers" });
  }
});

// ── Buy (Accept Sell Offer) ───────────────────────────

router.post("/buy", async (req: Request, res: Response) => {
  try {
    const { seed, sellOfferId } = req.body;

    if (!seed || !sellOfferId) {
      res.status(400).json({
        error: "Missing required fields: seed, sellOfferId",
      });
      return;
    }

    const service = getXRPLService();
    const wallet = service.walletFromSeed(seed);

    const result = await service.acceptSellOffer(wallet, sellOfferId);

    res.status(200).json(result);
  } catch (error: any) {
    if (error?.data?.error === "object_not_found") {
      res.status(404).json({
        error: "Sell offer not found. It may have been accepted or cancelled.",
      });
      return;
    }
    console.error("Error buying NFT:", error.message);
    res.status(500).json({ error: error.message || "Failed to buy NFT" });
  }
});

// ── Verify Ownership ─────────────────────────────────

router.get(
  "/verify/:address/:nfTokenId",
  async (req: Request, res: Response) => {
    try {
      const address = req.params.address as string;
      const nfTokenId = req.params.nfTokenId as string;

      const service = getXRPLService();
      const ownsNFT = await service.verifyOwnership(address, nfTokenId);

      res.json({ address, nfTokenId, ownsNFT });
    } catch (error: any) {
      if (error?.data?.error === "actNotFound") {
        res.json({ address: req.params.address, nfTokenId: req.params.nfTokenId, ownsNFT: false });
        return;
      }
      console.error("Error verifying ownership:", error.message);
      res.status(500).json({ error: "Failed to verify ownership" });
    }
  }
);

export default router;
