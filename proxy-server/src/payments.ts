/**
 * Payments Service — Escrow + Usage-Oracle (Bun/postgres.js version)
 *
 * Flow:
 *   1. Buyer sends XRP to the platform wallet (deposit)
 *   2. Backend records the deposit in postgres
 *   3. Proxy reports API usage (calls made by the buyer)
 *   4. Backend releases proportional XRP from platform wallet → seller
 *   5. When deposit is exhausted or expired, buyer can request a refund of the remainder
 */

import { db } from "./database";
import xrpl, { Wallet } from "xrpl";

const XRPL_URL = process.env.XRPL_URL || "wss://s.altnet.rippletest.net:51233";
const PLATFORM_WALLET_SEED = process.env.PLATFORM_WALLET_SEED || "";
const PROXY_HMAC_SECRET = process.env.PROXY_HMAC_SECRET || "";

// ─── XRPL helpers ────────────────────────────────────────

let paymentXrplClient: xrpl.Client | null = null;
let paymentXrplConnected = false;

async function getPaymentXrplClient(): Promise<xrpl.Client> {
  if (!paymentXrplClient) {
    paymentXrplClient = new xrpl.Client(XRPL_URL);
  }
  if (!paymentXrplConnected) {
    await paymentXrplClient.connect();
    paymentXrplConnected = true;
  }
  return paymentXrplClient;
}

function xrpToDrops(xrpAmount: number): string {
  return (xrpAmount * 1_000_000).toString();
}

async function sendPayment(
  fromWallet: Wallet,
  toAddress: string,
  amountXrp: number
): Promise<{ txHash: string }> {
  const client = await getPaymentXrplClient();

  const paymentTx: xrpl.Payment = {
    TransactionType: "Payment",
    Account: fromWallet.address,
    Destination: toAddress,
    Amount: xrpToDrops(amountXrp),
  };

  const result = await client.submitAndWait(paymentTx, { wallet: fromWallet });
  const meta = result.result.meta as any;

  if (meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`Payment failed: ${meta.TransactionResult}`);
  }

  return { txHash: result.result.hash };
}

// ─── HMAC verification ──────────────────────────────────

async function verifyHmac(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  // Bun has native crypto via Web Crypto API
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expectedHex === signature;
}

// ─── Types ───────────────────────────────────────────────

export interface PaymentRecord {
  id: string;
  buyer_wallet: string;
  seller_wallet: string;
  listing_id: string;
  deposit_tx_hash: string;
  deposit_amount_xrp: number;
  released_amount_xrp: number;
  remaining_amount_xrp: number;
  price_per_call_xrp: number;
  status: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface UsageLogRecord {
  id: string;
  payment_id: string;
  listing_id: string;
  buyer_wallet: string;
  calls_reported: number;
  amount_released_xrp: number;
  release_tx_hash: string | null;
  idempotency_key: string;
  created_at: string;
}

// ─── Queries ─────────────────────────────────────────────

export async function recordDeposit(input: {
  buyerWallet: string;
  sellerWallet: string;
  listingId: string;
  depositTxHash: string;
  depositAmountXrp: number;
  pricePerCallXrp: number;
  expiresInHours?: number;
}): Promise<PaymentRecord> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (input.expiresInHours ?? 720));

  const rows = await db`
    INSERT INTO payments (
      buyer_wallet, seller_wallet, listing_id,
      deposit_tx_hash, deposit_amount_xrp,
      released_amount_xrp, remaining_amount_xrp,
      price_per_call_xrp, status, expires_at
    ) VALUES (
      ${input.buyerWallet}, ${input.sellerWallet}, ${input.listingId},
      ${input.depositTxHash}, ${input.depositAmountXrp},
      0, ${input.depositAmountXrp},
      ${input.pricePerCallXrp}, 'active', ${expiresAt.toISOString()}
    )
    RETURNING *
  `;

  return rows[0] as PaymentRecord;
}

