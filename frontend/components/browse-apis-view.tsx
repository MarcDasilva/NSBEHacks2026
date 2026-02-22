"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IconFlagFilled,
  IconPlus,
  IconLayoutGrid,
  IconDots,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { getSupabase } from "@/lib/supabase/client";

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
  { id: "openai", symbol: "OpenAI", logo: "/logos/openai-white.png", last: 25.01, chg: 0.2, chgPct: 0.8 },
  { id: "anthropic", symbol: "Anthropic", logo: "/logos/claude-color.png", last: 18.5, chg: -0.47, chgPct: -2.55 },
  { id: "google", symbol: "Google AI", logo: "/logos/gemini-color.png", last: 142.3, chg: 1.24, chgPct: 0.87 },
  { id: "twilio", symbol: "Twilio", logo: "/logos/Twilio-Symbol.png", last: 52.4, chg: -1.84, chgPct: -3.4 },
  { id: "elevenlabs", symbol: "ElevenLabs", logo: "/logos/elevenlabs-symbol.svg", last: 12.8, chg: 0.15, chgPct: 1.19 },
  { id: "mistral", symbol: "Mistral", logo: "/logos/mistral.png", last: 34.2, chg: 0.71, chgPct: 2.12 },
  { id: "cohere", symbol: "Cohere", logo: "/logos/cohere.png", last: 8.5, chg: 0.22, chgPct: 2.66 },
  { id: "polygon", symbol: "Polygon", logo: "/logos/polygon.jpeg", last: 89.2, chg: 0.71, chgPct: 0.8 },
  { id: "deepl", symbol: "DeepL", logo: "/logos/DeepL-Icon-Logo-Vector.svg--240x300.png", last: 22.0, chg: -0.1, chgPct: -0.45 },
  { id: "gradium", symbol: "Gradium", logo: "/logos/gradium.png", last: 14.2, chg: 0.31, chgPct: 2.23 },
  { id: "alpha-vantage", symbol: "Alpha Vantage", logo: "/logos/alpha%20vantage.png", last: 6.8, chg: -0.12, chgPct: -1.73 },
  { id: "gecko", symbol: "Gecko", logo: "/logos/gecko-405ed53b475f61244130f95742a07da15f7ac30feeed5072812ae5c2d73b6194.svg", last: 19.4, chg: 0.88, chgPct: 4.75 },
  { id: "google-maps", symbol: "Google Maps", logo: "/logos/Google_Maps_icon_(2020).svg.png", last: 98.0, chg: 1.2, chgPct: 1.24 },
  { id: "clearbit", symbol: "Clearbit", logo: "/logos/clearbit.webp", last: 11.5, chg: 0.05, chgPct: 0.44 },
];

const ALL_TICKERS = MOCK_BROWSE_TICKERS;

