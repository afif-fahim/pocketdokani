import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  experimental: { proxyClientMaxBodySize: "34mb" },
  async rewrites() {
    const origin = process.env.API_ORIGIN || "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${origin}/api/:path*` }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "no-store" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      ],
    }];
  },
};
export default config;
