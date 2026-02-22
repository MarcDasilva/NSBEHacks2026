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

// Hardcoded token configuration
const TOKEN_CURRENCY = "GGK";
const ISSUER_ADDRESS = "rUpuaJVFUFhw9Dy7X7SwJgw19PpG7BJ1kE";
const XRPL_SERVER = "wss://s.altnet.rippletest.net:51233";

interface BuyOrderDialogProps {
  trigger?: React.ReactNode;
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
async function fetchBestSellOffers(client: xrpl.Client): Promise<SellOffer[]> {
  console.log("[DEBUG] TOKEN_CURRENCY:", TOKEN_CURRENCY);
  console.log("[DEBUG] ISSUER_ADDRESS:", ISSUER_ADDRESS);
  const response = await client.request({
    command: "book_offers",
    taker_gets: { currency: "XRP" },
    taker_pays: {
      currency: TOKEN_CURRENCY,
      issuer: ISSUER_ADDRESS,
    },
    limit: 10,
  });

  const offers = response.result.offers || [];
  console.log("[DEBUG] Raw offers from order book:", offers);

  return offers
    .map((offer) => {
      // Correct: TakerGets is GGK (object), TakerPays is XRP (string, drops)
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

export function BuyOrderDialog({ trigger }: BuyOrderDialogProps) {
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
  }, [open]);

  const fetchOffers = async () => {
    setIsFetchingOffers(true);
    const client = new xrpl.Client(XRPL_SERVER);
    try {
      await client.connect();
      const offers = await fetchBestSellOffers(client);
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

      // Create an OfferCreate to buy tokens
      // We're offering XRP (TakerPays for the counterparty = TakerGets for us)
      // We want GGK tokens (TakerGets for the counterparty = TakerPays for us)
      const offerCreateTx: xrpl.OfferCreate = {
        TransactionType: "OfferCreate",
        Account: wallet.address,
        TakerGets: {
          currency: TOKEN_CURRENCY,
          value: quantity,
          issuer: ISSUER_ADDRESS,
        },
        TakerPays: totalDrops, // XRP in drops
        Flags: 0,
      };

      // Prepare and sign the transaction
      const prepared = await client.autofill(offerCreateTx);
      const signed = wallet.sign(prepared);
      const result = await client.submitAndWait(signed.tx_blob);

      const meta = result.result.meta as xrpl.TransactionMetadata;

      if (typeof meta === "object" && meta.TransactionResult === "tesSUCCESS") {
        // Transaction successful - now set up the proxy key and update token balance

        // 1. Find the real API key from api_key_transactions for this token
        // For now, we'll get the first available API key transaction
        const { data: apiKeyTx } = await supabase
          .from("api_key_transactions")
          .select("api_key")
          .limit(1)
          .single();

        const realApiKey = apiKeyTx?.api_key || "no_real_key_available";

        // 2. Generate a proxy key
        const proxyKey = generateProxyKey();

        // 3. Store the proxy key mapping
        const { error: proxyInsertError } = await supabase
          .from("proxy_api_keys")
          .insert({
            proxy_key: proxyKey,
            real_key: realApiKey,
          });

        if (proxyInsertError) {
          console.error("Error storing proxy key:", proxyInsertError);
        }

        // 4. Update or insert user's token balance
        // First check if user has an existing record for this token
        const { data: existingTokens } = await supabase
          .from("user_api_tokens")
          .select("id, token_amount")
          .eq("user_id", user.id)
          .eq("token_name", TOKEN_CURRENCY)
          .single();

        if (existingTokens) {
          // Update existing record
          const newAmount = existingTokens.token_amount + qty;
          await supabase
            .from("user_api_tokens")
            .update({
              token_amount: newAmount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingTokens.id);
        } else {
          // Insert new record
          await supabase.from("user_api_tokens").insert({
            user_id: user.id,
            token_name: TOKEN_CURRENCY,
            token_amount: qty,
          });
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
              <DialogTitle>Buy {TOKEN_CURRENCY} Tokens</DialogTitle>
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
                  Quantity ({TOKEN_CURRENCY} tokens)
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
                    Buying {quantity} {TOKEN_CURRENCY} for {estimatedCost()} XRP
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
                  Purchased {txResult.tokensReceived} {TOKEN_CURRENCY} tokens
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
