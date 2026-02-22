"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import LogoLoop from "@/components/LogoLoop";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./page.module.css";

const LOGO_LOOP_ITEMS = [
  { src: "/logoloop/image1.png", alt: "Image 1" },
  { src: "/logoloop/image2.png", alt: "Image 2" },
  { src: "/logoloop/gemini-white.png", alt: "Gemini" },
  { src: "/logoloop/openai-white.png", alt: "OpenAI" },
  { src: "/logoloop/claude-ai-white.png", alt: "Claude" },
  { src: "/logoloop/deepseek-white.png", alt: "DeepSeek" },
  { src: "/logoloop/microsoft-copilot.png", alt: "Microsoft Copilot" },
];

gsap.registerPlugin(useGSAP);

const colors = {
  keyword: "#c586c0",
  class: "#dcdcaa",
  string: "#9ece6a",
  comment: "#6a9955",
  variable: "#9cdcfe",
  number: "#b5cea8",
  builtin: "#4ec9b0",
  default: "#d4d4d4",
  punctuation: "#d4d4d4",
};

const PYTHON_KEYWORDS = new Set([
  "import",
  "from",
  "as",
  "def",
  "class",
  "if",
  "else",
  "elif",
  "for",
  "in",
  "return",
  "and",
  "or",
  "not",
  "True",
  "False",
  "None",
  "with",
  "try",
  "except",
  "finally",
  "raise",
  "pass",
  "break",
  "continue",
  "while",
  "lambda",
  "yield",
  "async",
  "await",
  "global",
  "nonlocal",
  "del",
  "is",
]);

const PYTHON_BUILTINS = new Set([
  "print",
  "range",
  "len",
  "str",
  "int",
  "float",
  "list",
  "dict",
  "set",
  "open",
  "type",
  "isinstance",
  "getattr",
  "setattr",
  "hasattr",
  "super",
  "property",
  "staticmethod",
  "classmethod",
  "next",
  "iter",
  "enumerate",
  "zip",
  "map",
  "filter",
  "sorted",
  "reversed",
  "sum",
  "min",
  "max",
  "abs",
  "round",
  "format",
]);

type Token = {
  type:
    | "keyword"
    | "string"
    | "comment"
    | "number"
    | "class"
    | "builtin"
    | "default";
  text: string;
};

function tokenizePythonLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = line.length;

  while (i < n) {
    // Double-quoted string
    if (line[i] === '"') {
      let end = i + 1;
      while (end < n && (line[end] !== '"' || line[end - 1] === "\\")) end++;
      tokens.push({ type: "string", text: line.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    // Single-quoted string
    if (line[i] === "'") {
      let end = i + 1;
      while (end < n && (line[end] !== "'" || line[end - 1] === "\\")) end++;
      tokens.push({ type: "string", text: line.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    // Comment
    if (line[i] === "#") {
      tokens.push({ type: "comment", text: line.slice(i) });
      break;
    }
    // Identifier or keyword
    if (/[a-zA-Z_]/.test(line[i])) {
      let end = i;
      while (end < n && /[a-zA-Z0-9_]/.test(line[end])) end++;
      const word = line.slice(i, end);
      if (PYTHON_KEYWORDS.has(word)) {
        tokens.push({ type: "keyword", text: word });
      } else if (PYTHON_BUILTINS.has(word)) {
        tokens.push({ type: "builtin", text: word });
      } else if (/^[A-Z][a-zA-Z0-9_]*$/.test(word)) {
        tokens.push({ type: "class", text: word });
      } else {
        tokens.push({ type: "default", text: word });
      }
      i = end;
      continue;
    }
    // Number
    if (/\d/.test(line[i])) {
      let end = i;
      while (end < n && /[\d.]/.test(line[end])) end++;
      tokens.push({ type: "number", text: line.slice(i, end) });
      i = end;
      continue;
    }
    tokens.push({ type: "default", text: line[i] });
    i++;
  }
  return tokens;
}

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || "http://18.209.63.122:3000";
const proxyPath = `${PROXY_URL}${PROXY_URL.endsWith("/") ? "" : "/"}proxy`;

const GEMINI_CODE = `const proxyUrl = "${proxyPath}";
const targetUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";
const apiKey = "<your api key>"
const payload = {contents: [parts: [{text: "Explain how AI works in a few words"}]}]};

const url = \`\${proxyUrl}?api_type=google&target=\${encodeURIComponent(targetUrl)}\`;

const response = await fetch(url, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-goog-api-key": apiKey
    },
    body: JSON.stringify(payload)
});`;

const OPENAI_CODE = `const url = "https://api.openai.com/v1/responses";
const apiKey = "<your proxy key>";
const payload = {
    model: "gpt-5-nano",
    input: "write a haiku about ai",
    store: true
};

const response = await fetch("${proxyPath}?api_type=openai&target=" + encodeURIComponent(url), {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${apiKey}\`,
        "Accept": "application/json"
    },
    body: JSON.stringify(payload)
});`;

const ANTHROPIC_CODE = `const url = "https://api.anthropic.com/v1/messages";
const apiKey = "<your proxy key>";

const payload = {
    model: "claude-3-haiku-20240307",
    max_tokens: 100,
    messages: [{ role: "user", content: "write a haiku about ai" }]
};

const response = await fetch(
    "${proxyPath}?api_type=anthropic&target=" + encodeURIComponent(url),
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Accept": "application/json"
        },
        body: JSON.stringify(payload)
    }
);`;

const PROVIDERS = [
  { id: "gemini" as const, logo: "/gemini-color.png", code: GEMINI_CODE },
  { id: "openai" as const, logo: "/openai-white.png", code: OPENAI_CODE },
  {
    id: "anthropic" as const,
    logo: "/claude-color.png",
    code: ANTHROPIC_CODE,
  },
];

function useLogoHeight() {
  const [height, setHeight] = useState(44);
  useEffect(() => {
    const update = () => {
      if (typeof window === "undefined") return;
      const w = window.innerWidth;
      if (w >= 1024) setHeight(40);
      else if (w >= 768) setHeight(44);
      else setHeight(36);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return height;
}

export default function Home() {
  const [activeProvider, setActiveProvider] =
    useState<(typeof PROVIDERS)[number]["id"]>("gemini");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const logoHeight = useLogoHeight();

  const handleSignInWithGoogle = async () => {
    setAuthError(null);
    const supabase = getSupabase();
    if (!supabase) {
      setAuthError(
        "Sign-in not configured. In frontend/.env set NEXT_PUBLIC_SUPABASE_URL to your project URL (https://xxxx.supabase.co) and NEXT_PUBLIC_SUPABASE_ANON_KEY to your anon key. Restart the dev server.",
      );
      return;
    }
    setAuthLoading(true);
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    setAuthLoading(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    // Success: Supabase redirects to Google, so we don't need to do anything here
  };

  const apixchangeRef = useRef<HTMLHeadingElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  const logoLoopRef = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const el = apixchangeRef.current;
    const rest = restRef.current;
    const logoLoop = logoLoopRef.current;
    if (!el?.children.length) return;
    if (rest) gsap.set(rest, { opacity: 0, y: 24 });
    if (logoLoop) gsap.set(logoLoop, { opacity: 0, y: 24 });
    const chars = Array.from(el.children);
    const tl = gsap.timeline();
    tl.fromTo(
      chars,
      { opacity: 0, y: 24 },
      {
        opacity: 1,
        y: 0,
        duration: 2,
        stagger: 100 / 1000,
        ease: "power3.out",
      },
    );
    const fadeInPosition = "-=1.2";
    if (rest) {
      tl.to(
        rest,
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
        fadeInPosition,
      );
    }
    if (logoLoop) {
      tl.to(
        logoLoop,
        { opacity: 0.88, y: 0, duration: 0.8, ease: "power3.out" },
        rest ? "<" : fadeInPosition,
      );
    }
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: "10rem",
        left: "50%",
        transform: "translateX(-50%)",
        textAlign: "center",
        pointerEvents: "none",
        width: "100%",
        maxWidth: "42rem",
        padding: "0 1rem",
        zIndex: 1,
      }}
    >
      <div style={{ pointerEvents: "none" }}>
        {/* Flex column-reverse: h1 is in DOM first so it sets width, logo appears above it */}
        <div
          style={{
            display: "flex",
            flexDirection: "column-reverse",
            alignItems: "center",
            textAlign: "center",
            width: "100%",
          }}
        >
          <h1
            ref={apixchangeRef}
            style={{
              fontFamily: "var(--font-geist-pixel-line)",
              fontSize: "clamp(4rem, 12vw, 9rem)",
              fontWeight: 500,
              letterSpacing: "-0.07em",
              lineHeight: 0.85,
              margin: 0,
              padding: "0.25rem 0",
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            {"apiXchange".split("").map((char, i) => (
              <span key={i} style={{ display: "inline-block" }}>
                {char}
              </span>
            ))}
          </h1>
          <div
            ref={logoLoopRef}
            style={{
              width: "100%",
              maxWidth: "100%",
              overflow: "hidden",
              marginBottom: "0.25rem",
              marginTop: "-4rem",
              flexShrink: 0,
            }}
          >
            <LogoLoop
              logos={LOGO_LOOP_ITEMS}
              width="100%"
              logoHeight={logoHeight}
              gap={32}
              speed={35}
              direction="left"
              ariaLabel="Partner logos"
              style={{ overflow: "hidden" }}
            />
          </div>
        </div>
        <div ref={restRef} style={{ pointerEvents: "auto" }}>
          <p
            style={{
              fontFamily: "var(--font-geist-pixel-grid)",
              fontSize: "clamp(1.15rem, 4vw, 1.9rem)",
              fontWeight: 500,
              letterSpacing: "0.02em",
              lineHeight: 1.2,
              margin: "0.35rem 0 0",
              color: "rgba(255, 255, 255, 0.7)",
            }}
          >
            <span className={styles.subtitleLine1}>
              decentralized marketplace for
            </span>
            <span className={styles.subtitleLine2}>
              {" "}
              idle keys to become active revenue
            </span>
          </p>
          <div
            className={styles.sdkWindow}
            style={{
              marginTop: "1.25rem",
              marginLeft: "auto",
              marginRight: "auto",
              border: "1px solid rgba(255, 255, 255, 0.35)",
              overflow: "hidden",
              textAlign: "left",
              boxSizing: "border-box",
              pointerEvents: "auto",
            }}
          >
            {/* Header: traffic lights + title + JavaScript pill */}
            <div className={styles.sdkHeader}>
              <div style={{ display: "flex", gap: 5 }}>
                <span
                  className={styles.sdkTraffic}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: "#ff5f57",
                  }}
                />
                <span
                  className={styles.sdkTraffic}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: "#febc2e",
                  }}
                />
                <span
                  className={styles.sdkTraffic}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: "#28c840",
                  }}
                />
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  padding: "0.15rem 0.4rem",
                  borderRadius: 5,
                  backgroundColor: "rgba(255,255,255,0.15)",
                  fontFamily: "var(--font-geist-sans)",
                  fontSize: "0.6rem",
                  color: "#fff",
                  fontWeight: 500,
                }}
              >
                JavaScript
              </div>
            </div>

            {/* Code area */}
            <div className={styles.sdkCode}>
              <PythonCodeBlock
                code={
                  PROVIDERS.find((p) => p.id === activeProvider)?.code ?? ""
                }
              />
            </div>

            {/* USE IT WITH footer */}
            <div className={styles.sdkFooter}>
              <span
                style={{
                  fontFamily: "var(--font-geist-sans)",
                  fontSize: "0.55rem",
                  color: "rgba(255,255,255,0.5)",
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                }}
              >
                USE IT WITH
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {PROVIDERS.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => setActiveProvider(provider.id)}
                    className={[styles.sdkIcon, styles.sdkIconBtn].join(" ")}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      backgroundColor:
                        activeProvider === provider.id
                          ? "rgba(255,255,255,0.2)"
                          : "rgba(255,255,255,0.1)",
                      border:
                        activeProvider === provider.id
                          ? "1px solid rgba(255,255,255,0.4)"
                          : "1px solid rgba(255,255,255,0.15)",
                      padding: 0,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    <Image
                      src={provider.logo}
                      alt={provider.id}
                      width={14}
                      height={14}
                      style={{ objectFit: "contain" }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sign in with Google */}
          <div style={{ marginTop: "1.5rem" }}>
            <button
              type="button"
              onClick={handleSignInWithGoogle}
              disabled={authLoading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "1.25rem",
                width: "100%",
                maxWidth: "20rem",
                padding: "0.6rem 1.25rem",
                backgroundColor: "rgba(255, 255, 255, 0.85)",
                color: "#000",
                border: "none",
                borderRadius: 8,
                fontFamily: "var(--font-geist-pixel-square)",
                fontSize: "1.15rem",
                fontWeight: 700,
                cursor: authLoading ? "wait" : "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                opacity: authLoading ? 0.8 : 1,
              }}
            >
              <GoogleLogoIcon />
              {authLoading ? "Redirecting…" : "Sign in with Google"}
            </button>
            {authError && (
              <p
                style={{
                  marginTop: "0.75rem",
                  fontFamily: "var(--font-geist-sans)",
                  fontSize: "0.9rem",
                  color: "#f87171",
                  maxWidth: "20rem",
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              >
                {authError}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleLogoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#000"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#000"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#000"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#000"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function CodeLine({
  num,
  children,
}: {
  num: number;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex" }}>
      <span
        className={styles.sdkLineNum}
        style={{
          display: "inline-block",
          width: "1.75em",
          marginRight: "0.75rem",
          color: "#6e7681",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        {num}
      </span>
      <span>{children}</span>
    </div>
  );
}

function PythonCodeBlock({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <>
      {lines.map((line, index) => {
        const tokens = tokenizePythonLine(line);
        return (
          <CodeLine key={index} num={index + 1}>
            {tokens.map((t, i) => {
              const color =
                t.type === "keyword"
                  ? colors.keyword
                  : t.type === "string"
                    ? colors.string
                    : t.type === "comment"
                      ? colors.comment
                      : t.type === "number"
                        ? colors.number
                        : t.type === "class"
                          ? colors.class
                          : t.type === "builtin"
                            ? colors.builtin
                            : colors.default;
              return (
                <span key={i} style={{ color }}>
                  {t.text}
                </span>
              );
            })}
          </CodeLine>
        );
      })}
    </>
  );
}

function Keyword({ children }: { children: React.ReactNode }) {
  return <span style={{ color: colors.keyword }}>{children}</span>;
}
