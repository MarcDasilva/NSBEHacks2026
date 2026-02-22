/**
 * Users API Routes
 *
 * GET    /api/users/wallet  — Get user's stored wallet address
 * POST   /api/users/wallet  — Store or update wallet address
 */

import { Router, Request, Response } from "express";
import { getSupabase } from "../services/supabase";

const router = Router();

// ── Get wallet address ────────────────────────────────

router.get("/wallet", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: "Missing query param: userId" });
      return;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("users")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ success: true, walletAddress: data.wallet_address });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Store / update wallet address ─────────────────────

router.post("/wallet", async (req: Request, res: Response) => {
  try {
    const { userId, walletAddress } = req.body;

    if (!userId || !walletAddress) {
      res.status(400).json({
        error: "Missing required fields: userId, walletAddress",
      });
      return;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("users")
      .upsert(
        { id: userId, wallet_address: walletAddress },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Wallet update failed: ${error.message}`);
    }

    res.json({ success: true, user: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
