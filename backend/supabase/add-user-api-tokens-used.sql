-- Add tokens_used to user_api_tokens for Usage view (tracks consumed tokens; usage % = tokens_used / (token_amount + tokens_used))
-- Run this in Supabase SQL Editor if your user_api_tokens table doesn't have tokens_used yet.

ALTER TABLE user_api_tokens
ADD COLUMN IF NOT EXISTS tokens_used NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_api_tokens.tokens_used IS 'Tokens consumed/used for API calls; usage_pct = tokens_used / (token_amount + tokens_used) * 100';
