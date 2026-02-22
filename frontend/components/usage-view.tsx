"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

/** Row from user_api_tokens: id, user_id, token_name, token_amount, tokens_used (optional), created_at, updated_at */
interface UsageRow {
  id: string;
  user_id: string;
  token_name: string;
  token_amount: number;
  tokens_used?: number;
  created_at: string;
  updated_at: string;
}

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function usagePercent(used: number, balance: number): number {
  const total = balance + used;
  if (total <= 0) return 0;
  return (used / total) * 100;
}

export function UsageView() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    // Select with tokens_used if column exists (after migration)
    let data: (UsageRow & { tokens_used?: number })[] | null = null;
    let error: { message?: string } | null = null;
    const res = await supabase
      .from("user_api_tokens")
      .select("id, user_id, token_name, token_amount, tokens_used, created_at, updated_at")
      .eq("user_id", authUser.id)
      .order("token_name");
    error = res.error;
    data = res.data;

    // If column tokens_used doesn't exist yet, retry without it
    if (error?.message?.includes("tokens_used")) {
      const fallback = await supabase
        .from("user_api_tokens")
        .select("id, user_id, token_name, token_amount, created_at, updated_at")
        .eq("user_id", authUser.id)
        .order("token_name");
      error = fallback.error;
      data = fallback.data;
    }

    if (error) {
      console.warn("Usage: could not load user_api_tokens", error);
      setRows([]);
    } else {
      setRows(
        (data ?? []).map((r) => ({
          id: r.id ?? "",
          user_id: r.user_id ?? "",
          token_name: r.token_name ?? "",
          token_amount: Number(r.token_amount ?? 0),
          tokens_used: r.tokens_used != null ? Number(r.tokens_used) : undefined,
          created_at: r.created_at ?? "",
          updated_at: r.updated_at ?? "",
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div
      className="flex h-full w-full overflow-hidden"
      style={{
        fontFamily: "var(--font-geist-sans)",
        background: "#1a1a1a",
        color: "#fff",
      }}
    >
      <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-auto p-6">
        {loading ? (
          <div className="flex min-h-[200px] flex-1 items-center justify-center text-sm text-[#888]">
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[200px] flex-1 items-center justify-center rounded-lg border border-[#404040] bg-[#252525]/50 p-8 text-center text-sm text-[#888]">
            No token usage yet. Buy tokens from the Order Book or Connections to see usage here.
          </div>
        ) : (
          <>
            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-[#888]">
              Token usage by API (balance, used, and usage %)
            </p>
            <div className="rounded-lg border border-[#404040] bg-[#252525] overflow-hidden">
              <table className="w-full border-collapse text-sm text-white">
                <thead>
                  <tr className="border-b border-[#404040] bg-[#1a1a1a] text-left text-[#888]">
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">Token</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-right">
                      Balance
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-right">
                      Used
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-right">
                      Usage %
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-right">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const used = r.tokens_used ?? 0;
                    const pct = usagePercent(used, r.token_amount);
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-[#404040]/50 hover:bg-[#252525]"
                      >
                        <td className="px-4 py-3 font-medium text-white">
                          <span className="rounded bg-[#333] px-2 py-0.5 text-sm">
                            {r.token_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-white">
                          {formatNumber(r.token_amount)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-white">
                          {r.tokens_used != null ? formatNumber(r.tokens_used) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-white">
                          {r.tokens_used != null ? `${pct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-[#888]">
                          {r.updated_at
                            ? new Date(r.updated_at).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
