"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { getSupabase } from "@/lib/supabase/client";
import {
  usePostLoginPhase,
  FADE_DURATION,
} from "@/contexts/PostLoginPhaseContext";

const WELCOME_DURATION = 4;

export default function DashboardPage() {
  const router = useRouter();
  const { phase, setPhase } = usePostLoginPhase();
  const [firstname, setFirstname] = useState<string>("");
  const [authChecked, setAuthChecked] = useState(false);
  const welcomeRef = useRef<HTMLDivElement>(null);
  const welcomeHeadingRef = useRef<HTMLHeadingElement>(null);
  const signOutRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const animRunRef = useRef(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      router.replace("/");
      setAuthChecked(true);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/");
        setAuthChecked(true);
        return;
      }
      const name =
        user?.user_metadata?.given_name ||
        user?.user_metadata?.full_name?.split(" ")[0] ||
        "there";
      setFirstname(name);
      setPhase("welcome");
      setAuthChecked(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/");
      }
    });
    return () => subscription.unsubscribe();
  }, [router, setPhase]);

  // Same staggered character animation as apiXchange
  useEffect(() => {
    if (phase !== "welcome" || !firstname || animRunRef.current) return;
    const el = welcomeHeadingRef.current;
    if (!el?.children.length) return;
    animRunRef.current = true;
    const chars = Array.from(el.children);
    gsap.set(chars, { opacity: 0, y: 24 });
    gsap.to(chars, {
      opacity: 1,
      y: 0,
      duration: 2,
      stagger: 100 / 1000,
      ease: "power3.out",
    });
  }, [phase, firstname]);

  useEffect(() => {
    if (phase !== "welcome" || !firstname || startedRef.current) return;
    startedRef.current = true;
    const t = setTimeout(() => {
      setPhase("fading");
      const welcomeEl = welcomeRef.current;
      const signOutEl = signOutRef.current;
      if (welcomeEl) {
        gsap.to(welcomeEl, {
          opacity: 0,
          duration: FADE_DURATION,
          ease: "power2.inOut",
        });
      }
      if (signOutEl) {
        gsap.fromTo(
          signOutEl,
          { opacity: 0 },
          { opacity: 1, duration: FADE_DURATION, ease: "power2.inOut" }
        );
      }
      const t2 = setTimeout(() => {
        setPhase("done");
      }, FADE_DURATION * 1000);
      return () => clearTimeout(t2);
    }, WELCOME_DURATION * 1000);
    return () => clearTimeout(t);
  }, [phase, firstname, setPhase]);

  const handleSignOut = async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const showWelcome = phase === "welcome" || phase === "fading";
  const showSignOut = phase === "fading" || phase === "done";

  const welcomeText = firstname ? `Welcome Back ${firstname}!` : "";

  if (!authChecked || !firstname) {
    return null;
  }

  return (
    <>
      {showWelcome && firstname && (
        <div
          ref={welcomeRef}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "1rem",
            zIndex: 5,
            pointerEvents: "none",
          }}
        >
          <h1
            ref={welcomeHeadingRef}
            style={{
              fontFamily: "var(--font-geist-pixel-line)",
              fontSize: "clamp(2rem, 6vw, 4rem)",
              fontWeight: 500,
              letterSpacing: "-0.07em",
              lineHeight: 0.85,
              margin: 0,
              padding: "0.25rem 0",
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            {welcomeText.split("").map((char, i) => (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  ...(char === " " ? { minWidth: "0.25em" } : {}),
                }}
              >
                {char}
              </span>
            ))}
          </h1>
        </div>
      )}

      {showSignOut && firstname && (
        <div
          ref={signOutRef}
          style={{
            position: "fixed",
            bottom: "1.5rem",
            right: "1.5rem",
            zIndex: 10,
            opacity: phase === "done" ? 1 : 0,
          }}
        >
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              color: "#fff",
              backgroundColor: "#dc2626",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </>
  );
}
