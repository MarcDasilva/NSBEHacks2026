import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import {
  GeistPixelSquare,
  GeistPixelGrid,
  GeistPixelCircle,
  GeistPixelTriangle,
  GeistPixelLine,
} from "geist/font/pixel";
import { PostLoginPhaseProvider } from "@/contexts/PostLoginPhaseContext";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable} ${GeistPixelGrid.variable} ${GeistPixelCircle.variable} ${GeistPixelTriangle.variable} ${GeistPixelLine.variable}`}
      style={{ backgroundColor: "#0d0d0d" }}
    >
      <body
        className={`${GeistSans.className} ${GeistMono.variable}`}
        style={{
          margin: 0,
          overflow: "hidden",
          position: "relative",
          backgroundColor: "#0d0d0d",
        }}
      >
        <PostLoginPhaseProvider>
          <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
        </PostLoginPhaseProvider>
      </body>
    </html>
  );
}
