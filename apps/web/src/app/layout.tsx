import type { Metadata, Viewport } from "next";
import { Anek_Bangla, Hind_Siliguri, IBM_Plex_Mono } from "next/font/google";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/landing.css";
import "@/styles/shell.css";
import "@/styles/orders.css";
import "@/styles/draft.css";
import "@/styles/pack.css";
import "@/styles/assistant.css";
import { themeStorageKey } from "@/lib/theme";

const display = Anek_Bangla({
  subsets: ["bengali", "latin"],
  variable: "--font-display",
  display: "swap",
});
const body = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const ledger = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ledger",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PocketDokani · Your shop, from chat to courier",
  description:
    "A Bangla AI copilot for online sellers. Bring orders from social chats or phone calls, check parcels and ask about your shop, with you in control.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f2e7" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1510" },
  ],
  colorScheme: "light",
};

const restoreTheme = `try {
  const theme = localStorage.getItem("${themeStorageKey}");
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
} catch {}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${ledger.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: restoreTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
