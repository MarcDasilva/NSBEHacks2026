-- ═══════════════════════════════════════════════
-- Escrow + Usage-Oracle — Additional Tables
-- ═══════════════════════════════════════════════
-- Run this in your Supabase SQL Editor AFTER
-- the existing schema.sql.
-- ═══════════════════════════════════════════════

-- Payments: tracks buyer deposits and seller releases
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties
  buyer_wallet TEXT NOT NULL,
  seller_wallet TEXT NOT NULL,
  listing_id TEXT NOT NULL,

  -- Deposit info (buyer → platform)
  deposit_tx_hash TEXT NOT NULL,
  deposit_amount_xrp NUMERIC NOT NULL,

  -- Release tracking (platform → seller)
  released_amount_xrp NUMERIC NOT NULL DEFAULT 0,
  remaining_amount_xrp NUMERIC NOT NULL,  -- = deposit - released

  -- Pricing config
  price_per_call_xrp NUMERIC NOT NULL,    -- how much XRP per API call

  -- Status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'exhausted', 'refunded', 'expired')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ             -- auto-refund after this time
);

-- Usage logs: immutable audit trail from proxy
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  payment_id UUID NOT NULL REFERENCES payments(id),
  listing_id TEXT NOT NULL,
  buyer_wallet TEXT NOT NULL,

  -- Usage details
  calls_reported INTEGER NOT NULL,
  amount_released_xrp NUMERIC NOT NULL,
  release_tx_hash TEXT,

  -- Idempotency
  idempotency_key TEXT UNIQUE NOT NULL,   -- prevent duplicate releases

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_buyer ON payments(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_payments_seller ON payments(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_payments_listing ON payments(listing_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_usage_logs_payment ON usage_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_idempotency ON usage_logs(idempotency_key);
