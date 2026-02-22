"use client";

import { useState, useEffect } from "react";
import * as xrpl from "xrpl";
import { getSupabase } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  recordBurnOnEVM,
  tokenAmountToWei,
  type RecordBurnOnEVMResult,
} from "@/lib/evm-burn-registry";
import {
  getTokenConfig,
  XRPL_SERVER,
  type TokenConfig,
} from "@/lib/token-config";

/** Map XRPL transaction result codes to user-friendly messages. */
function formatTransactionError(code: string): string {
  switch (code) {
    case "tecKILLED":
      return "Order could not be filled (not enough liquidity or the best offer was taken). Try a smaller quantity or try again.";
    case "tecPATH_DRY":
      return "No liquidity path for this trade. The order book may be empty or the price moved.";
    case "tecUNFUNDED_OFFER":
      return "Insufficient XRP balance to place this order. You need enough XRP to cover the order plus the ledger reserve (~10–12 XRP).";
    case "tecUNFUNDED":
    case "tecINSUFFICIENT_FUNDS":
      return "Insufficient XRP balance (including reserve).";
    case "tecNO_LINE":
      return "Trust line is required; setup may have failed. Try again.";
    default:
      return `Transaction failed: ${code}`;
  }
}

interface BuyOrderDialogProps {
  trigger?: React.ReactNode;
  /** When provided, dialog is controlled by parent (no trigger shown). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Token to buy (from graph/API context). Defaults to GGK when omitted. */
  tokenConfig?: TokenConfig;
}

interface FormErrors {
  quantity?: string;
  wallet?: string;
  secret?: string;
  general?: string;
}

interface SellOffer {
  offerId: string;
  account: string;
  quantity: number;
  pricePerUnit: number;
  totalXrp: number;
  takerGetsValue: string;
  takerPaysDrops: string;
}

/**
 * Generates a random proxy API key
 */
function generateProxyKey(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "pk_";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Fetches the best sell offers from the XRPL order book.
 */
async function fetchBestSellOffers(
  client: xrpl.Client,
  tokenConfig: TokenConfig,
  excludeAccount?: string,
): Promise<SellOffer[]> {
  // Query for sell offers: taker gets tokens and pays XRP
  const response = await client.request({
    command: "book_offers",
    taker_gets: {
      currency: tokenConfig.currency,
      issuer: tokenConfig.issuer,
    },
    taker_pays: { currency: "XRP" },
    limit: 50,
  });

  const offers = response.result.offers || [];

  return offers
    .map((offer) => {
      // For sell offers: TakerGets is GGK (object), TakerPays is XRP (string, drops)
      const tokenAmount =
        typeof offer.TakerGets === "object" && "value" in offer.TakerGets
          ? parseFloat(offer.TakerGets.value)
          : 0;
      const xrpDrops =
        typeof offer.TakerPays === "string" ? offer.TakerPays : "0";
      const xrpAmount = parseFloat(xrpDrops) / 1_000_000;

      if (tokenAmount <= 0 || xrpAmount <= 0) return null;

      const takerGetsValue =
        typeof offer.TakerGets === "object" && "value" in offer.TakerGets
          ? String(offer.TakerGets.value)
          : String(tokenAmount);
      return {
        offerId: offer.index || "",
        account: offer.Account,
        quantity: tokenAmount,
        pricePerUnit: xrpAmount / tokenAmount,
        totalXrp: xrpAmount,
        takerGetsValue,
        takerPaysDrops: xrpDrops,
      };
    })
    .filter((o): o is SellOffer => o !== null)
    .filter((o) => !excludeAccount || o.account !== excludeAccount)
    .sort((a, b) => a.pricePerUnit - b.pricePerUnit);
}

/**
 * Compute XRP cost to fill `requestedQty` by walking best offers first (XRPL order book fill).
 * Returns total XRP cost and the quantity we can fill; if filledQty < requestedQty, not enough liquidity.
 */
function computeFillAcrossOffers(
  offers: SellOffer[],
  requestedQty: number,
): { totalXrpCost: number; filledQty: number } {
  let remaining = requestedQty;
  let totalXrpCost = 0;
  for (const o of offers) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, o.quantity);
    totalXrpCost += take * o.pricePerUnit;
    remaining -= take;
  }
  const filledQty = requestedQty - remaining;
  return { totalXrpCost, filledQty };
}

/**
 * Get the token balance for an account on a specific trust line.
 */
async function getTokenBalance(
  client: xrpl.Client,
  account: string,
  tokenConfig: TokenConfig,
): Promise<number> {
  try {
    const response = await client.request({
      command: "account_lines",
      account,
      peer: tokenConfig.issuer,
    });
    const line = response.result.lines.find(
      (l) => l.currency === tokenConfig.currency,
    );
    return line ? parseFloat(line.balance) : 0;
  } catch {
    return 0;
  }
}

