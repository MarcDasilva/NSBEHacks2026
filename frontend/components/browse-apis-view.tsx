"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconFlagFilled,
  IconPlus,
  IconLayoutGrid,
  IconDots,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { getSupabase } from "@/lib/supabase/client";
import * as xrpl from "xrpl";
import { getTokenConfig, XRPL_SERVER, TICKER_LEGEND } from "@/lib/token-config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getApiKeyForWallet, submitSellOrder } from "@/components/sell-order-dialog";
import { executeBuyOrder } from "@/components/buy-order-dialog";
import { motion } from "motion/react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

type NewsItem = {
  id: string;
  url: string;
  headline: string;
  source: string;
  timeAgo: string;
};


/** Wraps content in motion.span; when key (e.g. value) changes, animates in. */
function AnimatedValue({
  valueKey,
  className,
  style,
  children,
}: {
  valueKey: string | number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <motion.span
      key={valueKey}
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={className}
      style={style}
    >
      {children}
    </motion.span>
  );
}

type TickerRow = {
  id: string;
  symbol: string;
  logo?: string; // path under /logos/
  icon?: string; // fallback letter when no logo
  last: number;
  chg: number;
  chgPct: number;
  favourited?: boolean;
};

const MOCK_BROWSE_TICKERS: TickerRow[] = [
  {
    id: "openai",
    symbol: "OpenAI",
    logo: "/logos/openai-white.png",
    last: 25.01,
    chg: 0.2,
    chgPct: 0.8,
  },
  {
    id: "anthropic",
    symbol: "Anthropic",
    logo: "/logos/claude-color.png",
    last: 18.5,
    chg: -0.47,
    chgPct: -2.55,
  },
  {
    id: "google",
    symbol: "Google AI",
    logo: "/logos/gemini-color.png",
    last: 142.3,
    chg: 1.24,
    chgPct: 0.87,
  },
  {
    id: "twilio",
    symbol: "Twilio",
    logo: "/logos/Twilio-Symbol.png",
    last: 52.4,
    chg: -1.84,
    chgPct: -3.4,
  },
  {
    id: "elevenlabs",
    symbol: "ElevenLabs",
    logo: "/logos/elevenlabs-symbol.svg",
    last: 12.8,
    chg: 0.15,
    chgPct: 1.19,
  },
  {
    id: "mistral",
    symbol: "Mistral",
    logo: "/logos/mistral.png",
    last: 34.2,
    chg: 0.71,
    chgPct: 2.12,
  },
  {
    id: "cohere",
    symbol: "Cohere",
    logo: "/logos/cohere.png",
    last: 8.5,
    chg: 0.22,
    chgPct: 2.66,
  },
  {
    id: "polygon",
    symbol: "Polygon",
    logo: "/logos/polygon.jpeg",
    last: 89.2,
    chg: 0.71,
    chgPct: 0.8,
  },
  {
    id: "deepl",
    symbol: "DeepL",
    logo: "/logos/DeepL-Icon-Logo-Vector.svg--240x300.png",
    last: 22.0,
    chg: -0.1,
    chgPct: -0.45,
  },
  {
    id: "gradium",
    symbol: "Gradium",
    logo: "/logos/gradium.png",
    last: 14.2,
    chg: 0.31,
    chgPct: 2.23,
  },
  {
    id: "alpha-vantage",
    symbol: "Alpha Vantage",
    logo: "/logos/alpha%20vantage.png",
    last: 6.8,
    chg: -0.12,
    chgPct: -1.73,
  },
  {
    id: "gecko",
    symbol: "Gecko",
    logo: "/logos/gecko-405ed53b475f61244130f95742a07da15f7ac30feeed5072812ae5c2d73b6194.svg",
    last: 19.4,
    chg: 0.88,
    chgPct: 4.75,
  },
  {
    id: "google-maps",
    symbol: "Google Maps",
    logo: "/logos/Google_Maps_icon_(2020).svg.png",
    last: 98.0,
    chg: 1.2,
    chgPct: 1.24,
  },
  {
    id: "clearbit",
    symbol: "Clearbit",
    logo: "/logos/clearbit.webp",
    last: 11.5,
    chg: 0.05,
    chgPct: 0.44,
  },
];

const ALL_TICKERS = MOCK_BROWSE_TICKERS;

function computeLastChgFromData(
  data: { timeMs: number; price: number }[]
): { last: number; chg: number; chgPct: number } | null {
  if (data.length === 0) return null;
  const lastPoint = data[data.length - 1];
  const last = lastPoint.price;
  const d = new Date(lastPoint.timeMs);
  const todayStartUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const yesterdayStartUtc = todayStartUtc - 24 * 60 * 60 * 1000;
  const yesterdayEndUtc = todayStartUtc - 1;
  let lastPriceYesterday = last;
  for (let i = data.length - 1; i >= 0; i--) {
    const t = data[i].timeMs;
    if (t >= yesterdayStartUtc && t <= yesterdayEndUtc) {
      lastPriceYesterday = data[i].price;
      break;
    }
  }
  if (lastPriceYesterday === last) {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].timeMs < todayStartUtc) {
        lastPriceYesterday = data[i].price;
        break;
      }
    }
  }
  const chg = last - lastPriceYesterday;
  const chgPct = lastPriceYesterday !== 0 ? (chg / lastPriceYesterday) * 100 : 0;
  return { last, chg, chgPct };
}

