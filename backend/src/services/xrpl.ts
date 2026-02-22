/**
 * XRPL Service — reusable module for all XRPL interactions
 *
 * Provides:
 *   - Connection management (singleton client)
 *   - Wallet creation / restoration
 *   - NFT minting
 *   - Sell offer creation
 *   - Buy (accept sell offer)
 *   - Browse sell offers for an NFT
 *   - Verify NFT ownership
 *   - Get account NFTs
 */

import * as xrpl from "xrpl";

// ─── Types ───────────────────────────────────────────────

export interface MintResult {
  nfTokenId: string;
  txHash: string;
  wallet: {
    address: string;
    seed: string;
  };
}

export interface SellOfferResult {
  offerId: string;
  nfTokenId: string;
  priceDrops: string;
  priceXrp: string;
  txHash: string;
}

export interface BuyResult {
  txHash: string;
  nfTokenId: string;
  offerId: string;
  buyer: string;
  seller: string;
  priceXrp: string;
  balanceBefore: string;
  balanceAfter: string;
}

export interface SellOffer {
  offerId: string;
  owner: string;
  amount: string; // XRP price
  amountDrops: string;
  nfTokenId: string;
  destination?: string;
  expiration?: number;
}

export interface OwnedNFT {
  nfTokenId: string;
  issuer: string;
  uri: string | null;
  taxon: number;
  flags: number;
  transferFee: number;
  serial: number;
}

// ─── Helpers ─────────────────────────────────────────────

function dropsToXrp(drops: string): string {
  return (parseInt(drops, 10) / 1_000_000).toFixed(6);
}

function xrpToDrops(xrpAmount: number): string {
  return (xrpAmount * 1_000_000).toString();
}