/**
 * Weighted average of sell offers: XRP per token.
 */
async function calculateWeightedAveragePrice(
  client: xrpl.Client,
  tokenConfig: TokenConfig,
): Promise<number | null> {
  try {
    // Query sell side: taker gets tokens, taker pays XRP
    const response = await client.request({
      command: "book_offers",
      taker_gets: {
        currency: tokenConfig.currency,
        issuer: tokenConfig.issuer,
      },
      taker_pays: { currency: "XRP" },
      limit: 100,
    });
    const offers = response.result.offers;
    if (!offers || offers.length === 0) return null;
    let totalWeightedPrice = 0;
    let totalQuantity = 0;
    for (const offer of offers) {
      const tokenAmount =
        typeof offer.TakerGets === "object" && "value" in offer.TakerGets
          ? parseFloat(offer.TakerGets.value)
          : 0;
      const xrpDrops =
        typeof offer.TakerPays === "string" ? parseFloat(offer.TakerPays) : 0;
      const xrpAmount = xrpDrops / 1_000_000;
      if (tokenAmount > 0 && xrpAmount > 0) {
        const pricePerUnit = xrpAmount / tokenAmount;
        totalWeightedPrice += pricePerUnit * tokenAmount;
        totalQuantity += tokenAmount;
      }
    }
    return totalQuantity === 0 ? null : totalWeightedPrice / totalQuantity;
  } catch (error) {
    console.error("Error calculating weighted average price:", error);
    return null;
  }
}

export type BuyOrderResult = {
  hash: string;
  proxyKey: string;
  tokensReceived: number;
  xrpPaid: number;
  /** XRPL L1 burn tx hash (Payment to issuer) for on-chain registry (EVM). */
  burnHash: string;
};

/**
 * Execute a buy order using the given quantity and wallet secret.
 * Supports partial fills — buys whatever is available on the order book.
 * Sets trust line, creates ImmediateOrCancel offer, burns received tokens,
 * stores proxy key and balance.
 */
