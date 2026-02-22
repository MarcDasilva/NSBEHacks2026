"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { getSupabase } from "@/lib/supabase/client";
import { API_PROVIDERS } from "@/components/connection-nodes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WalletRow {
  id: string;
  name: string;
}

interface SellRequestRow {
  wallet_id: string;
  provider_id: string;
  transaction_id: string;
  quantity: number;
  price_per_unit: number;
  created_at: string;
}

function formatPrice(price: number) {
  return price.toFixed(8);
}

function formatQuantity(qty: number) {
  return qty.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const FILTER_OPTIONS = [
  { value: "all", label: "All wallets" },
  { value: "has_sell", label: "Has sell orders" },
  { value: "no_sell", label: "No sell orders" },
  ...API_PROVIDERS.map((p) => ({ value: `provider:${p.id}`, label: p.symbol })),
];

const SORT_OPTIONS = [
  { value: "name_az", label: "Wallet name A–Z" },
  { value: "name_za", label: "Wallet name Z–A" },
  { value: "sell_most", label: "Most sell orders" },
  { value: "sell_least", label: "Least sell orders" },
];

export function OrderBookView() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [sellRequests, setSellRequests] = useState<SellRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("name_az");

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser?.id) {
      setWallets([]);
      setSellRequests([]);
      setLoading(false);
      return;
    }
    const [walletsRes, sellRes] = await Promise.all([
      supabase.from("wallets").select("wallet_id, name").eq("user_id", authUser.id).order("created_at"),
      supabase.from("sell_requests").select("wallet_id, provider_id, transaction_id, quantity, price_per_unit, created_at").eq("user_id", authUser.id).order("created_at", { ascending: false }),
    ]);
    if (walletsRes.data) {
      setWallets(
        walletsRes.data.map((r) => ({
          id: r.wallet_id ?? "",
          name: (r.name?.trim() || r.wallet_id) ?? "Unnamed",
        }))
      );
    }
    if (sellRes.data) {
      setSellRequests(
        sellRes.data as SellRequestRow[],
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sellRequestsByWallet = useMemo(
    () =>
      sellRequests.reduce(
        (acc, r) => {
          if (!acc[r.wallet_id]) acc[r.wallet_id] = [];
          acc[r.wallet_id].push(r);
          return acc;
        },
        {} as Record<string, SellRequestRow[]>,
      ),
    [sellRequests],
  );

  const filteredAndSortedWallets = useMemo(() => {
    let list = [...wallets];

    // Filter
    if (filter === "has_sell") {
      list = list.filter((w) => (sellRequestsByWallet[w.id]?.length ?? 0) > 0);
    } else if (filter === "no_sell") {
      list = list.filter((w) => (sellRequestsByWallet[w.id]?.length ?? 0) === 0);
    } else if (filter.startsWith("provider:")) {
      const providerId = filter.slice("provider:".length);
      list = list.filter((w) => {
        const reqs = sellRequestsByWallet[w.id] ?? [];
        return reqs.some((r) => r.provider_id === providerId);
      });
    }

    // Sort
    if (sort === "name_az") {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    } else if (sort === "name_za") {
      list.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: "base" }));
    } else if (sort === "sell_most") {
      list.sort(
        (a, b) =>
          (sellRequestsByWallet[b.id]?.length ?? 0) - (sellRequestsByWallet[a.id]?.length ?? 0),
      );
    } else if (sort === "sell_least") {
      list.sort(
        (a, b) =>
          (sellRequestsByWallet[a.id]?.length ?? 0) - (sellRequestsByWallet[b.id]?.length ?? 0),
      );
    }

    return list;
  }, [wallets, filter, sort, sellRequestsByWallet]);

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
        {/* Search filter and sort dropdowns */}
        {!loading && wallets.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger
                className="h-9 min-w-[160px] border-[#404040] bg-[#252525] text-sm text-white hover:bg-[#2a2a2a] [&>span]:text-white"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent className="border-[#404040] bg-[#252525]">
                {FILTER_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-white focus:bg-[#333] focus:text-white"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger
                className="h-9 min-w-[180px] border-[#404040] bg-[#252525] text-sm text-white hover:bg-[#2a2a2a] [&>span]:text-white"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className="border-[#404040] bg-[#252525]">
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-white focus:bg-[#333] focus:text-white"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[200px] flex-1 items-center justify-center text-sm text-[#888]">
            Loading…
          </div>
        ) : wallets.length === 0 ? (
          <div className="flex min-h-[200px] flex-1 items-center justify-center rounded-lg border border-[#404040] bg-[#252525]/50 p-8 text-center text-sm text-[#888]">
            No wallets. Add a wallet in Billing or Connections to see sell requests here.
          </div>
        ) : filteredAndSortedWallets.length === 0 ? (
          <div className="flex min-h-[200px] flex-1 items-center justify-center rounded-lg border border-[#404040] bg-[#252525]/50 p-8 text-center text-sm text-[#888]">
            No wallets match the current filter.
          </div>
        ) : (
          <div className="grid flex-1 content-start gap-5 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {filteredAndSortedWallets.map((wallet) => {
              const requests = sellRequestsByWallet[wallet.id] ?? [];
              const providerId = requests[0]?.provider_id;
              const provider = providerId ? API_PROVIDERS.find((p) => p.id === providerId) : null;
              return (
                <div
                  key={wallet.id}
                  className="flex flex-col overflow-hidden rounded-lg border border-[#404040] bg-[#252525] shadow-lg"
                >
                  {/* Wallet header */}
                  <div className="border-b border-[#404040] px-4 py-3">
                    <p className="text-sm font-semibold text-white">{wallet.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-[#888]">
                      {wallet.id.slice(0, 8)}…{wallet.id.slice(-4)}
                    </p>
                  </div>
                  {/* API provider */}
                  <div className="border-b border-[#404040] px-4 py-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#888]">
                      API provider
                    </p>
                    {provider ? (
                      <div className="flex items-center gap-2">
                        {provider.logo ? (
                          <Image
                            src={provider.logo}
                            alt=""
                            width={24}
                            height={24}
                            className="h-6 w-6 shrink-0 rounded-full object-contain bg-[#1a1a1a]"
                          />
                        ) : null}
                        <span className="text-sm font-medium text-white">{provider.symbol}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-[#888]">—</span>
                    )}
                  </div>
                  {/* Buy orders */}
                  <div className="flex min-h-0 flex-col px-4 py-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#888]">
                      Buy orders
                    </p>
                    <p className="text-sm text-[#888]">No buy orders for this wallet.</p>
                  </div>
                  {/* Line separating Buy and Sell orders */}
                  <hr className="w-full border-0 border-t border-[#404040]" role="separator" aria-hidden />
                  {/* Sell order details */}
                  <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#888]">
                      Sell orders
                    </p>
                    {requests.length === 0 ? (
                      <p className="text-sm text-[#888]">No sell orders for this wallet.</p>
                    ) : (
                      <div className="max-h-[220px] overflow-auto">
                        <table className="w-full border-collapse text-sm text-white">
                          <thead>
                            <tr className="border-b border-[#404040] text-[#888]">
                              <th className="py-2 text-left text-xs font-medium">Qty</th>
                              <th className="py-2 text-left text-xs font-medium">Price (XRP)</th>
                              <th className="py-2 text-right text-xs font-medium">Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {requests.map((r, i) => (
                              <tr
                                key={r.transaction_id ?? i}
                                className="border-b border-[#404040]/50"
                              >
                                <td className="py-2 tabular-nums">{formatQuantity(r.quantity)}</td>
                                <td className="py-2 tabular-nums">
                                  {formatPrice(Number(r.price_per_unit))}
                                </td>
                                <td className="py-2 text-right text-xs text-[#888]">
                                  {r.created_at
                                    ? new Date(r.created_at).toLocaleDateString()
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
