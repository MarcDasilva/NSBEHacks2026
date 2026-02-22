"use client";

import { useState } from "react";
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
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

/**
 * Fetches all outstanding sell offers for the token and calculates the weighted average price.
 * Weighted average = sum(price_per_unit * quantity) / sum(quantity)
 */
async function calculateWeightedAveragePrice(client: xrpl.Client): Promise<number | null> {
    try {
        // Query the order book for GGK/XRP sell offers
        // For sell offers: taker gets GGK tokens and pays XRP
        const response = await client.request({
            command: "book_offers",
            taker_gets: {
                currency: TOKEN_CURRENCY,
                issuer: ISSUER_ADDRESS,
            },
            taker_pays: { currency: "XRP" },
            limit: 100, // Get up to 100 offers
        });

        const offers = response.result.offers;

        if (!offers || offers.length === 0) {
            return null;
        }

        let totalWeightedPrice = 0;
        let totalQuantity = 0;

        for (const offer of offers) {
            // For sell offers: TakerGets is GGK tokens, TakerPays is XRP (in drops)
            const tokenAmount = typeof offer.TakerGets === "object" && "value" in offer.TakerGets
                ? parseFloat(offer.TakerGets.value)
                : 0;

            const xrpDrops = typeof offer.TakerPays === "string"
                ? parseFloat(offer.TakerPays)
                : 0;
            const xrpAmount = xrpDrops / 1_000_000;

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

interface SellOrderDialogProps {
    trigger?: React.ReactNode;
}

interface FormErrors {
    apiKey?: string;
    quantity?: string;
    pricePerUnit?: string;
    secret?: string;
    general?: string;
}

export function SellOrderDialog({ trigger }: SellOrderDialogProps) {
    const [open, setOpen] = useState(false);
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

    const handleSubmit = async () => {
        if (!validateForm()) return;

        setIsLoading(true);
        setErrors({});

        try {
            // Get user info from Supabase
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

            const qty = parseFloat(quantity);
            const price = parseFloat(pricePerUnit);
            const totalXrp = qty * price;

            // Connect to XRPL testnet
            const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
            await client.connect();

            try {
                // Step 1: Set up trust line for the token (if not already set up)
                // This allows the wallet to hold GGK tokens
                const trustSetTx: xrpl.TrustSet = {
                    TransactionType: "TrustSet",
                    Account: wallet.address,
                    LimitAmount: {
                        currency: TOKEN_CURRENCY,
                        issuer: ISSUER_ADDRESS,
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

                // Step 2: Request tokens from the issuer via backend
                const issueResponse = await fetch(`${BACKEND_URL}/api/xrpl/issue-tokens`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        recipientAddress: wallet.address,
                        amount: qty,
                    }),
                });

                const issueData = await issueResponse.json();

                if (!issueResponse.ok) {
                    throw new Error(issueData.error || "Failed to receive tokens from issuer");
                }

                // Step 3: Create the sell offer on the DEX
                // Convert XRP to drops (1 XRP = 1,000,000 drops)
                const totalDrops = Math.floor(totalXrp * 1_000_000).toString();

                // Create the OfferCreate transaction
                // TakerGets: What the seller wants to receive (XRP)
                // TakerPays: What the seller is offering (GGK tokens)
                const offerCreateTx: xrpl.OfferCreate = {
                    TransactionType: "OfferCreate",
                    Account: wallet.address,
                    TakerPays: totalDrops, // XRP in drops that seller wants
                    TakerGets: {
                        currency: TOKEN_CURRENCY,
                        value: quantity, // Number of GGK tokens seller is selling
                        issuer: ISSUER_ADDRESS,
                    },
                    Flags: 0, // Normal sell offer
                };

                // Prepare the transaction (adds sequence, fee, etc.)
                const prepared = await client.autofill(offerCreateTx);

                // Get the sequence number for transaction ID
                const sequence = prepared.Sequence;

                // Sign the transaction
                const signed = wallet.sign(prepared);

                // Submit the transaction
                const result = await client.submitAndWait(signed.tx_blob);

                const meta = result.result.meta as xrpl.TransactionMetadata;

                if (
                    typeof meta === "object" &&
                    meta.TransactionResult === "tesSUCCESS"
                ) {
                    // Create transaction ID: wallet address + sequence
                    const transactionId = `${wallet.address}:${sequence}`;

                    // Store the API key and transaction ID in Supabase
                    const { error: insertError } = await supabase
                        .from("api_key_transactions")
                        .insert({
                            api_key: apiKey.trim(),
                            transaction_id: transactionId,
                        });

                    if (insertError) {
                        console.error("Error storing API key transaction:", insertError);
                        throw new Error("Transaction succeeded but failed to store API key record");
                    }

                    // Calculate and store the weighted average price
                    const weightedAvgPrice = await calculateWeightedAveragePrice(client);
                    if (weightedAvgPrice !== null) {
                        const { error: priceInsertError } = await supabase
                            .from("token_prices")
                            .insert({
                                token_name: TOKEN_CURRENCY,
                                price: weightedAvgPrice,
                                price_time: new Date().toISOString(),
                            });

                        if (priceInsertError) {
                            console.error("Error storing token price:", priceInsertError);
                            // Don't throw - the main transaction succeeded
                        }
                    }

                    setTxResult({
                        hash: result.result.hash,
                        transactionId,
                    });
                    setStep("success");
                } else {
                    const errorResult =
                        typeof meta === "object" ? meta.TransactionResult : "Unknown error";
                    throw new Error(`Transaction failed: ${errorResult}`);
                }
            } finally {
                await client.disconnect();
            }
        } catch (error: unknown) {
            console.error("Error creating sell order:", error);
            const errorMessage =
                error instanceof Error ? error.message : "Failed to create sell order";
            setErrors({ general: errorMessage });
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
            <DialogTrigger asChild>
                {trigger || <Button>Create Sell Order</Button>}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                {step === "form" && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Create Sell Order</DialogTitle>
                            <DialogDescription>
                                Sell your {TOKEN_CURRENCY} tokens on the XRP Ledger DEX.
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
                                    Quantity ({TOKEN_CURRENCY} tokens)
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
                                    How many {TOKEN_CURRENCY} tokens you want to sell
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
                                    Price in XRP for each {TOKEN_CURRENCY} token
                                </p>
                            </div>

                            {quantity && pricePerUnit && (
                                <div className="rounded-md bg-muted p-3">
                                    <p className="text-sm font-medium">Order Summary</p>
                                    <p className="text-sm text-muted-foreground">
                                        Selling {quantity} {TOKEN_CURRENCY} for {totalXrp()} XRP
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
                            <Button onClick={handleSubmit} disabled={isLoading}>
                                {isLoading ? "Issuing Tokens & Creating Order..." : "Create Sell Order"}
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
                                    You received {quantity} {TOKEN_CURRENCY} tokens and created a sell order
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Selling {quantity} {TOKEN_CURRENCY} at {pricePerUnit} XRP each
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
