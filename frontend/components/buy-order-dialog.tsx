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

const XRPL_SERVER = "wss://s.altnet.rippletest.net:51233";

export interface TokenConfig {
  currency: string;
  issuer: string;
}

interface BuyOrderDialogProps {
  trigger?: React.ReactNode;
  tokenConfig: TokenConfig;
}

interface FormErrors {
  quantity?: string;
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
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "pk_";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Fetches the best sell offers from the order book
 */
async function fetchBestSellOffers(
  client: xrpl.Client,
  tokenConfig: TokenConfig
): Promise<SellOffer[]> {
  console.log("[DEBUG] tokenConfig.currency:", tokenConfig.currency);
  console.log("[DEBUG] tokenConfig.issuer:", tokenConfig.issuer);
  // Query for sell offers: taker gets tokens and pays XRP
  const response = await client.request({
    command: "book_offers",
    taker_gets: {
      currency: tokenConfig.currency,
      issuer: tokenConfig.issuer,
    },
    taker_pays: { currency: "XRP" },
    limit: 10,
  });

  const offers = response.result.offers || [];
  console.log("[DEBUG] Raw offers from order book:", offers);

  return offers
    .map((offer) => {
      // For sell offers: TakerGets is tokens (object), TakerPays is XRP (string, drops)
      const tokenAmount = typeof offer.TakerGets === "object" && "value" in offer.TakerGets
        ? parseFloat(offer.TakerGets.value)
        : 0;
      const xrpDrops = typeof offer.TakerPays === "string" ? offer.TakerPays : "0";
      const xrpAmount = parseFloat(xrpDrops) / 1_000_000;

      if (tokenAmount <= 0 || xrpAmount <= 0) return null;

      return {
        offerId: offer.index || "",
        account: offer.Account,
        quantity: tokenAmount,
        pricePerUnit: xrpAmount / tokenAmount,
        totalXrp: xrpAmount,
        takerGetsValue: offer.TakerGets.value,
        takerPaysDrops: xrpDrops,
      };
    })
    .filter((o): o is SellOffer => o !== null)
    .sort((a, b) => a.pricePerUnit - b.pricePerUnit);
}

/**
 * Calculates the weighted average price from all sell offers
 */
async function calculateWeightedAveragePrice(
  client: xrpl.Client,
  tokenConfig: TokenConfig
): Promise<number | null> {
  try {
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
    if (!offers || offers.length === 0) {
      return null;
    }

    let totalWeightedPrice = 0;
    let totalQuantity = 0;

    for (const offer of offers) {
      const tokenAmount = typeof offer.TakerGets === "object" && "value" in offer.TakerGets
        ? parseFloat(offer.TakerGets.value)
        : 0;
      const xrpDrops = typeof offer.TakerPays === "string"
        ? parseFloat(offer.TakerPays)
        : 0;
      const xrpAmount = xrpDrops / 1_000_000;

      if (tokenAmount > 0 && xrpAmount > 0) {
        const pricePerUnit = xrpAmount / tokenAmount;
        totalWeightedPrice += pricePerUnit * tokenAmount;
        totalQuantity += tokenAmount;
      }
    }

    if (totalQuantity === 0) {
      return null;
    }

    return totalWeightedPrice / totalQuantity;
  } catch (error) {
    console.error("Error calculating weighted average price:", error);
    return null;
  }
}

export function BuyOrderDialog({ trigger, tokenConfig }: BuyOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [secret, setSecret] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingOffers, setIsFetchingOffers] = useState(false);
  const [step, setStep] = useState<"form" | "success">("form");
  const [bestOffer, setBestOffer] = useState<SellOffer | null>(null);
  const [txResult, setTxResult] = useState<{
    hash: string;
    proxyKey: string;
    tokensReceived: number;
    xrpPaid: number;
  } | null>(null);

  // Fetch best offer when dialog opens
  useEffect(() => {
    if (open) {
      fetchOffers();
    }
  }, [open, tokenConfig]);

