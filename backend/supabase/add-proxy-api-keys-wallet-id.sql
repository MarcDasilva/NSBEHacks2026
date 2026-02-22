-- Add wallet_id to proxy_api_keys so buy orders (proxy keys) can be shown per wallet in Order Book.
-- Run this in Supabase SQL Editor if your proxy_api_keys table does not yet have wallet_id.

ALTER TABLE public.proxy_api_keys
  ADD COLUMN IF NOT EXISTS wallet_id text NULL;

COMMENT ON COLUMN public.proxy_api_keys.wallet_id IS 'Links this proxy key to a wallet for Order Book buy orders section.';

-- Ensure users can read their own proxy_api_keys (required for Order Book to show proxy keys).
ALTER TABLE public.proxy_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proxy_api_keys_select_own" ON public.proxy_api_keys;
CREATE POLICY "proxy_api_keys_select_own" ON public.proxy_api_keys
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "proxy_api_keys_insert_own" ON public.proxy_api_keys;
CREATE POLICY "proxy_api_keys_insert_own" ON public.proxy_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);