function extractNFTokenID(meta: any): string | null {
  const affectedNodes = meta.AffectedNodes;
  if (!affectedNodes) return null;

  for (const node of affectedNodes) {
    const created = node.CreatedNode;
    const modified = node.ModifiedNode;

    const pageData =
      created?.NewFields?.NFTokens ||
      modified?.FinalFields?.NFTokens;

    const prevTokens = modified?.PreviousFields?.NFTokens || [];

    if (pageData) {
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

function extractOfferID(meta: any): string | null {
  for (const node of meta.AffectedNodes) {
    if (
      node.CreatedNode &&
      node.CreatedNode.LedgerEntryType === "NFTokenOffer"
    ) {
      return node.CreatedNode.LedgerIndex;
    }
  }
  return null;
}

// ─── XRPL Service Class ─────────────────────────────────

export class XRPLService {
  private client: xrpl.Client;
  private networkUrl: string;
  private connected = false;

  constructor(networkUrl?: string) {
    this.networkUrl =
      networkUrl || process.env.XRPL_NETWORK || "wss://s.altnet.rippletest.net:51233";
    this.client = new xrpl.Client(this.networkUrl);
  }

  // ── Connection ──────────────────────────────────────

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Wallet ──────────────────────────────────────────

  /**
   * Create a new wallet funded by the testnet faucet.
   */
  async createTestWallet(): Promise<xrpl.Wallet> {
    await this.connect();
    const result = await this.client.fundWallet();
    return result.wallet;
  }

  /**
   * Restore a wallet from a seed.
   */
  walletFromSeed(seed: string): xrpl.Wallet {
    return xrpl.Wallet.fromSeed(seed);
  }

  /**
   * Get XRP balance for an address.
   */
  async getBalance(address: string): Promise<string> {
    await this.connect();
    const balance = await this.client.getXrpBalance(address);
    return balance.toString();
  }

  /**
   * Issue tokens (e.g. GGK) from issuer to recipient. Uses shared connection.
   */
  async issueTokensToAddress(
    issuerSecret: string,
    recipientAddress: string,
    amount: number,
    currency: string = process.env.TOKEN_CURRENCY || "GGK",
    issuerAddress: string = process.env.ISSUER_ADDRESS || ""
  ): Promise<{ txHash: string }> {
    await this.connect();
    const issuerWallet = xrpl.Wallet.fromSeed(issuerSecret);
    const paymentTx: xrpl.Payment = {
      TransactionType: "Payment",
      Account: issuerWallet.address,
      Destination: recipientAddress,
      Amount: {
        currency,
        value: amount.toString(),
        issuer: issuerAddress,
      },
    };
    const result = await this.client.submitAndWait(paymentTx, { wallet: issuerWallet });
    const meta = result.result.meta as xrpl.TransactionMetadata;
    if (typeof meta === "object" && meta.TransactionResult !== "tesSUCCESS") {
      throw new Error(String(meta.TransactionResult));
    }
    return { txHash: result.result.hash };
  }

  // ── Mint NFT ────────────────────────────────────────

  /**
   * Mint an NFToken on the XRPL.
   *
   * @param wallet       - The minting wallet
   * @param metadataUri  - URI string to encode in the NFT (e.g. listing metadata JSON or URL)
   * @param transferFee  - Resale royalty (0-50000, where 1000 = 1%). Default 500 (0.5%)
   * @param taxon        - Grouping identifier. Default 0
   * @param flags        - NFTokenMint flags. Default: tfTransferable (8)
   */
  async mintNFT(
    wallet: xrpl.Wallet,
    metadataUri: string,
    transferFee: number = 500,
    taxon: number = 0,
    flags: number = xrpl.NFTokenMintFlags.tfTransferable
  ): Promise<MintResult> {
    await this.connect();

    const mintTx: xrpl.NFTokenMint = {
      TransactionType: "NFTokenMint",
      Account: wallet.classicAddress,
      URI: xrpl.convertStringToHex(metadataUri),
      Flags: flags,
      TransferFee: transferFee,
      NFTokenTaxon: taxon,
    };

    const result = await this.client.submitAndWait(mintTx, { wallet });
    const meta = result.result.meta as any;

    if (meta.TransactionResult !== "tesSUCCESS") {
      throw new Error(`Mint failed: ${meta.TransactionResult}`);
    }

    const nfTokenId = extractNFTokenID(meta);
    if (!nfTokenId) {
      throw new Error("Could not extract NFTokenID from transaction metadata");
    }

    return {
      nfTokenId,
      txHash: result.result.hash,
      wallet: {
        address: wallet.classicAddress,
        seed: wallet.seed!,
      },
    };
  }

  // ── Sell Offer ──────────────────────────────────────

  /**
   * Create a sell offer for an NFT.
   *
   * @param wallet      - The NFT owner's wallet
   * @param nfTokenId   - The NFTokenID to sell
   * @param priceXrp    - Price in XRP
   * @param destination - (Optional) Only this account can accept the offer
   */
  async createSellOffer(
    wallet: xrpl.Wallet,
    nfTokenId: string,
    priceXrp: number,
    destination?: string
  ): Promise<SellOfferResult> {
    await this.connect();

    const sellTx: xrpl.NFTokenCreateOffer = {
      TransactionType: "NFTokenCreateOffer",
      Account: wallet.classicAddress,
      NFTokenID: nfTokenId,
      Amount: xrpToDrops(priceXrp),
      Flags: xrpl.NFTokenCreateOfferFlags.tfSellNFToken,
    };

    if (destination) {
      sellTx.Destination = destination;
    }

    const result = await this.client.submitAndWait(sellTx, { wallet });
    const meta = result.result.meta as any;

    if (meta.TransactionResult !== "tesSUCCESS") {
      throw new Error(`Sell offer failed: ${meta.TransactionResult}`);
    }

    const offerId = extractOfferID(meta);
    if (!offerId) {
      throw new Error("Could not extract offer ID from transaction metadata");
    }

    return {
      offerId,
      nfTokenId,
      priceDrops: xrpToDrops(priceXrp),
      priceXrp: priceXrp.toString(),
      txHash: result.result.hash,
    };
  }

  // ── Buy (Accept Sell Offer) ─────────────────────────

  /**
   * Accept a sell offer — transfers XRP to seller, NFT to buyer.
   *
   * @param buyerWallet  - The buyer's wallet
   * @param sellOfferId  - The sell offer ID to accept
   */
  async acceptSellOffer(
    buyerWallet: xrpl.Wallet,
    sellOfferId: string
  ): Promise<BuyResult> {
    await this.connect();

    const balanceBefore = await this.getBalance(buyerWallet.classicAddress);

    const acceptTx: xrpl.NFTokenAcceptOffer = {
      TransactionType: "NFTokenAcceptOffer",
      Account: buyerWallet.classicAddress,
      NFTokenSellOffer: sellOfferId,
    };

    const result = await this.client.submitAndWait(acceptTx, {
      wallet: buyerWallet,
    });

    const meta = result.result.meta as any;
    if (meta.TransactionResult !== "tesSUCCESS") {
      throw new Error(`Accept offer failed: ${meta.TransactionResult}`);
    }

    const balanceAfter = await this.getBalance(buyerWallet.classicAddress);

    // Extract seller and NFTokenID from balance changes and affected nodes
    const balanceChanges = xrpl.getBalanceChanges(meta);
    let seller = "";
    for (const change of balanceChanges) {
      if (change.account !== buyerWallet.classicAddress) {
        seller = change.account;
        break;
      }
    }

    // Find the NFTokenID from the buyer's account
    const buyerNfts = await this.getAccountNFTs(buyerWallet.classicAddress);
    const nfTokenId = buyerNfts.length > 0
      ? buyerNfts[buyerNfts.length - 1].nfTokenId
      : "";

    return {
      txHash: result.result.hash,
      nfTokenId,
      offerId: sellOfferId,
      buyer: buyerWallet.classicAddress,
      seller,
      priceXrp: (parseFloat(balanceBefore) - parseFloat(balanceAfter)).toFixed(6),
      balanceBefore,
      balanceAfter,
    };
  }

  // ── Browse Sell Offers ──────────────────────────────

  /**
   * Get all sell offers for a specific NFT.
   *
   * @param nfTokenId     - The NFTokenID to look up offers for
   * @param sellerFilter  - (Optional) Filter by seller address
   */
  async getSellOffers(
    nfTokenId: string,
    sellerFilter?: string
  ): Promise<SellOffer[]> {
    await this.connect();

    try {
      const response = await this.client.request({
        command: "nft_sell_offers",
        nft_id: nfTokenId,
      });

      let offers = response.result.offers || [];

      if (sellerFilter) {
        offers = offers.filter((o) => o.owner === sellerFilter);
      }

      return offers.map((o) => ({
        offerId: o.nft_offer_index,
        owner: o.owner,
        amountDrops:
          typeof o.amount === "string" ? o.amount : o.amount.value,
        amount:
          typeof o.amount === "string"
            ? dropsToXrp(o.amount)
            : `${o.amount.value} ${o.amount.currency}`,
        nfTokenId,
        destination: o.destination,
        expiration: o.expiration,
      }));
    } catch (error: any) {
      if (error?.data?.error === "object_not_found") {
        return []; // No offers exist
      }
      throw error;
    }
  }

  // ── Verify NFT Ownership ───────────────────────────

  /**
   * Check if a specific account owns a specific NFT.
   *
   * @param address    - The wallet address to check
   * @param nfTokenId  - The NFTokenID to look for
   */
  async verifyOwnership(
    address: string,
    nfTokenId: string
  ): Promise<boolean> {
    const nfts = await this.getAccountNFTs(address);
    return nfts.some((nft) => nft.nfTokenId === nfTokenId);
  }

  // ── Get Account NFTs ───────────────────────────────

  /**
   * Get all NFTs owned by an account.
   */
  async getAccountNFTs(address: string): Promise<OwnedNFT[]> {
    await this.connect();

    const response = await this.client.request({
      command: "account_nfts",
      account: address,
    });

    return response.result.account_nfts.map((nft: any) => ({
      nfTokenId: nft.NFTokenID,
      issuer: nft.Issuer,
      uri: nft.URI
        ? Buffer.from(nft.URI, "hex").toString("utf-8")
        : null,
      taxon: nft.NFTokenTaxon,
      flags: nft.Flags,
      transferFee: nft.TransferFee ?? 0,
      serial: nft.nft_serial,
    }));
  }

  // ── Mint + Sell (Combined) ─────────────────────────

  /**
   * Convenience: mint an NFT and immediately create a sell offer.
   */
  async mintAndSell(
    wallet: xrpl.Wallet,
    metadataUri: string,
    priceXrp: number,
    transferFee: number = 500,
    destination?: string
  ): Promise<{ mint: MintResult; offer: SellOfferResult }> {
    const mint = await this.mintNFT(wallet, metadataUri, transferFee);
    const offer = await this.createSellOffer(
      wallet,
      mint.nfTokenId,
      priceXrp,
      destination
    );
    return { mint, offer };
  }
}

// ── Singleton ────────────────────────────────────────────

let instance: XRPLService | null = null;

export function getXRPLService(): XRPLService {
  if (!instance) {
    instance = new XRPLService();
  }
  return instance;
}

export default XRPLService;
