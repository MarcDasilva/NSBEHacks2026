"use client";

import { useEffect, useState, useCallback } from "react";
import * as xrpl from "xrpl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { IconRefresh, IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { BuyOrderDialog } from "@/components/buy-order-dialog";
import { SellOrderDialog } from "@/components/sell-order-dialog";

// Hardcoded token configuration
const TOKEN_CURRENCY = "GGK";
const ISSUER_ADDRESS = "rUpuaJVFUFhw9Dy7X7SwJgw19PpG7BJ1kE";
const XRPL_SERVER = "wss://s.altnet.rippletest.net:51233";

interface OrderBookEntry {
  account: string;
  quantity: number;
  pricePerUnit: number;
  totalXrp: number;
  sequence: number;
}

interface OrderBookData {
  sellOrders: OrderBookEntry[];
  buyOrders: OrderBookEntry[];
  weightedAvgPrice: number | null;
  lastUpdated: Date | null;
}

export default function OrderBookPage() {
  const [data, setData] = useState<OrderBookData>({
    sellOrders: [],
    buyOrders: [],
    weightedAvgPrice: null,
    lastUpdated: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderBook = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const client = new xrpl.Client(XRPL_SERVER);

    try {
      await client.connect();

      // Fetch sell orders (people selling GGK for XRP)
      // TakerGets: XRP (what sellers want)
      // TakerPays: GGK (what sellers are offering)
      const sellResponse = await client.request({
        command: "book_offers",
        taker_gets: { currency: "XRP" },
        taker_pays: {
          currency: TOKEN_CURRENCY,
          issuer: ISSUER_ADDRESS,
        },
        limit: 50,
      });

      // Fetch buy orders (people buying GGK with XRP)
      // TakerGets: GGK (what buyers want)
      // TakerPays: XRP (what buyers are offering)
      const buyResponse = await client.request({
        command: "book_offers",
        taker_gets: {
          currency: TOKEN_CURRENCY,
          issuer: ISSUER_ADDRESS,
        },
        taker_pays: { currency: "XRP" },
        limit: 50,
      });

      // Process sell orders
      const sellOrders: OrderBookEntry[] = (sellResponse.result.offers || [])
        .map((offer) => {
          const xrpDrops =
            typeof offer.TakerGets === "string"
              ? parseFloat(offer.TakerGets)
              : 0;
          const xrpAmount = xrpDrops / 1_000_000;

          const tokenAmount =
            typeof offer.TakerPays === "object" && "value" in offer.TakerPays
              ? parseFloat(offer.TakerPays.value)
              : 0;

          if (tokenAmount <= 0 || xrpAmount <= 0) return null;

          return {
            account: offer.Account,
            quantity: tokenAmount,
            pricePerUnit: xrpAmount / tokenAmount,
            totalXrp: xrpAmount,
            sequence: offer.Sequence,
          };
        })
        .filter((o): o is OrderBookEntry => o !== null)
        .sort((a, b) => a.pricePerUnit - b.pricePerUnit); // Lowest price first for sells

      // Process buy orders
      const buyOrders: OrderBookEntry[] = (buyResponse.result.offers || [])
        .map((offer) => {
          const tokenAmount =
            typeof offer.TakerGets === "object" && "value" in offer.TakerGets
              ? parseFloat(offer.TakerGets.value)
              : 0;

          const xrpDrops =
            typeof offer.TakerPays === "string"
              ? parseFloat(offer.TakerPays)
              : 0;
          const xrpAmount = xrpDrops / 1_000_000;

          if (tokenAmount <= 0 || xrpAmount <= 0) return null;

          return {
            account: offer.Account,
            quantity: tokenAmount,
            pricePerUnit: xrpAmount / tokenAmount,
            totalXrp: xrpAmount,
            sequence: offer.Sequence,
          };
        })
        .filter((o): o is OrderBookEntry => o !== null)
        .sort((a, b) => b.pricePerUnit - a.pricePerUnit); // Highest price first for buys

      // Calculate weighted average price from sell orders
      let weightedAvgPrice: number | null = null;
      if (sellOrders.length > 0) {
        const totalWeighted = sellOrders.reduce(
          (sum, o) => sum + o.pricePerUnit * o.quantity,
          0
        );
        const totalQuantity = sellOrders.reduce((sum, o) => sum + o.quantity, 0);
        weightedAvgPrice = totalWeighted / totalQuantity;
      }

      setData({
        sellOrders,
        buyOrders,
        weightedAvgPrice,
        lastUpdated: new Date(),
      });
    } catch (err) {
      console.error("Error fetching orderbook:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch orderbook");
    } finally {
      await client.disconnect();
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrderBook();
  }, [fetchOrderBook]);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatPrice = (price: number) => {
    return price.toFixed(8);
  };

  const formatQuantity = (qty: number) => {
    return qty.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <IconArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{TOKEN_CURRENCY}/XRP Order Book</h1>
              <p className="text-sm text-muted-foreground">
                Live orders from the XRP Ledger DEX
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BuyOrderDialog
              trigger={
                <Button size="sm" className="bg-green-600 hover:bg-green-700">
                  Buy Tokens
                </Button>
              }
            />
            <SellOrderDialog
              trigger={
                <Button size="sm" variant="destructive">
                  Sell Tokens
                </Button>
              }
            />
            <Button
              onClick={fetchOrderBook}
              disabled={isLoading}
              variant="outline"
              size="sm"
            >
              <IconRefresh
                className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        {/* Price Summary Card */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Market Summary</CardTitle>
            <CardDescription>
              {data.lastUpdated
                ? `Last updated: ${data.lastUpdated.toLocaleTimeString()}`
                : "Loading..."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Weighted Avg Price</p>
                <p className="text-2xl font-bold">
                  {data.weightedAvgPrice !== null
                    ? `${formatPrice(data.weightedAvgPrice)} XRP`
                    : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sell Orders</p>
                <p className="text-2xl font-bold text-red-500">
                  {data.sellOrders.length}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Buy Orders</p>
                <p className="text-2xl font-bold text-green-500">
                  {data.buyOrders.length}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Best Ask</p>
                <p className="text-2xl font-bold">
                  {data.sellOrders.length > 0
                    ? `${formatPrice(data.sellOrders[0].pricePerUnit)} XRP`
                    : "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="mb-6 border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Order Book Tables */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Sell Orders (Asks) */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Sell Orders{" "}
                  <Badge variant="destructive" className="ml-2">
                    Asks
                  </Badge>
                </CardTitle>
              </div>
              <CardDescription>
                People selling {TOKEN_CURRENCY} for XRP
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Price (XRP)</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Total (XRP)</TableHead>
                      <TableHead className="text-right">Account</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : data.sellOrders.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-muted-foreground"
                        >
                          No sell orders
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.sellOrders.map((order, index) => (
                        <TableRow key={`${order.account}-${order.sequence}`}>
                          <TableCell className="font-mono text-red-500">
                            {formatPrice(order.pricePerUnit)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatQuantity(order.quantity)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatQuantity(order.totalXrp)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {formatAddress(order.account)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Buy Orders (Bids) */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Buy Orders{" "}
                  <Badge
                    variant="outline"
                    className="ml-2 border-green-500 text-green-500"
                  >
                    Bids
                  </Badge>
                </CardTitle>
              </div>
              <CardDescription>
                People buying {TOKEN_CURRENCY} with XRP
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Price (XRP)</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Total (XRP)</TableHead>
                      <TableHead className="text-right">Account</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : data.buyOrders.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-muted-foreground"
                        >
                          No buy orders
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.buyOrders.map((order, index) => (
                        <TableRow key={`${order.account}-${order.sequence}`}>
                          <TableCell className="font-mono text-green-500">
                            {formatPrice(order.pricePerUnit)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatQuantity(order.quantity)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatQuantity(order.totalXrp)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {formatAddress(order.account)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Spread indicator */}
        {data.sellOrders.length > 0 && data.buyOrders.length > 0 && (
          <Card className="mt-6">
            <CardContent className="py-4">
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Best Bid</p>
                  <p className="text-lg font-bold text-green-500">
                    {formatPrice(data.buyOrders[0].pricePerUnit)} XRP
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Spread</p>
                  <p className="text-lg font-bold">
                    {formatPrice(
                      data.sellOrders[0].pricePerUnit -
                        data.buyOrders[0].pricePerUnit
                    )}{" "}
                    XRP
                  </p>
                  <p className="text-xs text-muted-foreground">
                    (
                    {(
                      ((data.sellOrders[0].pricePerUnit -
                        data.buyOrders[0].pricePerUnit) /
                        data.sellOrders[0].pricePerUnit) *
                      100
                    ).toFixed(2)}
                    %)
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Best Ask</p>
                  <p className="text-lg font-bold text-red-500">
                    {formatPrice(data.sellOrders[0].pricePerUnit)} XRP
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
