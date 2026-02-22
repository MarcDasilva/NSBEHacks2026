"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { IconCopy, IconEye, IconEyeOff } from "@tabler/icons-react";
import { getSupabase } from "@/lib/supabase/client";
import { API_PROVIDERS } from "@/components/connection-nodes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

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

interface ProxyKeyRow {
  proxy_key: string;
  real_key: string;
  token_type: string;
  wallet_id: string | null;
  created_at: string | null;
}

function maskKey(key: string): string {
  if (key.length <= 10) return "••••••••";
  return key.slice(0, 4) + "••••••••••••••••••••••••••••" + key.slice(-4);
}

function ProxyKeyCell({ row }: { row: ProxyKeyRow }) {
  const [visible, setVisible] = useState(false);
  const display = visible ? row.proxy_key : maskKey(row.proxy_key);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(row.proxy_key);
    toast.success("Proxy key copied to clipboard", { position: "bottom-right" });
  }, [row.proxy_key]);

  return (
    <div className="flex items-center gap-2 rounded border border-[#404040] bg-[#1a1a1a] px-3 py-2 font-mono text-sm">
      <span className="min-w-0 flex-1 truncate text-white" title={visible ? undefined : "Click eye to reveal"}>
        {display}
      </span>
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="shrink-0 rounded p-1.5 text-[#888] hover:bg-[#333] hover:text-white"
        aria-label={visible ? "Hide key" : "Show key"}
      >
        {visible ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
      </button>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded p-1.5 text-[#888] hover:bg-[#333] hover:text-white"
        aria-label="Copy to clipboard"
      >
        <IconCopy className="size-4" />
      </button>
    </div>
  );
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
  const [proxyKeys, setProxyKeys] = useState<ProxyKeyRow[]>([]);
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
      setProxyKeys([]);
      setLoading(false);
      return;
    }
    const [walletsRes, sellRes, proxyRes] = await Promise.all([
      supabase.from("wallets").select("wallet_id, name").eq("user_id", authUser.id).order("created_at"),
      supabase.from("sell_requests").select("wallet_id, provider_id, transaction_id, quantity, price_per_unit, created_at").eq("user_id", authUser.id).order("created_at", { ascending: false }),
      supabase.from("proxy_api_keys").select("proxy_key, real_key, token_type, wallet_id, created_at").eq("user_id", authUser.id).order("created_at", { ascending: false }),
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
    if (proxyRes.error) {
      console.warn("Order book: could not load proxy_api_keys", proxyRes.error);
    }
    if (proxyRes.data) {
      setProxyKeys(
        (proxyRes.data as ProxyKeyRow[]).map((r) => ({
          proxy_key: r.proxy_key ?? "",
          real_key: r.real_key ?? "",
          token_type: r.token_type ?? "",
          wallet_id: r.wallet_id ?? null,
          created_at: r.created_at ?? null,
        })),
      );
    } else {
      setProxyKeys([]);
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

  const proxyKeysByWallet = useMemo(
    () =>
      proxyKeys.reduce(
        (acc, r) => {
          const wid = (r.wallet_id ?? "").trim() || "__unassigned__";
          if (!acc[wid]) acc[wid] = [];
          acc[wid].push(r);
          return acc;
        },
        {} as Record<string, ProxyKeyRow[]>,
      ),
    [proxyKeys],
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
          <div className="flex flex-1 flex-col gap-5">
            {proxyKeys.length > 0 && (
              <div className="rounded-lg border border-[#404040] bg-[#252525] p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#888]">Buy orders</p>
                <div className="max-h-[280px] space-y-3 overflow-auto">
                  {proxyKeys.map((row) => (
                    <div key={row.proxy_key} className="rounded border border-[#404040]/50 bg-[#1a1a1a] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        {row.token_type ? (
                          <span className="rounded bg-[#333] px-2 py-0.5 text-xs font-medium text-white">{row.token_type}</span>
                        ) : null}
                        <span className="text-xs text-[#888]">
                          {row.created_at ? new Date(row.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </span>
                      </div>
                      <ProxyKeyCell row={row} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex min-h-[200px] flex-1 items-center justify-center rounded-lg border border-[#404040] bg-[#252525]/50 p-8 text-center text-sm text-[#888]">
              No wallets. Add a wallet in Billing or Connections to see sell requests here.
            </div>
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
                  {/* Buy orders — proxy keys from buy orders for this wallet (incl. unassigned on first card) */}
                  <div className="flex min-h-0 flex-col px-4 py-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#888]">
                      Buy orders
                    </p>
                    {(() => {
                      const forWallet = proxyKeysByWallet[wallet.id] ?? [];
                      const unassigned = proxyKeysByWallet["__unassigned__"] ?? [];
                      const isFirstWallet = filteredAndSortedWallets[0]?.id === wallet.id;
                      const list = isFirstWallet ? [...unassigned, ...forWallet] : forWallet;
                      if (list.length === 0) {
                        return <p className="text-sm text-[#888]">No buy orders for this wallet.</p>;
                      }
                      return (
                      <div className="max-h-[220px] space-y-3 overflow-auto">
                        {list.map((row) => (
                          <div
                            key={row.proxy_key}
                            className="rounded border border-[#404040]/50 bg-[#1a1a1a] p-2"
                          >
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              {row.token_type ? (
                                <span className="rounded bg-[#333] px-2 py-0.5 text-xs font-medium text-white">
                                  {row.token_type}
                                </span>
                              ) : null}
                              <span className="text-xs text-[#888]">
                                {row.created_at
                                  ? new Date(row.created_at).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })
                                  : "—"}
                              </span>
                            </div>
                            <ProxyKeyCell row={row} />
                          </div>
                        ))}
                      </div>
                      );
                    })()}
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
