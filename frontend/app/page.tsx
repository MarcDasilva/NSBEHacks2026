"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import LogoLoop from "@/components/LogoLoop";
import styles from "./page.module.css";

const LOGO_LOOP_ITEMS = [
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

const GEMINI_CODE = `import google.generativeai as genai

genai.configure(api_key="YOUR_GEMINI_API_KEY")

model = genai.GenerativeModel("gemini-1.5-pro")

response = model.generate_content(
    "Explain how decentralized marketplaces work in simple terms.")

print(response.text)`;

const OPENAI_CODE = `from openai import OpenAI

client = OpenAI(api_key="YOUR_OPENAI_API_KEY")

response = client.chat.completions.create(
    model="gpt-4o-mini",  # or gpt-4.1
    messages=[
        {"role": "user", "content": "Explain how decentralized marketplaces work in simple terms."}],)

print(response.choices[0].message.content)`;

const ANTHROPIC_CODE = `import anthropic

client = anthropic.Anthropic(api_key="YOUR_ANTHROPIC_API_KEY")

response = client.messages.create(
    model="claude-3-haiku-20240307",  # or claude-3-sonnet
    messages=[ {"role": "user", "content": "Explain how decentralized marketplaces work in simple terms."}],)

print(response.content[0].text)`;

const PROVIDERS = [
  { id: "gemini" as const, logo: "/gemini-color.png", code: GEMINI_CODE },
  { id: "openai" as const, logo: "/openai-white.png", code: OPENAI_CODE },
  {
    id: "anthropic" as const,
    logo: "/claude-color.png",
    code: ANTHROPIC_CODE,
  },
];

export default function Home() {
  const [activeProvider, setActiveProvider] =
    useState<(typeof PROVIDERS)[number]["id"]>("gemini");

  const apixchangeRef = useRef<HTMLHeadingElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const el = apixchangeRef.current;
    const rest = restRef.current;
    if (!el?.children.length) return;
    if (rest) gsap.set(rest, { opacity: 0, y: 24 });
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
    if (rest) {
      tl.to(
        rest,
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
        "-=1.2",
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
      }}
    >
      <div style={{ pointerEvents: "none" }}>
        <div style={{ display: "inline-block", textAlign: "center" }}>
          <div
            style={{
              width: "100%",
              overflow: "hidden",
              marginBottom: "0.75rem",
            }}
          >
            <LogoLoop
              logos={LOGO_LOOP_ITEMS}
              width="100%"
              logoHeight={28}
              gap={32}
              speed={80}
              direction="left"
              fadeOut
              fadeOutColor="#0d0d0d"
              ariaLabel="Partner logos"
            />
          </div>
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
        </div>
        <div ref={restRef}>
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
              marginTop: "2rem",
              marginLeft: "auto",
              marginRight: "auto",
              border: "1px solid rgba(255, 255, 255, 0.35)",
              overflow: "hidden",
              textAlign: "left",
              boxSizing: "border-box",
              pointerEvents: "auto",
            }}
          >
            {/* Header: traffic lights + title + Python pill */}
            <div className={styles.sdkHeader}>
              <div style={{ display: "flex", gap: 5 }}>
                <span
                  className={styles.sdkTraffic}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: "#ff5f57",
                  }}
                />
                <span
                  className={styles.sdkTraffic}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: "#febc2e",
                  }}
                />
                <span
                  className={styles.sdkTraffic}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: "#28c840",
                  }}
                />
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  padding: "0.2rem 0.5rem",
                  borderRadius: 6,
                  backgroundColor: "rgba(255,255,255,0.15)",
                  fontFamily: "var(--font-geist-sans)",
                  fontSize: "0.7rem",
                  color: "#fff",
                  fontWeight: 500,
                }}
              >
                Python
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
                  fontSize: "0.65rem",
                  color: "rgba(255,255,255,0.5)",
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                }}
              >
                USE IT WITH
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {PROVIDERS.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => setActiveProvider(provider.id)}
                    className={`${styles.sdkIcon} ${styles.sdkIconBtn}`}
                    style={{
                      width: 30,
                      height: 30,
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
                      width={18}
                      height={18}
                      style={{ objectFit: "contain" }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
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
          width: "2em",
          marginRight: "1rem",
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
