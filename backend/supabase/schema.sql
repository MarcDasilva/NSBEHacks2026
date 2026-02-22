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
  nft_token_id TEXT UNIQUE,-- ═══════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════
-- Users & Wallets (profile + billing)
-- ═══════════════════════════════════════════════
-- For profile picture uploads, create a storage bucket "avatars" (public) in
-- Supabase Dashboard > Storage. The app uploads to avatars/<user_id>/avatar.<ext>
-- users: one row per auth user (id = auth.uid())
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- wallets: billing wallets per user (name + wallet_id + wallet_secret)
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  wallet_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

-- RLS: users can only read/update/insert their own row
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_insert_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON users DROP POLICY IF EXISTS "wallets_select_own" ON wallets;
DROP POLICY IF EXISTS "wallets_insert_own" ON wallets;
DROP POLICY IF EXISTS "wallets_update_own" ON wallets;
DROP POLICY IF EXISTS "wallets_delete_own" ON wallets;
CREATE POLICY "wallets_select_own" ON wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wallets_insert_own" ON wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wallets_update_own" ON wallets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "wFOR UPDATE USING (auth.uid() = id);

-- RLS: users can only manage their own wallets
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallets_select_own" ON wallets;
DROP POLICY IF EXISTS "wallets_insert_own" ON wallets;
DROP POLICY IF EXISTS "wallets_update_own" ON wallets;
DROP POLICY IF EXISTS "wallets_delete_own" ON wallets;
CREATE POLICY "wallets_select_own" ON wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wallets_insert_own" ON wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wallets_update_own" ON wallets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "wallets_delete_own" ON wallets FOR DELETE USING (auth.uid() = user_id);

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

-- ═══════════════════════════════════════════════
-- Users & Wallets (profile + billing)
-- ═══════════════════════════════════════════════
-- For profile picture uploads, create a storage bucket "avatars" (public) in
-- Supabase Dashboard > Storage. The app uploads to avatars/<user_id>/avatar.<ext>
-- users: one row per auth user (id = auth.uid())
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- wallets: billing wallets per user (name + wallet_id + wallet_secret)
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  wallet_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

-- Add wallet_secret column for existing DBs that had wallets before this migration
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS wallet_secret TEXT;

-- RLS: users can only read/update/insert their own row
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_insert_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);

-- RLS: users can only manage their own wallets
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallets_select_own" ON wallets;
DROP POLICY IF EXISTS "wallets_insert_own" ON wallets;
DROP POLICY IF EXISTS "wallets_update_own" ON wallets;
DROP POLICY IF EXISTS "wallets_delete_own" ON wallets;
CREATE POLICY "wallets_select_own" ON wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wallets_insert_own" ON wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wallets_update_own" ON wallets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "wallets_delete_own" ON wallets FOR DELETE USING (auth.uid() = user_id);

-- user_favourite_tickers: which tickers (by id) a user has flagged in Browse APIs
CREATE TABLE IF NOT EXISTS user_favourite_tickers (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, ticker_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favourite_tickers_user ON user_favourite_tickers(user_id);

ALTER TABLE user_favourite_tickers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_fav_tickers_select_own" ON user_favourite_tickers;
DROP POLICY IF EXISTS "user_fav_tickers_insert_own" ON user_favourite_tickers;
DROP POLICY IF EXISTS "user_fav_tickers_delete_own" ON user_favourite_tickers;
CREATE POLICY "user_fav_tickers_select_own" ON user_favourite_tickers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_fav_tickers_insert_own" ON user_favourite_tickers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_fav_tickers_delete_own" ON user_favourite_tickers FOR DELETE USING (auth.uid() = user_id);

-- token_prices: historical price data per token for charts (token_name, price, price_time)
CREATE TABLE IF NOT EXISTS token_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  price_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_prices_token_name ON token_prices(token_name);
CREATE INDEX IF NOT EXISTS idx_token_prices_price_time ON token_prices(price_time);

ALTER TABLE token_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "token_prices_select_all" ON token_prices;
CREATE POLICY "token_prices_select_all" ON token_prices FOR SELECT USING (true);

-- Enable Realtime for token_prices so the chart can subscribe to live updates.
-- If this errors with "already in publication", the table is already enabled.
ALTER PUBLICATION supabase_realtime ADD TABLE token_prices;
