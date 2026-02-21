"use client";

import { createContext, useContext, useState } from "react";
import FaultyTerminalBackground from "@/components/FaultyTerminalBackground";

export type PostLoginPhase = null | "welcome" | "fading" | "done";

const PostLoginPhaseContext = createContext<{
  phase: PostLoginPhase;
  setPhase: (p: PostLoginPhase) => void;
}>({ phase: null, setPhase: () => {} });

export function usePostLoginPhase() {
  return useContext(PostLoginPhaseContext);
}

export const FADE_DURATION = 1.5;

export function PostLoginPhaseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [phase, setPhase] = useState<PostLoginPhase>(null);

  return (
    <PostLoginPhaseContext.Provider value={{ phase, setPhase }}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
        }}
      >
        <FaultyTerminalBackground />
      </div>
      {children}
    </PostLoginPhaseContext.Provider>
  );
}