/** Re-export for consumers that need ticker id → token_name. */
export { TICKER_LEGEND } from "@/lib/token-config";

/** token_name -> ticker id for looking up live prices */
const ID_BY_TOKEN: Record<string, string> = Object.fromEntries(
  Object.entries(TICKER_LEGEND).map(([id, name]) => [name, id])
);

export function BrowseApisView() {
  const [tickers, setTickers] = useState<TickerRow[]>([]);
  const [favourites, setFavourites] = useState<TickerRow[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredFavId, setHoveredFavId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<TickerRow | null>(null);
  const [graphPanelVisible, setGraphPanelVisible] = useState(false);
  const [quoteAsset, setQuoteAsset] = useState<string>("XRP");
  const [chartData, setChartData] = useState<{ time: string; timeMs: number; price: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartRange, setChartRange] = useState<"10m" | "1H" | "1D" | "1W" | "1M" | "1Y">("1H");
  const [sellOrBuy, setSellOrBuy] = useState<"sell" | "buy">("sell");
  const [sellPrice, setSellPrice] = useState("");
  const [sellTokenCount, setSellTokenCount] = useState("");
  const [sellWalletId, setSellWalletId] = useState<string>("");
  const [wallets, setWallets] = useState<{ id: string; name: string }[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, { last: number; chg: number; chgPct: number }>>({});
  const [panelNews, setPanelNews] = useState<NewsItem[]>([]);
  const [panelNewsLoading, setPanelNewsLoading] = useState(false);
  const [sellError, setSellError] = useState("");
  const [sellSuccess, setSellSuccess] = useState("");
  const [sellLoading, setSellLoading] = useState(false);
  const [buyLoading, setBuyLoading] = useState(false);
  const [bestBuyPrice, setBestBuyPrice] = useState<number | null>(null);
  const [bestBuyPriceLoading, setBestBuyPriceLoading] = useState(false);

  const QUOTE_OPTIONS = [
    { value: "XRP", label: "XRP" },
    { value: "USDT", label: "USDT" },
    { value: "USDC", label: "USDC" },
    { value: "DAI", label: "DAI" },
    { value: "BUSD", label: "BUSD" },
    { value: "TUSD", label: "TUSD" },
  ];

  const loadWallets = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser?.id) return;
    const { data: rows, error } = await supabase
      .from("wallets")
      .select("name, wallet_id")
      .eq("user_id", authUser.id)
      .order("created_at");
    if (error) {
      setWallets([]);
      return;
    }
    const list = (rows ?? []).map((r) => ({
      id: r.wallet_id ?? "",
      name: (r.name?.trim() || r.wallet_id) ?? "Unnamed",
    }));
    setWallets(list);
    setSellWalletId((prev) =>
      list.length > 0 && (prev === "" || !list.some((w) => w.id === prev)) ? list[0].id : prev
    );
  }, []);

  const loadPanelNews = useCallback(async (tickerId: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    setPanelNewsLoading(true);
    const { data: rows, error } = await supabase
      .from("ticker_news")
      .select("id, url, headline, source, time_ago")
      .eq("ticker_id", tickerId)
      .order("sort_order");
    if (error || !rows?.length) {
      const { data: generic } = await supabase
        .from("ticker_news")
        .select("id, url, headline, source, time_ago")
        .eq("ticker_id", "generic")
        .order("sort_order");
      setPanelNews(
        (generic ?? []).map((r) => ({
          id: String(r.id),
          url: r.url ?? "",
          headline: r.headline ?? "",
          source: r.source ?? "",
          timeAgo: r.time_ago ?? "",
        }))
      );
    } else {
      setPanelNews(
        rows.map((r) => ({
          id: String(r.id),
          url: r.url ?? "",
          headline: r.headline ?? "",
          source: r.source ?? "",
          timeAgo: r.time_ago ?? "",
        }))
      );
    }
    setPanelNewsLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedTicker) {
      setGraphPanelVisible(false);
      setPanelNews([]);
      return;
    }
    loadWallets();
    loadPanelNews(selectedTicker.id);
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setGraphPanelVisible(true));
    });
    return () => cancelAnimationFrame(t);
  }, [selectedTicker, loadWallets, loadPanelNews]);

  useEffect(() => {
    if (!selectedTicker) {
      setChartData([]);
      return;
    }
    setChartLoading(true);
    const supabase = getSupabase();
    if (!supabase) {
      setChartData([]);
      setChartLoading(false);
      return;
    }
    const tokenName = TICKER_LEGEND[selectedTicker.id] ?? selectedTicker.symbol;
    supabase
      .from("token_prices")
      .select("price, price_time")
      .eq("token_name", tokenName)
      .order("price_time", { ascending: true })
      .then(({ data, error }) => {
        setChartLoading(false);
        if (error) {
          setChartData([]);
          return;
        }
        const points = (data ?? []).map((r) => {
          const timeStr = r.price_time ?? "";
          const timeMs = new Date(timeStr).getTime();
          return {
            time: timeStr,
            timeMs: Number.isNaN(timeMs) ? 0 : timeMs,
            price: Number(r.price ?? 0),
          };
        });
        setChartData(points);
        const computed = computeLastChgFromData(points);
        if (computed && selectedTicker)
          setLivePrices((p) => ({ ...p, [selectedTicker.id]: computed }));
      });
  }, [selectedTicker]);

  // Realtime: subscribe to token_prices for current ticker so chart updates when table changes
  useEffect(() => {
    if (!selectedTicker) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const tokenName = TICKER_LEGEND[selectedTicker.id] ?? selectedTicker.symbol;
    const channel = supabase
      .channel(`token_prices:${tokenName}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "token_prices",
          filter: `token_name=eq.${tokenName}`,
        },
        (payload) => {
          const row = payload.new as { price?: unknown; price_time?: string } | null;
          if (!row?.price_time) return;
          const timeStr = row.price_time;
          const timeMs = new Date(timeStr).getTime();
          if (Number.isNaN(timeMs)) return;
          const point = {
            time: timeStr,
            timeMs,
            price: Number(row.price ?? 0),
          };
          setChartData((prev) => {
            const filtered = prev.filter((p) => p.timeMs !== timeMs);
            const next = [...filtered, point].sort((a, b) => a.timeMs - b.timeMs);
            const computed = computeLastChgFromData(next);
            const tickerId = ID_BY_TOKEN[tokenName];
            if (tickerId && computed)
              setLivePrices((p) => ({ ...p, [tickerId]: computed }));
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTicker]);

  // Fetch live prices for all tickers - runs independently of auth
  const fetchLivePrices = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      // Fetch recent prices for each token individually to avoid the 1000 row limit issue
      const tokenNames = Object.values(TICKER_LEGEND);
      const next: Record<string, { last: number; chg: number; chgPct: number }> = {};

      await Promise.all(
        tokenNames.map(async (tokenName) => {
          const { data: priceData, error } = await supabase
            .from("token_prices")
            .select("price, price_time")
            .eq("token_name", tokenName)
            .order("price_time", { ascending: true });

          if (error || !priceData?.length) return;

          const points = priceData.map((r) => ({
            timeMs: new Date(r.price_time ?? 0).getTime(),
            price: Number(r.price ?? 0),
          })).filter((p) => !Number.isNaN(p.timeMs));

          const id = ID_BY_TOKEN[tokenName];
          if (!id) return;

          const computed = computeLastChgFromData(points);
          if (computed) {
            next[id] = computed;
          }
        })
      );

      if (Object.keys(next).length > 0) {
        setLivePrices((prev) => ({ ...prev, ...next }));
        return true;
      }

      return false;
    } catch (err) {
      console.error("[fetchLivePrices] Exception:", err);
      return false;
    }
  }, []);

  const loadFavourites = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setTickers(ALL_TICKERS);
      await fetchLivePrices();
      setLoaded(true);
      return;
    }
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser?.id) {
      setTickers(ALL_TICKERS);
      await fetchLivePrices();
      setLoaded(true);
      return;
    }
    const { data: userRow } = await supabase
      .from("users")
      .select("id")
      .eq("id", authUser.id)
      .single();
    if (!userRow) {
      await supabase
        .from("users")
        .upsert(
          { id: authUser.id, updated_at: new Date().toISOString() },
          { onConflict: "id" },
        );
    }
    const { data: rows } = await supabase
      .from("user_favourite_tickers")
      .select("ticker_id")
      .eq("user_id", authUser.id);
    const favIds = new Set((rows ?? []).map((r) => r.ticker_id));
    const favs: TickerRow[] = [];
    const rest: TickerRow[] = [];
    for (const t of ALL_TICKERS) {
      if (favIds.has(t.id)) favs.push(t);
      else rest.push(t);
    }
    setFavourites(favs);
    setTickers(rest);

    await fetchLivePrices();
    setLoaded(true);
  }, [fetchLivePrices]);

  useEffect(() => {
    loadFavourites();
  }, [loadFavourites]);

  // Fetch prices on mount with retry - ensures prices load even if initial fetch fails
  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 300;

    const tryFetch = async () => {
      if (cancelled) return;
      const success = await fetchLivePrices();
      if (!success && retryCount < maxRetries && !cancelled) {
        retryCount++;
        setTimeout(tryFetch, retryDelay);
      }
    };

    // Small delay to ensure component is mounted and supabase is ready
    setTimeout(tryFetch, 100);

    return () => { cancelled = true; };
  }, [fetchLivePrices]);

  // Realtime: subscribe to ALL token_prices changes so table updates live
  useEffect(() => {
    if (!loaded) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel("token_prices:all")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "token_prices",
        },
        (payload) => {
          const row = payload.new as { token_name?: string; price?: unknown; price_time?: string } | null;
          if (!row?.price_time || !row?.token_name) return;
          const tokenName = row.token_name;
          const tickerId = ID_BY_TOKEN[tokenName];
          if (!tickerId) return;
          const price = Number(row.price ?? 0);
          // Update livePrices with the new price (simple update - just use new price as last)
          setLivePrices((prev) => {
            const existing = prev[tickerId];
            const oldLast = existing?.last ?? price;
            const chg = price - oldLast;
            const chgPct = oldLast !== 0 ? (chg / oldLast) * 100 : 0;
            return {
              ...prev,
              [tickerId]: { last: price, chg, chgPct },
            };
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loaded]);

  // Fetch best sell offer price from XRPL when in buy mode (excludes buyer's own offers)
  useEffect(() => {
    if (sellOrBuy !== "buy" || !selectedTicker) {
      setBestBuyPrice(null);
      return;
    }
    let cancelled = false;
    const fetchBest = async () => {
      setBestBuyPriceLoading(true);

      // Derive the buyer's XRPL address so we can exclude their own offers
      let buyerAddress: string | null = null;
      if (sellWalletId) {
        const supabase = getSupabase();
        if (supabase) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: walletRow } = await supabase
              .from("wallets")
              .select("wallet_secret")
              .eq("user_id", user.id)
              .eq("wallet_id", sellWalletId)
              .maybeSingle();
            const secret = walletRow?.wallet_secret?.trim();
            if (secret) {
              try {
                buyerAddress = xrpl.Wallet.fromSeed(secret).address;
              } catch { /* ignore invalid secrets */ }
            }
          }
        }
      }

      const cfg = getTokenConfig(selectedTicker.id);
      const client = new xrpl.Client(XRPL_SERVER);
      try {
        await client.connect();
        const response = await client.request({
          command: "book_offers",
          taker_gets: {
            currency: cfg.currency,
            issuer: cfg.issuer,
          },
          taker_pays: { currency: "XRP" },
          limit: 10,
        });
        if (cancelled) return;
        const offers = (response.result.offers || []).filter(
          (offer) => !buyerAddress || offer.Account !== buyerAddress,
        );
        if (offers.length > 0) {
          const offer = offers[0];
          const tokenAmount =
            typeof offer.TakerGets === "object" && "value" in offer.TakerGets
              ? parseFloat(offer.TakerGets.value)
              : 0;
          const xrpDrops =
            typeof offer.TakerPays === "string" ? offer.TakerPays : "0";
          const xrpAmount = parseFloat(xrpDrops) / 1_000_000;
          if (tokenAmount > 0 && xrpAmount > 0) {
            setBestBuyPrice(xrpAmount / tokenAmount);
          } else {
            setBestBuyPrice(null);
          }
        } else {
          setBestBuyPrice(null);
        }
      } catch {
        if (!cancelled) setBestBuyPrice(null);
      } finally {
        await client.disconnect().catch(() => {});
        if (!cancelled) setBestBuyPriceLoading(false);
      }
    };
    fetchBest();
    return () => { cancelled = true; };
  }, [sellOrBuy, selectedTicker, sellWalletId]);

  const addToFavourites = async (row: TickerRow) => {
    const supabase = getSupabase();
    if (supabase) {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser?.id) {
        await supabase
          .from("user_favourite_tickers")
          .upsert(
            { user_id: authUser.id, ticker_id: row.id },
            { onConflict: "user_id,ticker_id" },
          );
      }
    }
    setTickers((prev) => prev.filter((t) => t.id !== row.id));
    setFavourites((prev) => [...prev, row]);
  };

  const removeFromFavourites = async (row: TickerRow) => {
    const supabase = getSupabase();
    if (supabase) {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser?.id) {
        await supabase
          .from("user_favourite_tickers")
          .delete()
          .eq("user_id", authUser.id)
          .eq("ticker_id", row.id);
      }
    }
    setFavourites((prev) => prev.filter((f) => f.id !== row.id));
    setTickers((prev) => [...prev, row]);
  };

  const removeFromBrowseList = (id: string) => {
    setTickers((prev) => prev.filter((t) => t.id !== id));
  };

  const formatNum = (n: number) =>
    n >= 1000
      ? n.toLocaleString("en-US", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })
      : n.toFixed(2);
  /** More precise for chart axis/tooltip so small price differences are visible */
  const formatChartPrice = (n: number) => {
    if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    if (Math.abs(n) >= 1) return n.toFixed(3);
    if (Math.abs(n) >= 0.01) return n.toFixed(4);
    return n.toFixed(6);
  };
  const formatChg = (n: number) => {
    const sign = n >= 0 ? "+" : "";
    if (n >= 1000)
      return sign + n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    if (Math.abs(n) >= 1) return sign + n.toFixed(3);
    if (Math.abs(n) >= 0.01) return sign + n.toFixed(4);
    return sign + n.toFixed(6);
  };
  const formatPct = (n: number) => {
    const sign = n >= 0 ? "+" : "";
    const a = Math.abs(n);
    if (a >= 1) return sign + n.toFixed(2) + "%";
    if (a >= 0.01) return sign + n.toFixed(3) + "%";
    return sign + n.toFixed(4) + "%";
  };

  const chartRangeMs = useMemo(() => {
    const min = 60 * 1000;
    const hour = 60 * min;
    const day = 24 * hour;
    return {
      "10m": 10 * min,
      "1H": hour,
      "1D": day,
      "1W": 7 * day,
      "1M": 30 * day,
      "1Y": 365 * day,
    } as const;
  }, []);

  const filteredChartData = useMemo(() => {
    if (chartData.length === 0) return [];
    const endMs = chartData[chartData.length - 1].timeMs;
    const rangeMs = chartRangeMs[chartRange];
    const startMs = endMs - rangeMs;
    const filtered = chartData.filter((d) => d.timeMs >= startMs && d.timeMs <= endMs);
    return filtered.length > 0 ? filtered : chartData;
  }, [chartData, chartRange, chartRangeMs]);

  // Panel header: use real data when available (from chartData first, else livePrices), else mock
  const panelPrice = useMemo(() => {
    if (!selectedTicker) return null;
    if (chartData.length > 0) {
      const c = computeLastChgFromData(chartData);
      if (c) return c;
    }
    const live = livePrices[selectedTicker.id];
    if (live) return live;
    return {
      last: selectedTicker.last,
      chg: selectedTicker.chg,
      chgPct: selectedTicker.chgPct,
    };
  }, [selectedTicker, chartData, livePrices]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div
        className={`flex flex-col gap-8 px-6 py-8 transition-[transform,opacity] duration-300 ease-out lg:px-8 lg:py-10 ${
          loaded ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
      >
        {/* Ticker graph panel — appears above when a ticker is selected */}
        {selectedTicker && (
          <section
            className={`overflow-hidden rounded-lg border border-sidebar-border bg-sidebar transition-[opacity,transform] duration-300 ease-out ${
              graphPanelVisible
                ? "translate-y-0 opacity-100"
                : "translate-y-4 opacity-0"
            }`}
          >
            {/* Header: large logo + title beside, dropdown under title, close button */}
            <div className="flex items-start justify-between border-b border-sidebar-border px-6 pt-5 pb-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-5">
                  {selectedTicker.logo ? (
                    <img
                      src={selectedTicker.logo}
                      alt=""
                      className="h-24 w-24 shrink-0 rounded-full object-contain bg-sidebar-accent"
                    />
                  ) : (
                    <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-primary/20 text-2xl font-medium text-primary">
                      {selectedTicker.icon ?? selectedTicker.symbol.slice(0, 1)}
                    </span>
                  )}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-xl font-bold tracking-tight text-white"
                        style={{ fontFamily: "var(--font-geist-sans)" }}
                      >
                        {selectedTicker.symbol}
                      </span>
                      <span
                        className="rounded bg-sidebar-accent px-1.5 py-0.5 text-xs font-medium tabular-nums text-sidebar-foreground/80"
                        style={{ fontFamily: "var(--font-geist-sans)" }}
                        title="token_name in token_prices table"
                      >
                        {TICKER_LEGEND[selectedTicker.id] ?? "—"}
                      </span>
                    </div>
                    {/* Dropdown: quote asset (default XRP, stable coins) — underneath the title */}
                    <Select value={quoteAsset} onValueChange={setQuoteAsset}>
                      <SelectTrigger className="h-9 w-[140px] border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUOTE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Current price — underneath the dropdown; use real data when available */}
                    <div className="flex flex-wrap items-baseline gap-2">
                      <AnimatedValue
                        valueKey={panelPrice?.last ?? selectedTicker.last}
                        className="text-2xl font-semibold tabular-nums text-white"
                        style={{ fontFamily: "var(--font-geist-sans)" }}
                      >
                        {formatChartPrice(panelPrice?.last ?? selectedTicker.last)}
                      </AnimatedValue>
                      <span className="text-sm text-sidebar-foreground/70">
                        {quoteAsset}
                      </span>
                      <AnimatedValue
                        valueKey={`${panelPrice?.chg ?? selectedTicker.chg}-${panelPrice?.chgPct ?? selectedTicker.chgPct}`}
                        className={`text-sm font-medium tabular-nums ${
                          (panelPrice?.chg ?? selectedTicker.chg) >= 0
                            ? "text-green-500"
                            : "text-red-500"
                        }`}
                      >
                        {formatChg(panelPrice?.chg ?? selectedTicker.chg)}{" "}
                        {formatPct(panelPrice?.chgPct ?? selectedTicker.chgPct)}
                      </AnimatedValue>
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicker(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <IconX className="size-5" />
              </button>
            </div>
            <div className="min-h-[320px] pl-6 pr-0 py-6">
              <div className="flex min-h-[280px] gap-3">
                {/* Chart — narrower width */}
                <div className="min-w-0 flex-1">
                  {chartLoading ? (
                    <div
                      className="flex h-full min-h-[280px] w-full items-center justify-center rounded-md bg-sidebar-accent/30 text-sidebar-foreground/60"
                      style={{ fontFamily: "var(--font-geist-sans)" }}
                    >
                      Loading chart…
                    </div>
                  ) : chartData.length === 0 ? (
                    <div
                      className="flex h-full min-h-[280px] w-full items-center justify-center rounded-md bg-sidebar-accent/30 text-sidebar-foreground/60"
                      style={{ fontFamily: "var(--font-geist-sans)" }}
                    >
                      No historical data
                    </div>
                  ) : (
                    <div className="relative h-full min-h-[280px]">
                      <ChartContainer
                        config={{
                          price: {
                            label: "Price",
                            color: "var(--chart-1)",
                          },
                          time: { label: "Time" },
                        } satisfies ChartConfig}
                        className="aspect-auto h-[280px] min-h-[280px] w-full min-w-0"
                      >
                        <LineChart data={filteredChartData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-sidebar-border/50" vertical={false} />
                          <XAxis
                            dataKey="timeMs"
                            type="number"
                            domain={["dataMin", "dataMax"]}
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            minTickGap={40}
                            tick={{ fill: "var(--sidebar-foreground)", fontSize: 11 }}
                            tickFormatter={(value: number) => {
                              const d = new Date(value);
                              return chartRange === "10m" || chartRange === "1H" || chartRange === "1D"
                                ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
                                : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                            }}
                          />
                          <YAxis
                            orientation="right"
                            domain={["dataMin", "dataMax"]}
                            type="number"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            width={56}
                            tick={{ fill: "var(--sidebar-foreground)", fontSize: 11 }}
                            tickFormatter={(value) => formatChartPrice(value)}
                          />
                          <ChartTooltip
                            cursor={{ stroke: "var(--sidebar-border)" }}
                            content={
                              <ChartTooltipContent
                                labelFormatter={(_value, payload) => {
                                  const point = Array.isArray(payload) && payload[0]?.payload;
                                  const timeMs = point?.timeMs ?? (typeof point?.time === "string" ? new Date(point?.time).getTime() : NaN);
                                  const d = new Date(timeMs);
                                  if (Number.isNaN(d.getTime())) return "—";
                                  return d.toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  });
                                }}
                                formatter={(value) => formatChartPrice(Number(value))}
                              />
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke="var(--color-price)"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                        </LineChart>
                      </ChartContainer>
                      <div className="mt-3 flex gap-1">
                        {(["10m", "1H", "1D", "1W", "1M", "1Y"] as const).map((range) => (
                          <button
                            key={range}
                            type="button"
                            onClick={() => setChartRange(range)}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                              chartRange === range
                                ? "bg-sidebar-accent text-sidebar-foreground"
                                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                            }`}
                            style={{ fontFamily: "var(--font-geist-sans)" }}
                          >
                            {range}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* Right section: Sell/Buy toggle — touches right wall, compact */}
                <div className="flex w-36 shrink-0 flex-col gap-2 pr-2">
                  <div className="flex rounded-md bg-sidebar-accent/50 p-0.5" style={{ fontFamily: "var(--font-geist-sans)" }}>
                    {(["sell", "buy"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSellOrBuy(mode)}
                        className={`flex-1 rounded px-2 py-1.5 text-sm font-medium capitalize transition-colors ${
                          sellOrBuy === mode
                            ? "bg-sidebar-accent text-sidebar-foreground shadow-sm"
                            : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  <Select value={sellWalletId} onValueChange={setSellWalletId}>
                    <SelectTrigger
                      className="h-9 rounded-md border-sidebar-border bg-sidebar-accent/50 text-sm text-sidebar-foreground"
                      style={{ fontFamily: "var(--font-geist-sans)" }}
                    >
                      <SelectValue placeholder="Wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sellOrBuy === "sell" ? (
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="Price"
                      value={sellPrice}
                      onChange={(e) => setSellPrice(e.target.value)}
                      className="h-9 rounded-md border-sidebar-border bg-sidebar-accent/50 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/50"
                      style={{ fontFamily: "var(--font-geist-sans)" }}
                    />
                  ) : (
                    <div
                      className="flex h-9 items-center rounded-md border border-sidebar-border bg-sidebar-accent/50 px-3 text-sm text-sidebar-foreground"
                      style={{ fontFamily: "var(--font-geist-sans)" }}
                    >
                      {bestBuyPriceLoading
                        ? "Loading…"
                        : bestBuyPrice !== null
                          ? `${bestBuyPrice.toFixed(6)} XRP`
                          : "No offers"}
                    </div>
                  )}
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="Token count"
                    value={sellTokenCount}
                    onChange={(e) => setSellTokenCount(e.target.value)}
                    className="h-9 rounded-md border-sidebar-border bg-sidebar-accent/50 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/50"
                    style={{ fontFamily: "var(--font-geist-sans)" }}
                  />
                  <button
                    type="button"
                    disabled={
                      sellOrBuy === "sell"
                        ? sellLoading
                        : buyLoading
                    }
                    onClick={async () => {
                      const supabase = getSupabase();
                      if (!supabase) {
                        toast.error("Not signed in.", { position: "bottom-right" });
                        return;
                      }
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) {
                        toast.error("Not signed in.", { position: "bottom-right" });
                        return;
                      }
                      if (!sellWalletId?.trim()) {
                        toast.error("Select a wallet.", { position: "bottom-right" });
                        return;
                      }
                      const qty = parseFloat(sellTokenCount);
                      const price = parseFloat(sellPrice);
                      if (!sellTokenCount || isNaN(qty) || qty <= 0) {
                        toast.error("Enter a valid quantity.", { position: "bottom-right" });
                        return;
                      }

                      if (sellOrBuy === "buy") {
                        const { data: walletRow } = await supabase
                          .from("wallets")
                          .select("wallet_secret")
                          .eq("user_id", user.id)
                          .eq("wallet_id", sellWalletId)
                          .maybeSingle();
                        const secret = walletRow?.wallet_secret?.trim();
                        if (!secret) {
                          toast.error("Add and save your wallet secret in Billing for this wallet.", { position: "bottom-right" });
                          return;
                        }
                        setBuyLoading(true);
                        try {
                          const result = await executeBuyOrder(
                            sellTokenCount,
                            secret,
                            sellWalletId,
                            getTokenConfig(selectedTicker?.id),
                          );
                          const requested = parseFloat(sellTokenCount);
                          const partial = result.tokensReceived < requested
                            ? ` (partial fill — ${requested} requested)`
                            : "";
                          toast.success(
                            `Purchased ${result.tokensReceived} tokens${partial}. View your proxy key in Order Book.`,
                            { position: "bottom-right" },
                          );
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Buy failed.";
                          toast.error(msg, { position: "bottom-right" });
                        } finally {
                          setBuyLoading(false);
                        }
                        return;
                      }

                      setSellError("");
                      setSellSuccess("");
                      if (!sellPrice || isNaN(price) || price <= 0) {
                        toast.error("Enter a valid price.", { position: "bottom-right" });
                        return;
                      }
                      const { data: walletRow } = await supabase
                        .from("wallets")
                        .select("wallet_secret")
                        .eq("user_id", user.id)
                        .eq("wallet_id", sellWalletId)
                        .maybeSingle();
                      const secret = walletRow?.wallet_secret?.trim();
                      if (!secret) {
                        toast.error("Add and save your wallet secret in Billing for this wallet.", { position: "bottom-right" });
                        return;
                      }
                      const keyInfo = await getApiKeyForWallet(supabase, user.id, sellWalletId);
                      if (!keyInfo) {
                        toast.error("Connect an API provider to this wallet in Connections.", { position: "bottom-right" });
                        return;
                      }
                      setSellLoading(true);
                      setSellError("");
                      setSellSuccess("");
                      try {
                        await submitSellOrder(supabase, user.id, {
                          apiKey: keyInfo.apiKey,
                          quantity: sellTokenCount,
                          pricePerUnit: sellPrice,
                          secret,
                          skipConnectionCheck: true,
                          wallet_id: sellWalletId,
                          provider_id: keyInfo.providerId,
                          tokenConfig: getTokenConfig(selectedTicker?.id),
                        });
                        setSellSuccess("Sell order created.");
                        toast.success("Sell order created.", { position: "bottom-right" });
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : "Sell failed.";
                        setSellError(msg);
                        toast.error(msg, { position: "bottom-right" });
                      } finally {
                        setSellLoading(false);
                      }
                    }}
                    className="mt-1 h-9 rounded-md bg-sidebar-accent px-3 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/80 capitalize disabled:opacity-50"
                    style={{ fontFamily: "var(--font-geist-sans)" }}
                  >
                    {sellOrBuy === "sell"
                      ? (sellLoading ? "Selling…" : "Sell")
                      : (buyLoading ? "Buying…" : "Buy")}
                  </button>
                </div>
              </div>
              {/* News — single row, headlines as links */}
              <div className="mt-6 pl-0 pr-6">
                <a
                  href="#"
                  className="mb-2 inline-block text-sm font-semibold text-white hover:text-sidebar-foreground/90"
                  style={{ fontFamily: "var(--font-geist-pixel-line)" }}
                >
                  News &gt;
                </a>
                <div className="flex gap-4 overflow-x-auto pb-1 pt-1">
                  {panelNewsLoading ? (
                    <p className="text-sm text-sidebar-foreground/60" style={{ fontFamily: "var(--font-geist-sans)" }}>
                      Loading news…
                    </p>
                  ) : panelNews.length === 0 ? (
                    <p className="text-sm text-sidebar-foreground/60" style={{ fontFamily: "var(--font-geist-sans)" }}>
                      No news. Run backend/supabase/seed-ticker-news.sql in Supabase SQL Editor to add articles.
                    </p>
                  ) : (
                    panelNews.map((item) => (
                      <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-[200px] max-w-[260px] shrink-0 rounded-md border border-sidebar-border/50 bg-sidebar-accent/30 p-3 transition-colors hover:bg-sidebar-accent/50 hover:border-sidebar-border"
                        style={{ fontFamily: "var(--font-geist-sans)" }}
                      >
                        <p className="mb-1 text-xs text-sidebar-foreground/70">
                          {item.timeAgo} · {item.source}
                        </p>
                        <p className="text-sm font-medium leading-snug text-white line-clamp-2">
                          {item.headline}
                        </p>
                      </a>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Favourited APIs — same look as Browse APIs, tickers move here when favourited */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2
              className="text-lg font-bold text-white"
              style={{ fontFamily: "var(--font-geist-pixel-line)" }}
            >
              Favourited APIs
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <IconPlus className="size-4" />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <IconLayoutGrid className="size-4" />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <IconDots className="size-4" />
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-sidebar-border bg-sidebar">
            <table
              className="w-full border-collapse text-sm text-sidebar-foreground"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              <thead>
                <tr className="border-b border-sidebar-border text-sidebar-foreground/70">
                  <th className="py-4 pl-6 text-left font-medium">Symbol</th>
                  <th className="py-4 pr-6 text-right font-medium">Last</th>
                  <th className="py-4 pr-6 text-right font-medium">Chg</th>
                  <th className="py-4 pr-6 text-right font-medium">Chg%</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {favourites.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-10 text-center text-sidebar-foreground/60"
                    >
                      No favourited APIs yet. Click the flag on any API in
                      Browse APIs to add it here.
                    </td>
                  </tr>
                ) : (
                  favourites.map((row) => {
                    const isHovered = hoveredFavId === row.id;
                    return (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) =>
                          e.key === "Enter" && setSelectedTicker(row)
                        }
                        onClick={() => setSelectedTicker(row)}
                        onMouseEnter={() => setHoveredFavId(row.id)}
                        onMouseLeave={() => setHoveredFavId(null)}
                        className={`cursor-pointer h-14 ${isHovered ? "bg-sidebar-accent" : ""}`}
                      >
                        <td className="py-3 pl-6">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromFavourites(row);
                              }}
                              className="flex h-5 w-5 shrink-0 items-center justify-center text-sidebar-foreground/70 hover:text-destructive"
                            >
                              <IconFlagFilled className="size-4 text-destructive" />
                            </button>
                            {row.logo ? (
                              <img
                                src={row.logo}
                                alt=""
                                className="h-5 w-5 shrink-0 rounded-full object-contain bg-sidebar-accent"
                              />
                            ) : (
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                                {row.icon ?? row.symbol.slice(0, 1)}
                              </span>
                            )}
                            <span className="font-medium text-sidebar-foreground">
                              {row.symbol}
                            </span>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-foreground/50" />
                          </div>
                        </td>
                        <td className="py-3 pr-6 text-right tabular-nums text-sidebar-foreground">
                          <AnimatedValue valueKey={livePrices[row.id]?.last ?? row.last}>
                            {formatChartPrice(livePrices[row.id]?.last ?? row.last)}
                          </AnimatedValue>
                        </td>
                        <td
                          className={`py-3 pr-6 text-right tabular-nums ${
                            (livePrices[row.id]?.chg ?? row.chg) >= 0 ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          <AnimatedValue valueKey={livePrices[row.id]?.chg ?? row.chg}>
                            {formatChg(livePrices[row.id]?.chg ?? row.chg)}
                          </AnimatedValue>
                        </td>
                        <td
                          className={`py-3 pr-6 text-right tabular-nums ${
                            (livePrices[row.id]?.chgPct ?? row.chgPct) >= 0 ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          <AnimatedValue valueKey={livePrices[row.id]?.chgPct ?? row.chgPct}>
                            {formatPct(livePrices[row.id]?.chgPct ?? row.chgPct)}
                          </AnimatedValue>
                        </td>
                        <td className="w-8 py-3 pr-4">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromFavourites(row);
                            }}
                            className={`flex h-5 w-5 items-center justify-center rounded text-sidebar-foreground/70 hover:text-destructive ${isHovered ? "opacity-100" : "opacity-0"}`}
                          >
                            <IconTrash className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Browse APIs — ticker list */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2
              className="text-lg font-bold text-white"
              style={{ fontFamily: "var(--font-geist-pixel-line)" }}
            >
              Browse APIs
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <IconPlus className="size-4" />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <IconLayoutGrid className="size-4" />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <IconDots className="size-4" />
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-sidebar-border bg-sidebar">
            <table
              className="w-full border-collapse text-sm text-sidebar-foreground"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              <thead>
                <tr className="border-b border-sidebar-border text-sidebar-foreground/70">
                  <th className="py-4 pl-6 text-left font-medium">Symbol</th>
                  <th className="py-4 pr-6 text-right font-medium">Last</th>
                  <th className="py-4 pr-6 text-right font-medium">Chg</th>
                  <th className="py-4 pr-6 text-right font-medium">Chg%</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {tickers.map((row) => {
                  const isHovered = hoveredId === row.id;
                  return (
                    <tr
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) =>
                        e.key === "Enter" && setSelectedTicker(row)
                      }
                      onClick={() => setSelectedTicker(row)}
                      onMouseEnter={() => setHoveredId(row.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={`cursor-pointer h-14 ${isHovered ? "bg-sidebar-accent" : ""}`}
                    >
                      <td className="py-3 pl-6">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToFavourites(row);
                            }}
                            className="flex h-5 w-5 shrink-0 items-center justify-center text-sidebar-foreground/70 hover:text-destructive"
                          >
                            <IconFlagFilled className="size-4 opacity-30" />
                          </button>
                          {row.logo ? (
                            <img
                              src={row.logo}
                              alt=""
                              className="h-5 w-5 shrink-0 rounded-full object-contain bg-sidebar-accent"
                            />
                          ) : (
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                              {row.icon ?? row.symbol.slice(0, 1)}
                            </span>
                          )}
                          <span className="font-medium text-sidebar-foreground">
                            {row.symbol}
                          </span>
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-foreground/50" />
                        </div>
                      </td>
                      <td className="py-3 pr-6 text-right tabular-nums text-sidebar-foreground">
                        <AnimatedValue valueKey={livePrices[row.id]?.last ?? row.last}>
                          {formatChartPrice(livePrices[row.id]?.last ?? row.last)}
                        </AnimatedValue>
                      </td>
                      <td
                        className={`py-3 pr-6 text-right tabular-nums ${
                          (livePrices[row.id]?.chg ?? row.chg) >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        <AnimatedValue valueKey={livePrices[row.id]?.chg ?? row.chg}>
                          {formatChg(livePrices[row.id]?.chg ?? row.chg)}
                        </AnimatedValue>
                      </td>
                      <td
                        className={`py-3 pr-6 text-right tabular-nums ${
                          (livePrices[row.id]?.chgPct ?? row.chgPct) >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        <AnimatedValue valueKey={livePrices[row.id]?.chgPct ?? row.chgPct}>
                          {formatPct(livePrices[row.id]?.chgPct ?? row.chgPct)}
                        </AnimatedValue>
                      </td>
                      <td className="w-8 py-3 pr-4">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromBrowseList(row.id);
                          }}
                          className={`flex h-5 w-5 items-center justify-center rounded text-sidebar-foreground/70 hover:text-destructive ${isHovered ? "opacity-100" : "opacity-0"}`}
                        >
                          <IconTrash className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
