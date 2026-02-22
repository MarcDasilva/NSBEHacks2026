"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Order Book is shown in the dashboard grid; redirect there. */
export default function OrderBookPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard?view=orderbook");
  }, [router]);
  return null;
}
