import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function isValidSupabaseUrl(url: string): boolean {
  return /^https:\/\//.test(url) && url.length > 10;
}

/**
 * Create a Supabase client for Route Handlers and Server Components.
 * Uses cookies so the session is stored and sent with requests.
 */
export async function createSupabaseServerClient() {
  if (!isValidSupabaseUrl(supabaseUrl) || !supabaseAnonKey.length) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options ?? {})
        );
      },
    },
  });
}