export async function executeBuyOrder(
  quantity: string,
  secret: string,
  walletId?: string,
  tokenConfig?: TokenConfig,
): Promise<BuyOrderResult> {
  const cfg = tokenConfig ?? getTokenConfig(null);
  const qty = parseFloat(quantity);
  if (!quantity || isNaN(qty) || qty <= 0) {
    throw new Error("Please enter a valid quantity greater than 0");
  }
  if (!secret || secret.trim().length < 20) {
    throw new Error("Please enter a valid wallet secret");
  }

  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase client not available");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  let wallet: xrpl.Wallet;
  try {
    wallet = xrpl.Wallet.fromSeed(secret.trim());
  } catch {
    throw new Error("Invalid wallet secret");
  }

  const client = new xrpl.Client(XRPL_SERVER);
  await client.connect();
  try {
    const offers = await fetchBestSellOffers(client, cfg, wallet.address);
    if (offers.length === 0) throw new Error("No sell offers available on the order book (your own offers are excluded). A different account must place a sell order first.");

    // Compute cost for whatever is available (partial fill OK)
    const { totalXrpCost, filledQty } = computeFillAcrossOffers(offers, qty);
    const buyQty = filledQty; // actual quantity we can buy
    const buyQtyStr = String(buyQty);

    // XRPL requires balance >= offer amount + base reserve (~10 XRP)
    const BASE_RESERVE_XRP = 10;
    const OWNER_RESERVE_XRP = 2;
    const minXrpRequired = totalXrpCost + BASE_RESERVE_XRP + OWNER_RESERVE_XRP;
    const balanceXrp = await client.getXrpBalance(wallet.address);
    const balanceNum = Number(balanceXrp);
    if (isNaN(balanceNum) || balanceNum < minXrpRequired) {
      throw new Error(
        `Insufficient XRP balance. This order needs ~${minXrpRequired.toFixed(1)} XRP (${totalXrpCost.toFixed(4)} for the order + reserve). Your balance: ${balanceNum.toFixed(2)} XRP.`,
      );
    }

    // Set up trust line
    const trustSetTx: xrpl.TrustSet = {
      TransactionType: "TrustSet",
      Account: wallet.address,
      LimitAmount: {
        currency: cfg.currency,
        issuer: cfg.issuer,
        value: "1000000000",
      },
    };
    const preparedTrust = await client.autofill(trustSetTx);
    const signedTrust = wallet.sign(preparedTrust);
    const trustResult = await client.submitAndWait(signedTrust.tx_blob);
    const trustMeta = trustResult.result.meta as xrpl.TransactionMetadata;
    if (
      typeof trustMeta === "object" &&
      trustMeta.TransactionResult !== "tesSUCCESS" &&
      trustMeta.TransactionResult !== "tecDUPLICATE"
    ) {
      throw new Error(
        `Failed to set up trust line: ${trustMeta.TransactionResult}`,
      );
    }

    // Record token balance before the offer so we can determine actual fill
    const balanceBefore = await getTokenBalance(client, wallet.address, cfg);

    // Create ImmediateOrCancel offer — fills as much as possible
    const totalDrops = Math.ceil(totalXrpCost * 1_000_000).toString();
    const offerCreateTx: xrpl.OfferCreate = {
      TransactionType: "OfferCreate",
      Account: wallet.address,
      TakerGets: totalDrops,
      TakerPays: {
        currency: cfg.currency,
        value: buyQtyStr,
        issuer: cfg.issuer,
      },
      Flags: xrpl.OfferCreateFlags.tfImmediateOrCancel,
    };
    const prepared = await client.autofill(offerCreateTx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    const meta = result.result.meta as xrpl.TransactionMetadata;

    // tesSUCCESS = filled (fully or partially). tecKILLED = nothing filled at all.
    if (typeof meta === "object" && meta.TransactionResult !== "tesSUCCESS") {
      const err = meta.TransactionResult;
      throw new Error(formatTransactionError(err));
    }

    // Determine actual tokens received
    const balanceAfter = await getTokenBalance(client, wallet.address, cfg);
    const actualReceived = Math.max(0, balanceAfter - balanceBefore);

    if (actualReceived <= 0) {
      throw new Error("Order was submitted but no tokens were received. The offers may have been taken by someone else.");
    }

    const actualReceivedStr = String(actualReceived);

    // Burn only the tokens we actually received
    const burnTx: xrpl.Payment = {
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: cfg.issuer,
      Amount: {
        currency: cfg.currency,
        value: actualReceivedStr,
        issuer: cfg.issuer,
      },
    };
    const preparedBurn = await client.autofill(burnTx);
    const signedBurn = wallet.sign(preparedBurn);
    const burnResult = await client.submitAndWait(signedBurn.tx_blob);
    const burnMeta = burnResult.result.meta as xrpl.TransactionMetadata;
    if (
      typeof burnMeta !== "object" ||
      burnMeta.TransactionResult !== "tesSUCCESS"
    ) {
      const burnErr =
        typeof burnMeta === "object"
          ? burnMeta.TransactionResult
          : "Unknown error";
      throw new Error(`Failed to burn tokens after purchase: ${burnErr}`);
    }

    // Store proxy key
    const { data: apiKeyTx } = await supabase
      .from("api_key_transactions")
      .select("api_key")
      .limit(1)
      .single();
    const realApiKey = apiKeyTx?.api_key || "no_real_key_available";
    const proxyKey = generateProxyKey();
    await supabase.from("proxy_api_keys").insert({
      proxy_key: proxyKey,
      real_key: realApiKey,
      user_id: user.id,
      token_type: cfg.currency,
      ...(walletId && { wallet_id: walletId }),
    });

    // Update user token balance
    const { data: existingTokens, error: selectError } = await supabase
      .from("user_api_tokens")
      .select("id, token_amount")
      .eq("user_id", user.id)
      .eq("token_name", cfg.currency)
      .maybeSingle();
    if (selectError)
      console.error("Error checking existing tokens:", selectError);
    if (existingTokens) {
      const newAmount = existingTokens.token_amount + actualReceived;
      await supabase
        .from("user_api_tokens")
        .update({
          token_amount: newAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingTokens.id);
    } else {
      await supabase.from("user_api_tokens").insert({
        user_id: user.id,
        token_name: cfg.currency,
        token_amount: actualReceived,
      });
    }

    // Record weighted average price
    const weightedAvgPrice = await calculateWeightedAveragePrice(client, cfg);
    if (weightedAvgPrice !== null) {
      await supabase.from("token_prices").insert({
        token_name: cfg.currency,
        price: weightedAvgPrice,
        price_time: new Date().toISOString(),
      });
    }

    // Estimate actual XRP paid based on what we received vs what we planned
    const xrpPaid = buyQty > 0 ? totalXrpCost * (actualReceived / buyQty) : 0;

    return {
      hash: result.result.hash,
      proxyKey,
      tokensReceived: actualReceived,
      xrpPaid,
      burnHash: burnResult.result.hash,
    };
  } finally {
    await client.disconnect();
  }
}

export function BuyOrderDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  tokenConfig: tokenConfigProp,
}: BuyOrderDialogProps) {
  const effectiveTokenConfig = tokenConfigProp ?? getTokenConfig(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled =
    controlledOpen !== undefined && onOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (v: boolean) => onOpenChange?.(v)
    : setInternalOpen;
  const [quantity, setQuantity] = useState("");
  const [secret, setSecret] = useState("");
  const [walletId, setWalletId] = useState("");
  const [wallets, setWallets] = useState<{ id: string; name: string }[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingOffers, setIsFetchingOffers] = useState(false);
  const [step, setStep] = useState<"form" | "success">("form");
  const [bestOffer, setBestOffer] = useState<SellOffer | null>(null);
  const [allOffers, setAllOffers] = useState<SellOffer[]>([]);
  const [txResult, setTxResult] = useState<{
    hash: string;
    proxyKey: string;
    tokensReceived: number;
    xrpPaid: number;
    burnHash: string;
  } | null>(null);
  const [evmRecording, setEvmRecording] = useState(false);
  const [evmRecordResult, setEvmRecordResult] =
    useState<RecordBurnOnEVMResult | null>(null);

  // Fetch best offer and wallets when dialog opens
  useEffect(() => {
    if (open) {
      fetchOffers();
      const loadWallets = async () => {
        const supabase = getSupabase();
        if (!supabase) return;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) return;
        const { data: rows } = await supabase
          .from("wallets")
          .select("wallet_id, name")
          .eq("user_id", user.id)
          .order("created_at");
        const list = (rows ?? []).map((r) => ({
          id: r.wallet_id ?? "",
          name: (r.name?.trim() || r.wallet_id) ?? "Unnamed",
        }));
        setWallets(list);
        setWalletId((prev) =>
          list.length > 0 && (prev === "" || !list.some((w) => w.id === prev))
            ? list[0].id
            : prev,
        );
      };
      loadWallets();
    }
  }, [open, effectiveTokenConfig.currency]);

  const fetchOffers = async () => {
    setIsFetchingOffers(true);
    const client = new xrpl.Client(XRPL_SERVER);
    try {
      await client.connect();
      const offers = await fetchBestSellOffers(client, effectiveTokenConfig);
      setAllOffers(offers);
      if (offers.length > 0) {
        setBestOffer(offers[0]);
      } else {
        setBestOffer(null);
      }
    } catch (err) {
      console.error("Error fetching offers:", err);
    } finally {
      await client.disconnect();
      setIsFetchingOffers(false);
    }
  };

  const resetForm = () => {
    setQuantity("");
    setSecret("");
    setWalletId("");
    setErrors({});
    setStep("form");
    setTxResult(null);
    setEvmRecordResult(null);
    setBestOffer(null);
    setAllOffers([]);
  };

  const handleRecordBurnOnEVM = async () => {
    if (!txResult?.burnHash) return;
    setEvmRecording(true);
    setEvmRecordResult(null);
    const result = await recordBurnOnEVM(
      txResult.burnHash,
      tokenAmountToWei(txResult.tokensReceived),
      effectiveTokenConfig.currency,
    );
    setEvmRecordResult(result);
    setEvmRecording(false);
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    const qty = parseFloat(quantity);
    if (!quantity || isNaN(qty) || qty <= 0) {
      newErrors.quantity = "Please enter a valid quantity greater than 0";
    }

    if (!walletId?.trim()) {
      newErrors.wallet = "Please select a wallet";
    }

    if (!secret || secret.trim().length < 20) {
      newErrors.secret = "Please enter a valid wallet secret";
    }

    if (allOffers.length === 0) {
      newErrors.general = "No sell offers available on the order book";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm() || allOffers.length === 0) return;
    setIsLoading(true);
    setErrors({});
    try {
      const result = await executeBuyOrder(
        quantity,
        secret,
        walletId?.trim() || undefined,
        effectiveTokenConfig,
      );
      setTxResult(result);
      setStep("success");
    } catch (error: unknown) {
      console.error("Error buying tokens:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to buy tokens";
      setErrors({ general: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const estimatedCost = () => {
    const qty = parseFloat(quantity) || 0;
    if (!qty || allOffers.length === 0) return "N/A";
    const { totalXrpCost, filledQty } = computeFillAcrossOffers(allOffers, qty);
    if (filledQty <= 0) return "N/A";
    return `${totalXrpCost.toFixed(6)} (for ${filledQty.toLocaleString()} tokens)`;
  };

  const totalAvailable = allOffers.reduce((s, o) => s + o.quantity, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) resetForm();
      }}
    >
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger || (
            <Button
              variant="default"
              className="bg-green-600 hover:bg-green-700"
            >
              Buy Tokens
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[425px]">
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>Buy {effectiveTokenConfig.currency} Tokens</DialogTitle>
              <DialogDescription>
                Purchase tokens from the XRP Ledger DEX and get a proxy API key.
                Partial fills are supported.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {errors.general && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {errors.general}
                </div>
              )}

              {/* Order book info — fills across multiple offers on XRPL */}
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm font-medium">Order Book (XRPL)</p>
                {isFetchingOffers ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : bestOffer ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Best price: {bestOffer.pricePerUnit.toFixed(8)} XRP per
                      token
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Available: {totalAvailable.toLocaleString()} tokens
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-destructive">
                    No sell offers available
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label>Wallet</Label>
                <Select
                  value={walletId || undefined}
                  onValueChange={setWalletId}
                >
                  <SelectTrigger id="buyWallet" aria-invalid={!!errors.wallet}>
                    <SelectValue placeholder="Select wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.wallet && (
                  <p className="text-sm text-destructive">{errors.wallet}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="buyQuantity">
                  Quantity ({effectiveTokenConfig.currency} tokens)
                </Label>
                <Input
                  id="buyQuantity"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g., 100"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  aria-invalid={!!errors.quantity}
                  disabled={!bestOffer}
                />
                {errors.quantity && (
                  <p className="text-sm text-destructive">{errors.quantity}</p>
                )}
                {bestOffer && parseFloat(quantity) > totalAvailable && totalAvailable > 0 && (
                  <p className="text-sm text-yellow-500">
                    Only {totalAvailable.toLocaleString()} tokens available — order will partially fill.
                  </p>
                )}
              </div>

              {quantity && bestOffer && (
                <div className="rounded-md bg-green-500/10 p-3">
                  <p className="text-sm font-medium">Order Summary</p>
                  <p className="text-sm text-muted-foreground">
                    Est. cost: {estimatedCost()} XRP
                  </p>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="buySecret">Wallet Secret</Label>
                <Input
                  id="buySecret"
                  type="password"
                  placeholder="sXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  aria-invalid={!!errors.secret}
                />
                {errors.secret && (
                  <p className="text-sm text-destructive">{errors.secret}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Your wallet secret is used to sign the transaction locally.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  isLoading || allOffers.length === 0 || !walletId?.trim()
                }
                className="bg-green-600 hover:bg-green-700"
              >
                {isLoading ? "Processing..." : "Buy Tokens"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "success" && txResult && (
          <>
            <DialogHeader>
              <DialogTitle>Purchase Successful!</DialogTitle>
              <DialogDescription>
                Your tokens have been purchased and a proxy API key has been
                generated.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="rounded-md bg-green-500/10 p-4">
                <p className="text-sm font-medium text-green-600">
                  Transaction Successful
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Purchased {txResult.tokensReceived} {effectiveTokenConfig.currency}{" "}
                  tokens
                </p>
                <p className="text-sm text-muted-foreground">
                  Paid: {txResult.xrpPaid.toFixed(6)} XRP
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Your Proxy API Key</Label>
                <div className="rounded-md bg-muted p-3">
                  <code className="block break-all text-sm font-mono">
                    {txResult.proxyKey}
                  </code>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use this key to access the API. Keep it secure!
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Transaction Hash</Label>
                <code className="block overflow-auto rounded bg-muted p-2 text-xs">
                  {txResult.hash}
                </code>
              </div>

              {/* Optional: record burn on XRPL EVM for on-chain transparency */}
              <div className="grid gap-2 rounded-md border border-muted p-3">
                <p className="text-sm font-medium">
                  Record burn on-chain (XRPL EVM)
                </p>
                <p className="text-xs text-muted-foreground">
                  Record this burn on the XRPL EVM sidechain for transparency.
                  Requires MetaMask on XRPL EVM (you pay gas).
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={
                    evmRecording ||
                    !process.env.NEXT_PUBLIC_BURN_REGISTRY_ADDRESS
                  }
                  onClick={handleRecordBurnOnEVM}
                >
                  {evmRecording ? "Recording…" : "Record burn on XRPL EVM"}
                </Button>
                {evmRecordResult && (
                  <p
                    className={`text-xs ${evmRecordResult.success ? "text-green-600" : "text-destructive"}`}
                  >
                    {evmRecordResult.success
                      ? `Recorded. Tx: ${evmRecordResult.txHash.slice(0, 10)}…`
                      : evmRecordResult.error}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(txResult.proxyKey);
                }}
                variant="outline"
              >
                Copy API Key
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
