import { type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on dashboard so unauthenticated users are redirected to landing.
     * Exclude static files and API routes.
     */
    "/dashboard/:path*",
  ],
};