export function BrowseApisView() {
  const [tickers, setTickers] = useState<TickerRow[]>([]);
  const [favourites, setFavourites] = useState<TickerRow[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredFavId, setHoveredFavId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<TickerRow | null>(null);
  const [graphPanelVisible, setGraphPanelVisible] = useState(false);

  useEffect(() => {
    if (!selectedTicker) {
      setGraphPanelVisible(false);
      return;
    }
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setGraphPanelVisible(true));
    });
    return () => cancelAnimationFrame(t);
  }, [selectedTicker]);

  const loadFavourites = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setTickers(ALL_TICKERS);
      setLoaded(true);
      return;
    }
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser?.id) {
      setTickers(ALL_TICKERS);
      setLoaded(true);
      return;
    }
    const { data: userRow } = await supabase
      .from("users")
      .select("id")
      .eq("id", authUser.id)
      .single();
    if (!userRow) {
      await supabase.from("users").upsert({ id: authUser.id, updated_at: new Date().toISOString() }, { onConflict: "id" });
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
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadFavourites();
  }, [loadFavourites]);

  const addToFavourites = async (row: TickerRow) => {
    const supabase = getSupabase();
    if (supabase) {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser?.id) {
        await supabase.from("user_favourite_tickers").upsert(
          { user_id: authUser.id, ticker_id: row.id },
          { onConflict: "user_id,ticker_id" }
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
        await supabase.from("user_favourite_tickers").delete().eq("user_id", authUser.id).eq("ticker_id", row.id);
      }
    }
    setFavourites((prev) => prev.filter((f) => f.id !== row.id));
    setTickers((prev) => [...prev, row]);
  };

  const removeFromBrowseList = (id: string) => {
    setTickers((prev) => prev.filter((t) => t.id !== id));
  };

  const formatNum = (n: number) =>
    n >= 1000 ? n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : n.toFixed(2);
  const formatChg = (n: number) =>
    (n >= 0 ? "+" : "") + (n >= 1000 ? n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : n.toFixed(2));
  const formatPct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";

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
              graphPanelVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            <div className="flex items-center justify-between border-b border-sidebar-border px-6 py-3">
              <div className="flex items-center gap-3">
                {selectedTicker.logo ? (
                  <img
                    src={selectedTicker.logo}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-contain bg-sidebar-accent"
                  />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
                    {selectedTicker.icon ?? selectedTicker.symbol.slice(0, 1)}
                  </span>
                )}
                <span className="text-lg font-semibold text-sidebar-foreground" style={{ fontFamily: "var(--font-geist-sans)" }}>
                  {selectedTicker.symbol}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicker(null)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <IconX className="size-5" />
              </button>
            </div>
            <div className="min-h-[320px] p-6">
              {/* Graph placeholder — replace with actual chart component when ready */}
              <div className="flex h-full min-h-[280px] w-full items-center justify-center rounded-md bg-sidebar-accent/30 text-sidebar-foreground/60" style={{ fontFamily: "var(--font-geist-sans)" }}>
                Chart for {selectedTicker.symbol} will display here
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
            <table className="w-full border-collapse text-sm text-sidebar-foreground" style={{ fontFamily: "var(--font-geist-sans)" }}>
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
                    <td colSpan={5} className="py-10 text-center text-sidebar-foreground/60">
                      No favourited APIs yet. Click the flag on any API in Browse APIs to add it here.
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
                        onKeyDown={(e) => e.key === "Enter" && setSelectedTicker(row)}
                        onClick={() => setSelectedTicker(row)}
                        onMouseEnter={() => setHoveredFavId(row.id)}
                        onMouseLeave={() => setHoveredFavId(null)}
                        className={`cursor-pointer ${isHovered ? "bg-sidebar-accent" : ""}`}
                      >
                        <td className="py-3 pl-6">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromFavourites(row);
                              }}
                              className="flex shrink-0 text-sidebar-foreground/70 hover:text-destructive"
                            >
                              <IconFlagFilled className="size-4 text-destructive" />
                            </button>
                            {row.logo ? (
                              <img src={row.logo} alt="" className="h-5 w-5 shrink-0 rounded-full object-contain bg-sidebar-accent" />
                            ) : (
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                                {row.icon ?? row.symbol.slice(0, 1)}
                              </span>
                            )}
                            <span className="font-medium text-sidebar-foreground">{row.symbol}</span>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-foreground/50" />
                          </div>
                        </td>
                        <td className="py-3 pr-6 text-right tabular-nums text-sidebar-foreground">
                          {formatNum(row.last)}
                        </td>
                        <td
                          className={`py-3 pr-6 text-right tabular-nums ${
                            row.chg >= 0 ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {formatChg(row.chg)}
                        </td>
                        <td
                          className={`py-3 pr-6 text-right tabular-nums ${
                            row.chgPct >= 0 ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {formatPct(row.chgPct)}
                        </td>
                        <td className="w-8 py-3 pr-4">
                          {isHovered ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromFavourites(row);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-destructive"
                            >
                              <IconTrash className="size-4" />
                            </button>
                          ) : null}
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
            <table className="w-full border-collapse text-sm text-sidebar-foreground" style={{ fontFamily: "var(--font-geist-sans)" }}>
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
                      onKeyDown={(e) => e.key === "Enter" && setSelectedTicker(row)}
                      onClick={() => setSelectedTicker(row)}
                      onMouseEnter={() => setHoveredId(row.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={`cursor-pointer ${isHovered ? "bg-sidebar-accent" : ""}`}
                    >
                      <td className="py-3 pl-6">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToFavourites(row);
                            }}
                            className="flex shrink-0 text-sidebar-foreground/70 hover:text-destructive"
                          >
                            <IconFlagFilled className="size-4 opacity-30" />
                          </button>
                          {row.logo ? (
                            <img src={row.logo} alt="" className="h-5 w-5 shrink-0 rounded-full object-contain bg-sidebar-accent" />
                          ) : (
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                              {row.icon ?? row.symbol.slice(0, 1)}
                            </span>
                          )}
                          <span className="font-medium text-sidebar-foreground">{row.symbol}</span>
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-foreground/50" />
                        </div>
                      </td>
                      <td className="py-3 pr-6 text-right tabular-nums text-sidebar-foreground">
                        {formatNum(row.last)}
                      </td>
                      <td
                        className={`py-3 pr-6 text-right tabular-nums ${
                          row.chg >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {formatChg(row.chg)}
                      </td>
                      <td
                        className={`py-3 pr-6 text-right tabular-nums ${
                          row.chgPct >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {formatPct(row.chgPct)}
                      </td>
                      <td className="w-8 py-3 pr-4">
                        {isHovered ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromBrowseList(row.id);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-destructive"
                          >
                            <IconTrash className="size-4" />
                          </button>
                        ) : null}
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
