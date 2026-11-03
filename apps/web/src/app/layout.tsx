import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import "@/app/app-shell.css";

export const metadata: Metadata = {
  title: "PocketDokani · Your shop, from chat to courier",
  description:
    "A Bangla AI copilot for online sellers. Bring orders from social chats or phone calls, check parcels and ask about your shop, with you in control.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#193d32",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
