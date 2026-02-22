/**
 * Users API Routes
 *
 * GET    /api/users/wallet          — Get user's wallet address (by user ID)
 * POST   /api/users/wallet          — Store/update user's wallet address
 */

import { Router, Request, Response } from "express";
import { getSupabase } from "../services/supabase";

const router = Router();

// ── Get User Wallet ────────────────────────────────────
// Pass user_id as query parameter (from Supabase auth)

router.get("/wallet", async (req: Request, res: Response) => {
  try {
    const userId = req.query.user_id as string;

    if (!userId) {
      res.status(400).json({ error: "Missing user_id query parameter" });
      return;
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("user_wallets")
      .select("wallet_address")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Wallet not found for this user" });
      return;
    }

    res.json({ wallet_address: data.wallet_address });
  } catch (error: any) {
    console.error("Error fetching wallet:", error.message);
    res.status(500).json({ error: "Failed to fetch wallet" });
  }
});

// ── Store/Update User Wallet ───────────────────────────

router.post("/wallet", async (req: Request, res: Response) => {
  try {
    const { user_id, wallet_address } = req.body;

    if (!user_id || !wallet_address) {
      res.status(400).json({
        error: "Missing required fields: user_id, wallet_address",
      });
      return;
    }

    const supabase = getSupabase();

    // Upsert: insert or update if exists
    const { data, error } = await supabase
      .from("user_wallets")
      .upsert(
        { user_id, wallet_address, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error storing wallet:", error.message);
      res.status(500).json({ error: "Failed to store wallet" });
      return;
    }

    res.status(201).json({ success: true, wallet_address: data.wallet_address });
  } catch (error: any) {
    console.error("Error storing wallet:", error.message);
    res.status(500).json({ error: "Failed to store wallet" });
  }
});

export default router;