export async function reportUsage(input: {
  listingId: string;
  buyerWallet: string;
  callsReported: number;
  idempotencyKey: string;
  hmacSignature: string;
}): Promise<UsageLogRecord> {
  // 1. Verify HMAC
  if (!PROXY_HMAC_SECRET) throw new Error("PROXY_HMAC_SECRET not configured");

  const payload = `${input.listingId}:${input.buyerWallet}:${input.callsReported}:${input.idempotencyKey}`;
  const valid = await verifyHmac(payload, input.hmacSignature, PROXY_HMAC_SECRET);

  if (!valid) {
    throw new Error("Invalid HMAC signature — request rejected");
  }

  // 2. Find active payment
  const payments = await db`
    SELECT * FROM payments
    WHERE listing_id = ${input.listingId}
      AND buyer_wallet = ${input.buyerWallet}
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (payments.length === 0) {
    throw new Error("No active payment found for this listing + buyer");
  }

  const payment = payments[0] as PaymentRecord;

  // 3. Calculate release amount
  const releaseAmountXrp = parseFloat(
    (input.callsReported * Number(payment.price_per_call_xrp)).toFixed(6)
  );

  if (releaseAmountXrp <= 0) {
    throw new Error("Nothing to release (0 calls)");
  }

  const actualRelease = Math.min(releaseAmountXrp, Number(payment.remaining_amount_xrp));

  if (actualRelease <= 0) {
    throw new Error("Payment balance exhausted — no funds to release");
  }

  // 4. Send XRP from platform wallet → seller
  if (!PLATFORM_WALLET_SEED) throw new Error("PLATFORM_WALLET_SEED not configured");
  const platformWallet = Wallet.fromSeed(PLATFORM_WALLET_SEED);

  const paymentResult = await sendPayment(
    platformWallet,
    payment.seller_wallet,
    actualRelease
  );

  // 5. Log the usage (idempotency enforced by UNIQUE constraint)
  let usageLog: UsageLogRecord;
  try {
    const rows = await db`
      INSERT INTO usage_logs (
        payment_id, listing_id, buyer_wallet,
        calls_reported, amount_released_xrp, release_tx_hash,
        idempotency_key
      ) VALUES (
        ${payment.id}, ${input.listingId}, ${input.buyerWallet},
        ${input.callsReported}, ${actualRelease}, ${paymentResult.txHash},
        ${input.idempotencyKey}
      )
      RETURNING *
    `;
    usageLog = rows[0] as UsageLogRecord;
  } catch (err: any) {
    if (err.code === "23505") {
      throw new Error("Duplicate usage report — already processed");
    }
    throw err;
  }

  // 6. Update payment balances
  const newReleased = parseFloat(
    (Number(payment.released_amount_xrp) + actualRelease).toFixed(6)
  );
  const newRemaining = parseFloat(
    (Number(payment.remaining_amount_xrp) - actualRelease).toFixed(6)
  );
  const newStatus = newRemaining <= 0 ? "exhausted" : "active";

  await db`
    UPDATE payments
    SET released_amount_xrp = ${newReleased},
        remaining_amount_xrp = ${newRemaining},
        status = ${newStatus},
        updated_at = now()
    WHERE id = ${payment.id}
  `;

  return usageLog;
}

export async function getPaymentStatus(
  listingId: string,
  buyerWallet: string
): Promise<{ payment: PaymentRecord; usageLogs: UsageLogRecord[] }> {
  const payments = await db`
    SELECT * FROM payments
    WHERE listing_id = ${listingId}
      AND buyer_wallet = ${buyerWallet}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (payments.length === 0) {
    throw new Error("No payment found for this listing + buyer");
  }

  const payment = payments[0] as PaymentRecord;

  const usageLogs = await db`
    SELECT * FROM usage_logs
    WHERE payment_id = ${payment.id}
    ORDER BY created_at ASC
  `;

  return {
    payment,
    usageLogs: usageLogs as UsageLogRecord[],
  };
}

export async function refundUnused(
  listingId: string,
  buyerWallet: string
): Promise<{ refundAmountXrp: number; txHash: string }> {
  const payments = await db`
    SELECT * FROM payments
    WHERE listing_id = ${listingId}
      AND buyer_wallet = ${buyerWallet}
      AND status IN ('active', 'expired')
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (payments.length === 0) {
    throw new Error("No refundable payment found");
  }

  const payment = payments[0] as PaymentRecord;

  if (Number(payment.remaining_amount_xrp) <= 0) {
    throw new Error("No remaining balance to refund");
  }

  if (!PLATFORM_WALLET_SEED) throw new Error("PLATFORM_WALLET_SEED not configured");
  const platformWallet = Wallet.fromSeed(PLATFORM_WALLET_SEED);

  const paymentResult = await sendPayment(
    platformWallet,
    buyerWallet,
    Number(payment.remaining_amount_xrp)
  );

  await db`
    UPDATE payments
    SET remaining_amount_xrp = 0,
        status = 'refunded',
        updated_at = now()
    WHERE id = ${payment.id}
  `;

  return {
    refundAmountXrp: Number(payment.remaining_amount_xrp),
    txHash: paymentResult.txHash,
  };
}

export async function getSellerPayments(
  sellerWallet: string
): Promise<PaymentRecord[]> {
  const rows = await db`
    SELECT * FROM payments
    WHERE seller_wallet = ${sellerWallet}
    ORDER BY created_at DESC
  `;
  return rows as PaymentRecord[];
}

export async function getBuyerPayments(
  buyerWallet: string
): Promise<PaymentRecord[]> {
  const rows = await db`
    SELECT * FROM payments
    WHERE buyer_wallet = ${buyerWallet}
    ORDER BY created_at DESC
  `;
  return rows as PaymentRecord[];
}
