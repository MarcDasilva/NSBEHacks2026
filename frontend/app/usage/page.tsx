"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Usage view is shown in the dashboard grid; redirect there. */
export default function UsagePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard?view=usage");
  }, [router]);
  return null;
}