  const fetchOffers = async () => {
    setIsFetchingOffers(true);
    const client = new xrpl.Client(XRPL_SERVER);
    try {
      await client.connect();
      const offers = await fetchBestSellOffers(client, tokenConfig);
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
    setErrors({});
    setStep("form");
    setTxResult(null);
    setBestOffer(null);
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    const qty = parseFloat(quantity);
    if (!quantity || isNaN(qty) || qty <= 0) {
      newErrors.quantity = "Please enter a valid quantity greater than 0";
    }

    if (!secret || secret.trim().length < 20) {
      newErrors.secret = "Please enter a valid wallet secret";
    }

    if (!bestOffer) {
      newErrors.general = "No sell offers available";
    } else if (qty > bestOffer.quantity) {
      newErrors.quantity = `Maximum available: ${bestOffer.quantity} tokens`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !bestOffer) return;

    setIsLoading(true);
    setErrors({});

    const client = new xrpl.Client(XRPL_SERVER);

    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("User not authenticated");
      }

      // Create wallet from secret
      let wallet: xrpl.Wallet;
      try {
        wallet = xrpl.Wallet.fromSeed(secret.trim());
      } catch {
        setErrors({ secret: "Invalid wallet secret" });
        setIsLoading(false);
        return;
      }

      await client.connect();

      const qty = parseFloat(quantity);
      const totalXrpCost = qty * bestOffer.pricePerUnit;
      const totalDrops = Math.ceil(totalXrpCost * 1_000_000).toString();

      // Step 1: Set up trust line for the token (required to receive tokens)
      const trustSetTx: xrpl.TrustSet = {
        TransactionType: "TrustSet",
        Account: wallet.address,
        LimitAmount: {
          currency: tokenConfig.currency,
          issuer: tokenConfig.issuer,
          value: "1000000000", // High limit to allow receiving tokens
        },
      };

      const preparedTrust = await client.autofill(trustSetTx);
      const signedTrust = wallet.sign(preparedTrust);
      const trustResult = await client.submitAndWait(signedTrust.tx_blob);
      const trustMeta = trustResult.result.meta as xrpl.TransactionMetadata;

      // Trust line setup is idempotent - tecDUPLICATE is OK if already exists
      if (
        typeof trustMeta === "object" &&
        trustMeta.TransactionResult !== "tesSUCCESS" &&
        trustMeta.TransactionResult !== "tecDUPLICATE"
      ) {
        throw new Error(`Failed to set up trust line: ${trustMeta.TransactionResult}`);
      }

      // Step 2: Create an OfferCreate to buy tokens
      // Buyer offers XRP (TakerGets) and wants GGK tokens (TakerPays)
      // Use tfImmediateOrCancel to ensure the offer fills immediately
      const offerCreateTx: xrpl.OfferCreate = {
        TransactionType: "OfferCreate",
        Account: wallet.address,
        TakerGets: totalDrops, // XRP in drops that buyer is offering
        TakerPays: {
          currency: tokenConfig.currency,
          value: quantity,
          issuer: tokenConfig.issuer,
        }, // GGK tokens that buyer wants
        Flags: xrpl.OfferCreateFlags.tfImmediateOrCancel,
      };

      // Prepare and sign the transaction
      const prepared = await client.autofill(offerCreateTx);
      const signed = wallet.sign(prepared);
      const result = await client.submitAndWait(signed.tx_blob);

      const meta = result.result.meta as xrpl.TransactionMetadata;
      console.log("[DEBUG] OfferCreate result:", result.result);
      console.log("[DEBUG] OfferCreate meta:", meta);

      if (typeof meta === "object" && meta.TransactionResult === "tesSUCCESS") {
        // Transaction successful - now burn tokens, set up proxy key, and update token balance
        console.log("[DEBUG] OfferCreate succeeded, attempting to burn tokens...");

        // Check wallet balance before burn
        const balancesBefore = await client.request({
          command: "account_lines",
          account: wallet.address,
        });
        console.log("[DEBUG] Token balances before burn:", balancesBefore.result.lines);

        // 1. Immediately burn the received tokens by sending them back to the issuer
        const burnTx: xrpl.Payment = {
          TransactionType: "Payment",
          Account: wallet.address,
          Destination: tokenConfig.issuer,
          Amount: {
            currency: tokenConfig.currency,
            value: quantity,
            issuer: tokenConfig.issuer,
          },
        };

        console.log("[DEBUG] Burn transaction:", burnTx);
        const preparedBurn = await client.autofill(burnTx);
        const signedBurn = wallet.sign(preparedBurn);
        const burnResult = await client.submitAndWait(signedBurn.tx_blob);
        const burnMeta = burnResult.result.meta as xrpl.TransactionMetadata;
        console.log("[DEBUG] Burn result:", burnResult.result);

        if (typeof burnMeta !== "object" || burnMeta.TransactionResult !== "tesSUCCESS") {
          console.error("Failed to burn tokens:", burnMeta);
          throw new Error(`Failed to burn tokens after purchase: ${typeof burnMeta === "object" ? burnMeta.TransactionResult : "Unknown error"}`);
        }

        console.log("[DEBUG] Tokens burned successfully");

        // 2. Find the real API key from api_key_transactions for this token type
        const { data: apiKeyTx } = await supabase
          .from("api_key_transactions")
          .select("api_key")
          .eq("token_type", tokenConfig.currency)
          .limit(1)
          .maybeSingle();

        const realApiKey = apiKeyTx?.api_key || "no_real_key_available";

        // 3. Generate a proxy key
        const proxyKey = generateProxyKey();

        // 4. Store the proxy key mapping with token type and user_id
        const { error: proxyInsertError } = await supabase
          .from("proxy_api_keys")
          .insert({
            proxy_key: proxyKey,
            real_key: realApiKey,
            token_type: tokenConfig.currency,
            user_id: user.id,
          });

        if (proxyInsertError) {
          console.error("Error storing proxy key:", proxyInsertError);
        }

        // 5. Upsert user's token balance
        const { data: existingTokens, error: selectError } = await supabase
          .from("user_api_tokens")
          .select("id, token_amount")
          .eq("user_id", user.id)
          .eq("token_name", tokenConfig.currency)
          .maybeSingle();

        if (selectError) {
          console.error("Error checking existing tokens:", selectError);
        }

        if (existingTokens) {
          // Update existing record
          const newAmount = existingTokens.token_amount + qty;
          const { error: updateError } = await supabase
            .from("user_api_tokens")
            .update({
              token_amount: newAmount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingTokens.id);

          if (updateError) {
            console.error("Error updating user tokens:", updateError);
          } else {
            console.log("Updated user tokens:", { userId: user.id, newAmount });
          }
        } else {
          // Insert new record
          const { error: insertError } = await supabase.from("user_api_tokens").insert({
            user_id: user.id,
            token_name: tokenConfig.currency,
            token_amount: qty,
          });

          if (insertError) {
            console.error("Error inserting user tokens:", insertError);
          } else {
            console.log("Inserted user tokens:", { userId: user.id, tokenAmount: qty });
          }
        }

        // Calculate and store the weighted average price
        const weightedAvgPrice = await calculateWeightedAveragePrice(client, tokenConfig);
        if (weightedAvgPrice !== null) {
          const { error: priceInsertError } = await supabase
            .from("token_prices")
            .insert({
              token_name: tokenConfig.currency,
              price: weightedAvgPrice,
              price_time: new Date().toISOString(),
            });

          if (priceInsertError) {
            console.error("Error storing token price:", priceInsertError);
          }
        }

        setTxResult({
          hash: result.result.hash,
          proxyKey,
          tokensReceived: qty,
          xrpPaid: totalXrpCost,
        });
        setStep("success");
      } else {
        const errorResult =
          typeof meta === "object" ? meta.TransactionResult : "Unknown error";
        throw new Error(`Transaction failed: ${errorResult}`);
      }
    } catch (error: unknown) {
      console.error("Error buying tokens:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to buy tokens";
      setErrors({ general: errorMessage });
    } finally {
      await client.disconnect();
      setIsLoading(false);
    }
  };

  const estimatedCost = () => {
    if (!bestOffer) return "N/A";
    const qty = parseFloat(quantity) || 0;
    return (qty * bestOffer.pricePerUnit).toFixed(6);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="default" className="bg-green-600 hover:bg-green-700">
            Buy Tokens
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>Buy {tokenConfig.currency} Tokens</DialogTitle>
              <DialogDescription>
                Purchase tokens from the XRP Ledger DEX and get a proxy API key.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {errors.general && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {errors.general}
                </div>
              )}

              {/* Best offer info */}
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm font-medium">Best Available Offer</p>
                {isFetchingOffers ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : bestOffer ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Price: {bestOffer.pricePerUnit.toFixed(8)} XRP per token
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Available: {bestOffer.quantity.toLocaleString()} tokens
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-destructive">
                    No sell offers available
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="buyQuantity">
                  Quantity ({tokenConfig.currency} tokens)
                </Label>
                <Input
                  id="buyQuantity"
                  type="number"
                  step="any"
                  min="0"
                  max={bestOffer?.quantity || undefined}
                  placeholder="e.g., 100"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  aria-invalid={!!errors.quantity}
                  disabled={!bestOffer}
                />
                {errors.quantity && (
                  <p className="text-sm text-destructive">{errors.quantity}</p>
                )}
              </div>

              {quantity && bestOffer && (
                <div className="rounded-md bg-green-500/10 p-3">
                  <p className="text-sm font-medium">Order Summary</p>
                  <p className="text-sm text-muted-foreground">
                    Buying {quantity} {tokenConfig.currency} for {estimatedCost()} XRP
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
                disabled={isLoading || !bestOffer}
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
                  Purchased {txResult.tokensReceived} {tokenConfig.currency} tokens
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
