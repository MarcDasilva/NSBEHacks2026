"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { getSupabase } from "@/lib/supabase/client";
import {
  usePostLoginPhase,
  FADE_DURATION,
} from "@/contexts/PostLoginPhaseContext";
import { AppSidebar } from "@/components/app-sidebar";
import { BrowseApisView } from "@/components/browse-apis-view";
import { DashboardFlowView } from "@/components/dashboard-flow-view";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const WELCOME_DURATION = 3.5;

type UserInfo = {
  name: string;
  email: string;
  avatar: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const { phase, setPhase } = usePostLoginPhase();
  const [firstname, setFirstname] = useState<string>("");
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const welcomeRef = useRef<HTMLDivElement>(null);
  const welcomeHeadingRef = useRef<HTMLHeadingElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);
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
      setUserInfo({
        name:
          user?.user_metadata?.full_name ||
          user?.user_metadata?.given_name ||
          name,
        email: user?.email ?? "",
        avatar: user?.user_metadata?.avatar_url || "",
      });
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
      if (welcomeEl) {
        gsap.to(welcomeEl, {
          opacity: 0,
          duration: FADE_DURATION,
          ease: "power2.inOut",
        });
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
  const showDashboard = phase === "done" && userInfo;
  const [mainView, setMainView] = useState<"browse" | "dashboard">("browse");

  // Fade up dashboard when it mounts (phase === "done"), same style as landing page
  useEffect(() => {
    if (phase !== "done" || !dashboardRef.current) return;
    const el = dashboardRef.current;
    gsap.fromTo(
      el,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 1.4, ease: "power3.out" },
    );
  }, [phase]);

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

      {showDashboard && userInfo && (
        <div
          ref={dashboardRef}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10,
            opacity: 0,
            minHeight: "100vh",
            width: "100%",
          }}
        >
          <SidebarProvider
            className="bg-transparent! h-svh overflow-hidden"
            style={
              {
                "--sidebar-width": "calc(var(--spacing) * 72)",
                "--header-height": "calc(var(--spacing) * 12)",
              } as React.CSSProperties
            }
          >
            <AppSidebar
              user={userInfo}
              onLogout={handleSignOut}
              onAccountSaved={(updates) =>
                setUserInfo((prev) =>
                  prev
                    ? { ...prev, name: updates.name, avatar: updates.avatar }
                    : null,
                )
              }
              onNavigate={setMainView}
              variant="inset"
            />
            <SidebarInset className="bg-transparent min-h-0 flex flex-1 flex-col overflow-hidden">
              <SiteHeader
                title={mainView === "browse" ? "Browse APIs" : "Connections"}
              />
              {mainView === "browse" ? (
                <BrowseApisView />
              ) : (
                <div className="flex min-h-0 min-w-0 flex-1">
                  <DashboardFlowView />
                </div>
              )}
            </SidebarInset>
          </SidebarProvider>
        </div>
      )}
    </>
  );
}
