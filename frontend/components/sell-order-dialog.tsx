"use client";

import { useState } from "react";
import * as xrpl from "xrpl";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  getTokenConfig,
  XRPL_SERVER,
  type TokenConfig,
} from "@/lib/token-config";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

/**
 * Fetches all outstanding sell offers for the token and calculates the weighted average price.
 * Weighted average = sum(price_per_unit * quantity) / sum(quantity)
 */
async function calculateWeightedAveragePrice(
  client: xrpl.Client,
  tokenConfig: TokenConfig,
): Promise<number | null> {
  try {
    const response = await client.request({
      command: "book_offers",
      taker_gets: { currency: "XRP" },
      taker_pays: {
        currency: tokenConfig.currency,
        issuer: tokenConfig.issuer,
      },
      limit: 100,
    });

    const offers = response.result.offers;

    if (!offers || offers.length === 0) {
      return null;
    }

    let totalWeightedPrice = 0;
    let totalQuantity = 0;

    for (const offer of offers) {
      // TakerGets is XRP (in drops) - what the seller wants
      // TakerPays is GGK tokens - what the seller is offering
      const xrpDrops =
        typeof offer.TakerGets === "string" ? parseFloat(offer.TakerGets) : 0;
      const xrpAmount = xrpDrops / 1_000_000;

      const tokenAmount =
        typeof offer.TakerPays === "object" && "value" in offer.TakerPays
          ? parseFloat(offer.TakerPays.value)
          : 0;

      if (tokenAmount > 0 && xrpAmount > 0) {
        // Price per unit = XRP / tokens
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

/**
 * Fetches weighted average price using its own connection. Use this for background
 * updates so the main sell flow can disconnect its client immediately.
 */
async function fetchWeightedAveragePriceInBackground(
  tokenConfig: TokenConfig,
): Promise<number | null> {
  const client = new xrpl.Client(XRPL_SERVER);
  try {
    await client.connect();
    return await calculateWeightedAveragePrice(client, tokenConfig);
  } catch (error) {
    console.error("Error in background weighted average fetch:", error);
    return null;
  } finally {
    await client.disconnect().catch(() => {});
  }
}

/**
 * Returns true if the given wallet address has an API Provider (or Proxy Key) node connected to it
 * in the user's saved connection graph, and that node's apiKey or proxyKey matches the given apiKey.
 */
async function isApiKeyConnectedToWallet(
  supabase: SupabaseClient,
  userId: string,
  walletAddress: string,
  apiKey: string,
): Promise<boolean> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) return false;

  // 1) Resolve wallet_id for this address: fetch user wallets and derive address from secret
  const { data: walletRows, error: walletsError } = await supabase
    .from("wallets")
    .select("wallet_id, wallet_secret")
    .eq("user_id", userId);

  if (walletsError || !walletRows?.length) return false;

  let matchedWalletId: string | null = null;
  for (const row of walletRows) {
    const sec = row.wallet_secret;
    if (!sec) continue;
    try {
      const w = xrpl.Wallet.fromSeed(sec);
      if (w.address === walletAddress) {
        matchedWalletId = row.wallet_id ?? null;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!matchedWalletId) return false;

  // 2) Load latest connection graph
  const { data: graphRow, error: graphError } = await supabase
    .from("user_connection_graphs")
    .select("nodes, edges")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (graphError || !graphRow) return false;
  const nodes = Array.isArray(graphRow.nodes)
    ? (graphRow.nodes as Record<string, unknown>[])
    : [];
  const edges = Array.isArray(graphRow.edges)
    ? (graphRow.edges as { source: string; target: string }[])
    : [];

  // 3) Find wallet node ids where data.wallet === matchedWalletId
  const walletNodeIds = new Set<string>();
  for (const n of nodes) {
    if (n.type !== "wallet") continue;
    const data = n.data as Record<string, unknown> | undefined;
    const w = data?.wallet;
    if (String(w) === matchedWalletId && typeof n.id === "string")
      walletNodeIds.add(n.id);
  }
  if (walletNodeIds.size === 0) return false;

  // 4) Find node ids connected to those wallet nodes (apiProvider or proxyKey)
  const connectedNodeIds = new Set<string>();
  for (const e of edges) {
    const src = e.source;
    const tgt = e.target;
    if (walletNodeIds.has(src)) connectedNodeIds.add(tgt);
    if (walletNodeIds.has(tgt)) connectedNodeIds.add(src);
  }

  // 5) Collect apiKey and proxyKey from those nodes; check if entered key matches
  for (const n of nodes) {
    if (!connectedNodeIds.has(String(n.id))) continue;
    const typ = n.type as string;
    if (typ !== "apiProvider" && typ !== "proxyKey") continue;
    const data = n.data as Record<string, unknown> | undefined;
    const key = (data?.apiKey ?? data?.proxyKey) as string | undefined;
    if (typeof key === "string" && key.trim() === trimmedKey) return true;
  }
  return false;
}

/**
 * Returns the API key (or proxy key) and providerId from the first API Provider / Proxy Key node
 * connected to the given wallet_id in the user's saved connection graph.
 */
export async function getApiKeyForWallet(
  supabase: SupabaseClient,
  userId: string,
  walletId: string,
): Promise<{ apiKey: string; providerId: string } | null> {
  if (!walletId?.trim()) return null;

  const { data: graphRow, error: graphError } = await supabase
    .from("user_connection_graphs")
    .select("nodes, edges")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (graphError || !graphRow) return null;
  const nodes = Array.isArray(graphRow.nodes)
    ? (graphRow.nodes as Record<string, unknown>[])
    : [];
  const edges = Array.isArray(graphRow.edges)
    ? (graphRow.edges as { source: string; target: string }[])
    : [];

  const walletNodeIds = new Set<string>();
  for (const n of nodes) {
    if (n.type !== "wallet") continue;
    const data = n.data as Record<string, unknown> | undefined;
    if (String(data?.wallet) === String(walletId) && typeof n.id === "string")
      walletNodeIds.add(n.id);
  }
  if (walletNodeIds.size === 0) return null;

  const connectedNodeIds = new Set<string>();
  for (const e of edges) {
    if (walletNodeIds.has(e.source)) connectedNodeIds.add(e.target);
    if (walletNodeIds.has(e.target)) connectedNodeIds.add(e.source);
  }

  for (const n of nodes) {
    if (!connectedNodeIds.has(String(n.id))) continue;
    const typ = n.type as string;
    if (typ !== "apiProvider" && typ !== "proxyKey") continue;
    const data = n.data as Record<string, unknown> | undefined;
    const key = (data?.apiKey ?? data?.proxyKey) as string | undefined;
    const providerId = (data?.providerId as string) ?? "";
    if (typeof key === "string" && key.trim())
      return { apiKey: key.trim(), providerId: providerId || "unknown" };
  }
  return null;
}

/** Runs the full sell flow (trust line, issue tokens, create offer, store). Throws on error. */
export async function submitSellOrder(
  supabase: SupabaseClient,
  userId: string,
  params: {
    apiKey: string;
    quantity: string;
    pricePerUnit: string;
    secret: string;
    skipConnectionCheck?: boolean;
    wallet_id?: string;
    provider_id?: string;
    /** Token to sell (from graph/API context). Defaults to GGK when omitted. */
    tokenConfig?: TokenConfig;
  },
): Promise<{ hash: string; transactionId: string }> {
  const {
    apiKey,
    quantity,
    pricePerUnit,
    secret,
    skipConnectionCheck,
    wallet_id: walletId,
    provider_id: providerId,
    tokenConfig: tokenConfigParam,
  } = params;
  const cfg = tokenConfigParam ?? getTokenConfig(null);
  const qty = parseFloat(quantity);
  const price = parseFloat(pricePerUnit);
  if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
    throw new Error("Invalid quantity or price");
  }
  const totalXrp = qty * price;

  let wallet: xrpl.Wallet;
  try {
    wallet = xrpl.Wallet.fromSeed(secret.trim());
  } catch {
    throw new Error("Invalid wallet secret");
  }

  if (!skipConnectionCheck) {
    const allowed = await isApiKeyConnectedToWallet(
      supabase,
      userId,
      wallet.address,
      apiKey.trim(),
    );
    if (!allowed) {
      throw new Error(
        "You must have an API provider connected to that wallet to sell.",
      );
    }
  }

  const client = new xrpl.Client(XRPL_SERVER);
  await client.connect();

  try {
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

    let issueResponse: Response;
    try {
      issueResponse = await fetch(`${BACKEND_URL}/api/xrpl/issue-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientAddress: wallet.address,
          amount: qty,
          currency: cfg.currency,
          issuerAddress: cfg.issuer,
        }),
      });
    } catch (fetchErr) {
      const msg =
        fetchErr instanceof TypeError && fetchErr.message === "Failed to fetch"
          ? "Backend server not reachable. Start it with: cd backend && npm run dev"
          : fetchErr instanceof Error
            ? fetchErr.message
            : "Network error";
      throw new Error(msg);
    }
    const issueData = await issueResponse.json().catch(() => ({}));
    if (!issueResponse.ok) {
      throw new Error(
        (issueData as { error?: string }).error ||
          "Failed to receive tokens from issuer",
      );
    }

    const totalDrops = Math.floor(totalXrp * 1_000_000).toString();
    const offerCreateTx: xrpl.OfferCreate = {
      TransactionType: "OfferCreate",
      Account: wallet.address,
      TakerPays: totalDrops,
      TakerGets: {
        currency: cfg.currency,
        value: quantity,
        issuer: cfg.issuer,
      },
      Flags: 0,
    };
    const prepared = await client.autofill(offerCreateTx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    const meta = result.result.meta as xrpl.TransactionMetadata;

    if (typeof meta === "object" && meta.TransactionResult === "tesSUCCESS") {
      const sequence = prepared.Sequence;
      const transactionId = `${wallet.address}:${sequence}`;
      const { error: insertError } = await supabase
        .from("api_key_transactions")
        .insert({ api_key: apiKey.trim(), transaction_id: transactionId });
      if (insertError) {
        throw new Error(
          "Transaction succeeded but failed to store API key record",
        );
      }
      let wId = walletId;
      let pId = providerId;
      if (!wId || !pId) {
        const { data: walletRows } = await supabase
          .from("wallets")
          .select("wallet_id, wallet_secret")
          .eq("user_id", userId);
        for (const row of walletRows ?? []) {
          try {
            if (
              xrpl.Wallet.fromSeed(row.wallet_secret ?? "").address ===
              wallet.address
            ) {
              wId = row.wallet_id ?? "";
              break;
            }
          } catch {
            continue;
          }
        }
        if (wId) {
          const keyInfo = await getApiKeyForWallet(supabase, userId, wId);
          if (keyInfo) pId = keyInfo.providerId;
        }
      }
      if (wId && pId) {
        await supabase.from("sell_requests").insert({
          user_id: userId,
          wallet_id: wId,
          provider_id: pId,
          transaction_id: transactionId,
          quantity: qty,
          price_per_unit: price,
        });
      }
      // Update token price in background with its own connection (main client is disconnected in finally)
      void fetchWeightedAveragePriceInBackground(cfg).then((weightedAvgPrice) => {
        if (weightedAvgPrice !== null) {
          supabase
            .from("token_prices")
            .insert({
              token_name: cfg.currency,
              price: weightedAvgPrice,
              price_time: new Date().toISOString(),
            })
            .then(
              () => {},
              () => {},
            );
        }
      });
      return { hash: result.result.hash, transactionId };
    }
    const err =
      typeof meta === "object" ? meta.TransactionResult : "Unknown error";
    throw new Error(`Transaction failed: ${err}`);
  } finally {
    await client.disconnect();
  }
}

interface SellOrderDialogProps {
  trigger?: React.ReactNode;
  /** When provided, dialog is controlled by parent (no trigger shown). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Token to sell (from graph/API context). Defaults to GGK when omitted. */
  tokenConfig?: TokenConfig;
}

interface FormErrors {
  apiKey?: string;
  quantity?: string;
  pricePerUnit?: string;
  secret?: string;
  general?: string;
}

export function SellOrderDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  tokenConfig: tokenConfigProp,
}: SellOrderDialogProps) {
  const effectiveTokenConfig = tokenConfigProp ?? getTokenConfig(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled =
    controlledOpen !== undefined && onOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (v: boolean) => onOpenChange?.(v)
    : setInternalOpen;
  const [apiKey, setApiKey] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [secret, setSecret] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"form" | "confirm" | "success">("form");
  const [txResult, setTxResult] = useState<{
    hash: string;
    transactionId: string;
  } | null>(null);

  const resetForm = () => {
    setApiKey("");
    setQuantity("");
    setPricePerUnit("");
    setSecret("");
    setErrors({});
    setStep("form");
    setTxResult(null);
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Validate API key
    if (!apiKey || apiKey.trim().length < 10) {
      newErrors.apiKey = "Please enter a valid API key";
    }

    // Validate quantity
    const qty = parseFloat(quantity);
    if (!quantity || isNaN(qty) || qty <= 0) {
      newErrors.quantity = "Please enter a valid quantity greater than 0";
    }

    // Validate price per unit
    const price = parseFloat(pricePerUnit);
    if (!pricePerUnit || isNaN(price) || price <= 0) {
      newErrors.pricePerUnit = "Please enter a valid price greater than 0";
    }

    // Validate secret (basic check)
    if (!secret || secret.trim().length < 20) {
      newErrors.secret = "Please enter a valid wallet secret";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Supabase client not available");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const result = await submitSellOrder(supabase, user.id, {
        apiKey: apiKey.trim(),
        quantity,
        pricePerUnit,
        secret: secret.trim(),
        tokenConfig: effectiveTokenConfig,
      });
      setTxResult({ hash: result.hash, transactionId: result.transactionId });
      setStep("success");
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Failed to create sell order";
      setErrors({ general: msg });
      toast.error(msg, { position: "bottom-right" });
    } finally {
      setIsLoading(false);
    }
  };

  const totalXrp = () => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(pricePerUnit) || 0;
    return (qty * price).toFixed(6);
  };

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
          {trigger || <Button>Create Sell Order</Button>}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[425px]">
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>Create Sell Order</DialogTitle>
              <DialogDescription>
                Sell your {effectiveTokenConfig.currency} tokens on the XRP Ledger DEX.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {errors.general && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {errors.general}
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="text"
                  placeholder="Enter your API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  aria-invalid={!!errors.apiKey}
                />
                {errors.apiKey && (
                  <p className="text-sm text-destructive">{errors.apiKey}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  The API key you want to sell access to
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="quantity">
                  Quantity ({effectiveTokenConfig.currency} tokens)
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g., 500"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  aria-invalid={!!errors.quantity}
                />
                {errors.quantity && (
                  <p className="text-sm text-destructive">{errors.quantity}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  How many {effectiveTokenConfig.currency} tokens you want to sell
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="pricePerUnit">Price per Unit (XRP)</Label>
                <Input
                  id="pricePerUnit"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g., 0.01"
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                  aria-invalid={!!errors.pricePerUnit}
                />
                {errors.pricePerUnit && (
                  <p className="text-sm text-destructive">
                    {errors.pricePerUnit}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Price in XRP for each {effectiveTokenConfig.currency} token
                </p>
              </div>

              {quantity && pricePerUnit && (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm font-medium">Order Summary</p>
                  <p className="text-sm text-muted-foreground">
                    Selling {quantity} {effectiveTokenConfig.currency} for {totalXrp()} XRP
                    total
                  </p>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="secret">Wallet Secret</Label>
                <Input
                  id="secret"
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
                  Your wallet secret is used to sign the transaction locally and
                  is never sent to our servers.
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
              <Button type="button" onClick={handleSubmit} disabled={isLoading}>
                {isLoading
                  ? "Issuing Tokens & Creating Order..."
                  : "Create Sell Order"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "success" && txResult && (
          <>
            <DialogHeader>
              <DialogTitle>Sell Order Created</DialogTitle>
              <DialogDescription>
                Your sell order has been submitted to the XRP Ledger.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="rounded-md bg-green-500/10 p-4">
                <p className="text-sm font-medium text-green-600">
                  Transaction Successful
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  You received {quantity} {effectiveTokenConfig.currency} tokens and created a
                  sell order
                </p>
                <p className="text-sm text-muted-foreground">
                  Selling {quantity} {effectiveTokenConfig.currency} at {pricePerUnit} XRP each
                </p>
                <p className="text-sm text-muted-foreground">
                  Total: {totalXrp()} XRP
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Transaction Hash</Label>
                <code className="block overflow-auto rounded bg-muted p-2 text-xs">
                  {txResult.hash}
                </code>
              </div>

              <div className="grid gap-2">
                <Label>Transaction ID</Label>
                <code className="block overflow-auto rounded bg-muted p-2 text-xs">
                  {txResult.transactionId}
                </code>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
