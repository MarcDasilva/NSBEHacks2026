-- ═══════════════════════════════════════════════
-- API Key Marketplace — Supabase Schema
-- ═══════════════════════════════════════════════
-- Run this in your Supabase SQL Editor to create
-- the tables.
-- ═══════════════════════════════════════════════

-- Listings: each row = one API key listed for sale
-- The NFT on XRPL is the proof-of-purchase token.
-- The actual API key is stored here, encrypted.
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Seller info
  seller_wallet TEXT NOT NULL,

  -- API key details (encrypted at rest)
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'other',
  api_provider TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  base_url TEXT NOT NULL,

  -- Pricing & availability
  price_xrp NUMERIC NOT NULL,
  total_slots INTEGER NOT NULL DEFAULT 1,
  remaining_slots INTEGER NOT NULL DEFAULT 1,

  -- XRPL references
  nft_token_id TEXT UNIQUE,
  sell_offer_id TEXT,
  seller_seed TEXT,  -- stored encrypted; needed to mint on behalf of seller

  -- Status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'sold_out', 'paused', 'revoked')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Purchases: tracks who bought which listing via XRPL
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who bought it
  buyer_wallet TEXT NOT NULL,

  -- What they bought
  listing_id UUID NOT NULL REFERENCES listings(id),

  -- XRPL proof
  nft_token_id TEXT NOT NULL,
  buy_tx_hash TEXT,
  sell_offer_id TEXT,

  -- Usage tracking
  requests_used INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_nft ON listings(nft_token_id);
CREATE INDEX IF NOT EXISTS idx_purchases_buyer ON purchases(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_purchases_listing ON purchases(listing_id);
CREATE INDEX IF NOT EXISTS idx_purchases_nft ON purchases(nft_token_id);

-- Unique: one purchase per buyer per listing
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_unique
  ON purchases(buyer_wallet, listing_id);
