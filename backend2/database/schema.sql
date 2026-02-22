CREATE TABLE public.proxy_api_keys (
    proxy_key TEXT PRIMARY KEY,
    real_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

create table public.wallets (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  name text not null,
  wallet_id text not null,
  created_at timestamp with time zone null default now(),
  constraint wallets_pkey primary key (id),
  constraint wallets_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_wallets_user on public.wallets using btree (user_id) TABLESPACE pg_default;

create table public.users (
  id uuid not null,
  display_name text null,
  phone text null,
  avatar_url text null,
  updated_at timestamp with time zone null default now(),
  constraint users_pkey primary key (id),
  constraint users_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

-- Table to track API token amounts for each user
CREATE TABLE public.user_api_tokens (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    token_name TEXT NOT NULL,
    token_amount INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
    CONSTRAINT user_api_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT user_api_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_user_api_tokens_user ON public.user_api_tokens USING btree (user_id) TABLESPACE pg_default;

-- Table to store API keys and transaction IDs
CREATE TABLE public.api_key_transactions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    api_key TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
    CONSTRAINT api_key_transactions_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_api_key_transactions_api_key ON public.api_key_transactions USING btree (api_key) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_api_key_transactions_transaction_id ON public.api_key_transactions USING btree (transaction_id) TABLESPACE pg_default;

-- Table to store token prices at specific time points
CREATE TABLE public.token_prices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    token_name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    price_time TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
    CONSTRAINT token_prices_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_token_prices_token_name ON public.token_prices USING btree (token_name) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_token_prices_price_time ON public.token_prices USING btree (price_time) TABLESPACE pg_default;
