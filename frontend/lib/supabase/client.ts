import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function isValidSupabaseUrl(url: string): boolean {
  return /^https:\/\//.test(url) && url.length > 10;
}

let client: SupabaseClient | null = null;

/**
 * Browser-only Supabase client. Uses cookies (via @supabase/ssr) so the
 * session set in the auth callback is visible after redirect.
 */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (client) return client;
  if (isValidSupabaseUrl(supabaseUrl) && supabaseAnonKey.length > 0) {
    client = createBrowserClient(supabaseUrl, supabaseAnonKey);
    return client;
  }
  return null;
}

